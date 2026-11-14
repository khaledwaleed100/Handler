import { timingSafeEqual } from 'crypto';
import Match from '../models/Match.js';
import Player from '../models/Player.js';
import { httpError } from '../utils/httpError.js';
import { finalizeDueMatches, rsvpLists } from '../services/matchService.js';
import { notifyPlayers } from '../services/pushService.js';

/**
 * Scheduled jobs: reminders and closing rating rounds.
 *
 * Render's free tier sleeps, so nothing can run on a timer inside the server.
 * Instead, a free scheduler (for example cron-job.org) calls
 *   POST /api/cron/tick   with header  x-cron-secret: <CRON_SECRET>
 * every 15-30 minutes. That also keeps the server awake on match days.
 */
const authorized = (req) => {
    const expected = process.env.CRON_SECRET;
    const given = req.get('x-cron-secret') || '';
    if (!expected || expected.length < 16) return false;
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
};

const HOUR = 3600 * 1000;

// @route POST /api/cron/tick
export const tick = async (req, res) => {
    if (!authorized(req)) throw httpError(401, 'Not authorized');

    const finalized = await finalizeDueMatches();
    const now = Date.now();
    let reminders = 0;

    const soon = await Match.find({ status: 'upcoming', kickoff: { $gt: new Date(now), $lte: new Date(now + 26 * HOUR) } });
    for (const m of soon) {
        const msLeft = new Date(m.kickoff) - now;
        const lists = rsvpLists(m);

        if (!m.remindersSent.dayBefore && msLeft <= 24 * HOUR && msLeft > 3 * HOUR) {
            m.remindersSent.dayBefore = true;
            const unanswered = await unansweredPlayers(m);
            await notifyPlayers(lists.confirmed, { title: 'Match tomorrow ⚽', body: `${m.place}. Still in?`, url: `/matches/${m._id}` });
            if (lists.confirmed.length < m.capacity) {
                await notifyPlayers([...unanswered, ...lists.maybe], {
                    title: `${m.capacity - lists.confirmed.length} spots left`,
                    body: `${m.place} tomorrow. Are you in?`,
                    url: `/matches/${m._id}`
                });
            }
            reminders++;
        }
        if (!m.remindersSent.twoHours && msLeft <= 2 * HOUR) {
            m.remindersSent.twoHours = true;
            await notifyPlayers(lists.confirmed, { title: 'Kick-off in 2 hours', body: `${m.place}. Don't be late 😉`, url: `/matches/${m._id}` });
            reminders++;
        }
        await m.save();
    }

    res.json({ ok: true, finalized, reminders });
};

const unansweredPlayers = async (match) => {
    const answered = new Set(match.rsvps.map(r => String(r.player)));
    const all = await Player.find().select('_id').lean();
    return all.map(p => String(p._id)).filter(id => !answered.has(id));
};
