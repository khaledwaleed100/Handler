/**
 * Match lifecycle rules: replies (in / out / maybe), the waitlist, results,
 * and the post-match rating round. No Express objects here.
 */
import Match from '../models/Match.js';
import Player from '../models/Player.js';
import { getSettings } from '../models/Settings.js';
import { assignRatings } from './ratingService.js';
import { recomputeStandings } from './standingsService.js';
import { notifyPlayers } from './pushService.js';

const LATE_DROP_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Who is confirmed, waiting, maybe or out. "In" replies beyond capacity go
 * on the waitlist in the order they replied.
 */
export const rsvpLists = (match) => {
    const ins = match.rsvps.filter(r => r.status === 'in').sort((a, b) => new Date(a.at) - new Date(b.at));
    return {
        confirmed: ins.slice(0, match.capacity).map(r => String(r.player)),
        waitlist: ins.slice(match.capacity).map(r => String(r.player)),
        maybe: match.rsvps.filter(r => r.status === 'maybe').map(r => String(r.player)),
        out: match.rsvps.filter(r => r.status === 'out').map(r => String(r.player))
    };
};

/**
 * Sets a player's reply. Records a "late drop-out" when a confirmed player
 * pulls out within 24 hours of kick-off, and tells whoever moves up from the
 * waitlist that they're in.
 */
export const setRsvp = async (match, playerId, status) => {
    const id = String(playerId);
    const before = rsvpLists(match);
    const wasConfirmed = before.confirmed.includes(id);

    const existing = match.rsvps.find(r => String(r.player) === id);
    if (existing) {
        if (existing.status !== status) {
            existing.status = status;
            existing.at = new Date(); // changing your mind puts you at the back of the queue
        }
    } else {
        match.rsvps.push({ player: id, status, at: new Date() });
    }

    const msToKickoff = new Date(match.kickoff) - Date.now();
    if (wasConfirmed && status !== 'in' && msToKickoff < LATE_DROP_WINDOW_MS && msToKickoff > -LATE_DROP_WINDOW_MS) {
        match.lateDrops.push({ player: id, at: new Date() });
    }

    // Someone leaving a published team leaves a hole: unpublish so the organizer re-checks.
    if (status !== 'in' && [...match.teamA, ...match.teamB].some(p => String(p) === id)) {
        match.teamA = match.teamA.filter(p => String(p) !== id);
        match.teamB = match.teamB.filter(p => String(p) !== id);
    }

    await match.save();

    const after = rsvpLists(match);
    const promoted = after.confirmed.filter(p => !before.confirmed.includes(p) && p !== id);
    if (promoted.length) {
        notifyPlayers(promoted, {
            title: "You're in! ⚽",
            body: `A spot opened up for ${match.place}.`,
            url: `/matches/${match._id}`
        }, { email: true }).catch(() => {});
    }
    return after;
};

/**
 * Saves the result and starts the rating round. Safe to call again to correct
 * a result: everything is recomputed from scratch.
 */
export const completeMatch = async (match, { score, stats }) => {
    const firstTime = match.status !== 'completed';
    const settings = await getSettings();

    match.score = score;
    match.stats = stats;
    match.status = 'completed';
    match.teamsPublished = true;

    if (firstTime) {
        match.completedAt = new Date();
        const played = [...match.teamA, ...match.teamB].map(String);
        const noShows = new Set(match.attendance.filter(a => a.state === 'no_show').map(a => String(a.player)));
        const raters = played.filter(p => !noShows.has(p));
        match.ratingAssignments = assignRatings(raters, 4).map(a => ({ ...a, done: false }));
        match.ratingsClosesAt = new Date(Date.now() + settings.ratingWindowHours * 3600 * 1000);
        match.ratingsFinalized = raters.length < 2;
    }

    await match.save();
    await recomputeStandings();

    if (firstTime && match.ratingAssignments.length) {
        notifyPlayers(match.ratingAssignments.map(a => String(a.rater)), {
            title: 'Rate your teammates',
            body: 'Takes about 30 seconds. Your answers stay anonymous.',
            url: `/matches/${match._id}/rate`
        }).catch(() => {});
    }
    return match;
};

/** Closes the rating round: picks the MVP and feeds the ratings into everyone's numbers. */
export const finalizeRatings = async (match, { recompute = true } = {}) => {
    if (match.ratingsFinalized) return match;

    const votes = new Map();
    for (const v of match.mvpVotes) votes.set(String(v.for), (votes.get(String(v.for)) || 0) + 1);
    if (votes.size) {
        const contribution = (id) => {
            const s = match.stats.find(x => String(x.player) === id);
            return s ? s.goals + s.assists : 0;
        };
        const [winner] = [...votes.entries()].sort((a, b) => b[1] - a[1] || contribution(b[0]) - contribution(a[0]));
        match.mvp = winner[0];
    }
    match.ratingsFinalized = true;
    await match.save();
    if (recompute) await recomputeStandings();
    return match;
};

/** Finalizes every match whose rating window has passed. Called lazily whenever someone opens Home or Matches. */
export const finalizeDueMatches = async () => {
    const due = await Match.find({
        status: 'completed',
        ratingsFinalized: false,
        ratingsClosesAt: { $lte: new Date() }
    });
    if (!due.length) return 0;
    for (const m of due) await finalizeRatings(m, { recompute: false });
    await recomputeStandings();
    return due.length;
};

/** Player teams from the last few completed matches, for the balancer's variety rule. */
export const recentTeams = async (limit = 3) => {
    const last = await Match.find({ status: 'completed' }).sort({ kickoff: -1 }).limit(limit).select('teamA teamB').lean();
    return last.flatMap(m => [m.teamA.map(String), m.teamB.map(String)]);
};

/** Late = arrived after kick-off plus the group's grace period. */
export const checkIn = async (match, playerId, state, arrivedAt = new Date()) => {
    const settings = await getSettings();
    const id = String(playerId);
    match.attendance = match.attendance.filter(a => String(a.player) !== id);
    if (state === 'clear') return match.save();

    if (state === 'no_show') {
        match.attendance.push({ player: id, state: 'no_show' });
    } else {
        const minutes = Math.round((arrivedAt - new Date(match.kickoff)) / 60000);
        const late = minutes > settings.lateGraceMinutes;
        match.attendance.push({
            player: id,
            state: late ? 'late' : 'on_time',
            arrivedAt,
            minutesLate: late ? minutes : 0
        });
    }
    await match.save();
    if (match.status === 'completed') await recomputeStandings();
    return match;
};

export const playersByIds = async (ids) => {
    const players = await Player.find({ _id: { $in: ids } });
    const map = new Map(players.map(p => [String(p._id), p]));
    return ids.map(id => map.get(String(id))).filter(Boolean);
};
