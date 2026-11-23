/**
 * Things the app does by itself, on a timer:
 *   - Weekly repeat: when a repeating match kicks off, next week's match is created.
 *   - Reminders: the day before (everyone) and about 2 hours before (confirmed players).
 *   - Result reminders: the organizer is asked for a missing result 2 hours after kick-off,
 *     and once more about a day later, so the history stays complete.
 *
 * There is no separate worker. runDueJobs() is called every few minutes while the
 * server is awake, and whenever someone opens the app or a monitor pings /health,
 * so a sleeping free server catches up as soon as it wakes.
 */
import Match from '../models/Match.js';
import Player from '../models/Player.js';
import User from '../models/User.js';
import { getSettings } from '../models/Settings.js';
import { formatKickoff, rsvpLists } from './matchService.js';
import { notifyEveryone, notifyPlayers, notifyUsers } from './pushService.js';
import { broadcast } from './eventsService.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const displayZone = () => process.env.TZ_DISPLAY || 'Africa/Cairo';

/** How far the zone's clock is ahead of UTC at that moment, in ms. */
const zoneOffsetMs = (date, timeZone) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(date).map(x => [x.type, x.value]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
};

/** Seven days later at the same time on the clock, even when summer time starts or ends in between. */
export const sameTimeNextWeek = (date, timeZone = displayZone()) => {
    const next = new Date(date.getTime() + 7 * DAY);
    return new Date(next.getTime() + zoneOffsetMs(date, timeZone) - zoneOffsetMs(next, timeZone));
};

/** Creates next week's match for every repeating match that has kicked off. Returns how many were created. */
export const spawnRecurringMatches = async (now = new Date()) => {
    const due = await Match.find({ repeatWeekly: true, repeatSpawned: { $ne: true }, kickoff: { $lte: now } });
    let created = 0;
    for (const match of due) {
        // Claim it first, so two requests arriving together can't both create next week's match.
        const claimed = await Match.updateOne({ _id: match._id, repeatSpawned: { $ne: true } }, { $set: { repeatSpawned: true } });
        if (!claimed.modifiedCount) continue;

        // If the server was off for weeks, skip straight to the next date that is still ahead.
        let kickoff = sameTimeNextWeek(match.kickoff);
        while (kickoff <= now) kickoff = sameTimeNextWeek(kickoff);

        const next = await Match.create({
            createdBy: match.createdBy, place: match.place, mapUrl: match.mapUrl, capacity: match.capacity,
            kickoff, repeatWeekly: true
        });
        created++;
        notifyEveryone({
            title: 'New match ⚽',
            body: `${next.place} · ${formatKickoff(next.kickoff)}. Are you in?`,
            url: `/matches/${next._id}`
        }).catch(() => {});
    }
    return created;
};

/** Records that a reminder went out; false if it was already sent (so it is never sent twice). */
const claimReminder = async (match, kind, recipients) => {
    const res = await Match.updateOne(
        { _id: match._id, 'notifications.kind': { $ne: kind } },
        { $push: { notifications: { kind, at: new Date(), recipients } } }
    );
    return res.modifiedCount > 0;
};

/** Sends the reminders that are due right now. Returns how many reminder rounds went out. */
export const sendDueReminders = async (now = new Date()) => {
    if ((await getSettings()).autoReminders === false) return 0;
    const matches = await Match.find({ status: 'upcoming', kickoff: { $gt: new Date(+now + 15 * MIN), $lte: new Date(+now + DAY) } });
    if (!matches.length) return 0;

    const everyone = (await Player.find().select('_id').lean()).map(p => String(p._id));
    let sent = 0;
    for (const match of matches) {
        const untilKickoff = match.kickoff - now;
        const lists = rsvpLists(match);
        const url = `/matches/${match._id}`;
        const when = formatKickoff(match.kickoff);

        if (untilKickoff <= 2 * HOUR) {
            // About two hours to go: only the people playing, on their phone.
            if (!lists.confirmed.length || !(await claimReminder(match, 'auto2', lists.confirmed.length))) continue;
            await notifyPlayers(lists.confirmed, { title: `⏱ Kick-off soon: ${when}`, body: `${match.place}. Don't be late!`, url });
            sent++;
        } else if (untilKickoff > 3 * HOUR && now - match.createdAt > 2 * HOUR) {
            // The day before. Skipped for a match created moments ago: "New match" was just sent.
            const playing = [...lists.confirmed, ...lists.waitlist];
            const answered = new Set([...playing, ...lists.out]);
            const undecided = everyone.filter(id => !answered.has(id));
            if (!(await claimReminder(match, 'auto24', playing.length + undecided.length))) continue;
            const title = `⚽ Reminder: ${match.place} · ${when}`;
            await notifyPlayers(lists.confirmed, { title, body: "You're in. See you there!", url }, { email: true });
            await notifyPlayers(lists.waitlist, { title, body: "You're on the waitlist. We'll tell you if a spot opens.", url }, { email: true });
            await notifyPlayers(undecided, { title, body: `${lists.confirmed.length}/${match.capacity} in so far. Are you in? Tap to answer.`, url }, { email: true });
            sent++;
        }
    }
    return sent;
};

/** Asks the organizer for results still missing after kick-off. Returns how many reminders went out. */
export const sendResultReminders = async (now = new Date()) => {
    if ((await getSettings()).autoReminders === false) return 0;
    // Only the last week: an old backlog shouldn't turn into a burst of messages.
    const matches = await Match.find({
        status: 'upcoming',
        kickoff: { $gte: new Date(+now - 7 * DAY), $lte: new Date(+now - 2 * HOUR) }
    });
    if (!matches.length) return 0;
    const organizers = (await User.find({ role: 'organizer' }).select('_id').lean()).map(u => u._id);
    let sent = 0;
    for (const match of matches) {
        const first = match.notifications.find(n => n.kind === 'result1');
        const kind = !first ? 'result1' : now - new Date(first.at) >= 20 * HOUR ? 'result2' : null;
        if (!kind || !(await claimReminder(match, kind, organizers.length))) continue;
        await notifyUsers(organizers, {
            title: `📝 Enter the result: ${match.place}`,
            body: `${formatKickoff(match.kickoff)}. Add the score so the history and ratings stay complete.`,
            url: `/matches/${match._id}?tab=result`
        }, { email: true });
        sent++;
    }
    return sent;
};

let lastRun = 0;
let running = null;

/** Runs both jobs, at most once a minute unless forced. Never throws: a failed job must not break a page load. */
export const runDueJobs = async ({ force = false } = {}) => {
    if (running) return running;
    if (!force && Date.now() - lastRun < MIN) return { spawned: 0, reminders: 0, results: 0 };
    lastRun = Date.now();
    running = (async () => {
        try {
            const spawned = await spawnRecurringMatches();
            if (spawned) broadcast('matches');
            const reminders = await sendDueReminders();
            const results = await sendResultReminders();
            return { spawned, reminders, results };
        } catch (err) {
            console.error('Scheduled jobs failed:', err.message);
            return { spawned: 0, reminders: 0, results: 0 };
        } finally {
            running = null;
        }
    })();
    return running;
};
