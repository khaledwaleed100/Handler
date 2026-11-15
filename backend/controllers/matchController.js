import Match from '../models/Match.js';
import Player from '../models/Player.js';
import PeerRating from '../models/PeerRating.js';
import Preference from '../models/Preference.js';
import { getSettings } from '../models/Settings.js';
import { httpError } from '../utils/httpError.js';
import * as v from '../utils/validate.js';
import { isOrganizer } from '../middlewares/authMiddleware.js';
import { matchListView, matchView, publicPlayer } from '../services/views.js';
import {
    checkIn, completeMatch, finalizeDueMatches, finalizeRatings, formatKickoff, playersByIds, recentTeams, rsvpLists, setRsvp
} from '../services/matchService.js';
import { runDueJobs } from '../services/schedulerService.js';
import { balanceTeams, MAX_PLAYERS } from '../services/balancingService.js';
import { notifyEveryone, notifyPlayers } from '../services/pushService.js';
import { ATTRIBUTES } from '../models/Player.js';
import { recomputeStandings } from '../services/standingsService.js';

const viewer = (req) => ({ player: req.player, isOrganizer: isOrganizer(req) });

const loadMatch = async (id) => {
    v.requireId(id, 'match');
    const match = await Match.findById(id);
    if (!match) throw httpError(404, 'Match not found');
    return match;
};

const requireUpcoming = (match) => {
    if (match.status !== 'upcoming') throw httpError(400, 'This match is not upcoming');
};

// @route GET /api/matches?scope=upcoming|past
export const listMatches = async (req, res) => {
    await finalizeDueMatches();
    await runDueJobs();
    const past = req.query.scope === 'past';
    const filter = past ? { status: { $in: ['completed', 'cancelled'] } } : { status: 'upcoming' };
    const matches = await Match.find(filter).sort({ kickoff: past ? -1 : 1 }).limit(past ? 30 : 20);
    res.json(await matchListView(matches, viewer(req)));
};

// @route GET /api/matches/:id
export const getMatch = async (req, res) => {
    const match = await loadMatch(req.params.id);
    await markSeen(match, req.player);
    res.json(await matchView(match, viewer(req)));
};

/** Remembers that this player opened the match (organizer's "seen" list). */
export const markSeen = async (match, player) => {
    if (!player || match.seenBy.some(s => String(s.player) === String(player._id))) return;
    await Match.updateOne({ _id: match._id, 'seenBy.player': { $ne: player._id } }, { $push: { seenBy: { player: player._id, at: new Date() } } });
    match.seenBy.push({ player: player._id, at: new Date() });
};

const NOTIFY_KINDS = {
    // "Are you in?": everyone who hasn't answered yet, plus the maybes.
    ask: (m, lists, all) => all.filter(id => ![...lists.confirmed, ...lists.waitlist, ...lists.out].includes(id)),
    // "Kick-off soon": confirmed players.
    soon: (m, lists) => lists.confirmed,
    // Free message to everyone in the match (confirmed + waitlist).
    message: (m, lists) => [...lists.confirmed, ...lists.waitlist],
    // Full match details (place, time, map, teams) to everyone in the match.
    details: (m, lists) => [...lists.confirmed, ...lists.waitlist]
};

/** The "match details" message: everything a player needs, one fact per line. */
const detailsText = async (match, lists, note) => {
    const lines = [
        `📍 ${match.place}`,
        `🕒 ${formatKickoff(match.kickoff)}`,
        `👥 ${lists.confirmed.length}/${match.capacity} confirmed`
    ];
    if (match.mapUrl) lines.push(`🗺 ${match.mapUrl}`);
    if (match.teamsPublished && match.teamA.length && match.teamB.length) {
        const players = await playersByIds([...match.teamA, ...match.teamB].map(String));
        const nameOf = new Map(players.map(p => [String(p._id), p.name]));
        const names = (ids) => ids.map(id => nameOf.get(String(id)) || '?').join(', ');
        lines.push('', `🔴 Team A: ${names(match.teamA)}`, `🔵 Team B: ${names(match.teamB)}`);
    }
    if (note) lines.push('', note);
    return { title: `⚽ Match details: ${match.place}`, body: lines.join('\n') };
};

const notifyText = (kind, match, note) => {
    const when = formatKickoff(match.kickoff);
    const extra = note ? `
${note}` : '';
    if (kind === 'ask') return { title: `⚽ ${match.place} · ${when}`, body: `Are you in? Tap to answer.${extra}` };
    if (kind === 'soon') return { title: `⏱ Kick-off soon: ${when}`, body: `${match.place}. Don't be late!${extra}` };
    return { title: `📣 ${match.place} · ${when}`, body: note || 'Message from the organizer.' };
};

// @route POST /api/matches/:id/notify  (organizer)  { kind: ask|soon|message|details, note? }
// Sends phone notifications + emails. Each kind can be sent at most once every 30 minutes.
export const notifyGroup = async (req, res) => {
    const match = await loadMatch(req.params.id);
    requireUpcoming(match);
    const kind = req.body?.kind;
    if (!NOTIFY_KINDS[kind]) throw httpError(400, 'Invalid notification');
    const note = v.str(req.body?.note, { max: 200, field: 'Message', required: kind === 'message' });

    const last = [...match.notifications].reverse().find(n => n.kind === kind);
    if (last && Date.now() - new Date(last.at) < 30 * 60 * 1000) {
        throw httpError(429, 'You sent this less than 30 minutes ago');
    }

    const all = (await Player.find().select('_id').lean()).map(p => String(p._id)).filter(id => id !== String(req.player?._id));
    const lists = rsvpLists(match);
    const targets = NOTIFY_KINDS[kind](match, lists, all).filter(id => id !== String(req.player?._id));
    if (!targets.length) throw httpError(400, 'Nobody to notify for this');

    const text = kind === 'details' ? await detailsText(match, lists, note) : notifyText(kind, match, note);
    const reached = await notifyPlayers(targets, { ...text, url: `/matches/${match._id}` }, { email: true });
    match.notifications.push({ kind, at: new Date(), recipients: targets.length });
    await match.save();
    res.json({ recipients: targets.length, reached, match: await matchView(match, viewer(req)) });
};

const readMatchFields = (b, { partial }) => {
    const out = {};
    const place = v.str(b.place, { min: 2, max: 80, field: 'Place', required: !partial });
    if (place !== undefined) out.place = place;
    const mapUrl = v.url(b.mapUrl, 'Map link');
    if (mapUrl !== undefined) out.mapUrl = mapUrl;
    if (b.kickoff !== undefined || !partial) out.kickoff = v.date(b.kickoff, 'kick-off time');
    const capacity = v.int(b.capacity, { min: 2, max: MAX_PLAYERS, field: 'Players' });
    if (capacity !== undefined) out.capacity = capacity;
    if (typeof b.repeatWeekly === 'boolean') out.repeatWeekly = b.repeatWeekly;
    return out;
};

// @route POST /api/matches  (organizer)
export const createMatch = async (req, res) => {
    const settings = await getSettings();
    const fields = readMatchFields(req.body || {}, { partial: false });
    const match = await Match.create({
        capacity: settings.defaultCapacity,
        ...fields,
        createdBy: req.user._id
    });
    notifyEveryone({
        title: 'New match ⚽',
        body: `${match.place} · ${formatKickoff(match.kickoff)}. Are you in?`,
        url: `/matches/${match._id}`
    }, req.user._id).catch(() => {});
    res.status(201).json(await matchView(match, viewer(req)));
};

// @route PUT /api/matches/:id  (organizer)  { place, mapUrl, kickoff, capacity, repeatWeekly, cancelled }
export const updateMatch = async (req, res) => {
    const match = await loadMatch(req.params.id);
    const fields = readMatchFields(req.body || {}, { partial: true });
    Object.assign(match, fields);
    if (req.body?.cancelled === true && match.status === 'upcoming') {
        match.status = 'cancelled';
        notifyPlayers(rsvpLists(match).confirmed, {
            title: 'Match cancelled',
            body: `${match.place} · ${formatKickoff(match.kickoff)} is off.`,
            url: `/matches/${match._id}`
        }, { email: true }).catch(() => {});
    }
    await match.save();
    res.json(await matchView(match, viewer(req)));
};

// @route DELETE /api/matches/:id  (organizer)
export const deleteMatch = async (req, res) => {
    const match = await loadMatch(req.params.id);
    await PeerRating.deleteMany({ match: match._id });
    const wasCompleted = match.status === 'completed';
    await match.deleteOne();
    if (wasCompleted) await recomputeStandings({ capChanges: false });
    res.json({ ok: true });
};

const RSVP_STATES = ['in', 'out', 'maybe'];

// @route POST /api/matches/:id/rsvp  { status }
export const rsvp = async (req, res) => {
    if (!req.player) throw httpError(404, 'Player profile not found');
    const match = await loadMatch(req.params.id);
    requireUpcoming(match);
    if (!RSVP_STATES.includes(req.body?.status)) throw httpError(400, 'Invalid reply');
    await setRsvp(match, req.player._id, req.body.status);
    res.json(await matchView(match, viewer(req)));
};

// @route POST /api/matches/:id/roster  (organizer)  { playerId, status }
// For friends who reply on WhatsApp instead of in the app.
export const setRosterStatus = async (req, res) => {
    const match = await loadMatch(req.params.id);
    requireUpcoming(match);
    const playerId = v.requireId(req.body?.playerId, 'player');
    const status = req.body?.status;
    if (![...RSVP_STATES, 'remove'].includes(status)) throw httpError(400, 'Invalid reply');
    if (!(await Player.exists({ _id: playerId }))) throw httpError(404, 'Player not found');

    if (status === 'remove') {
        match.rsvps = match.rsvps.filter(r => String(r.player) !== playerId);
        match.teamA = match.teamA.filter(p => String(p) !== playerId);
        match.teamB = match.teamB.filter(p => String(p) !== playerId);
        await match.save();
    } else {
        await setRsvp(match, playerId, status);
    }
    res.json(await matchView(match, viewer(req)));
};

// @route POST /api/matches/:id/teams/suggest  (organizer)
// Returns the best 3 splits of the confirmed players.
export const suggestTeams = async (req, res) => {
    const match = await loadMatch(req.params.id);
    requireUpcoming(match);
    const ids = rsvpLists(match).confirmed;
    if (ids.length < 2) throw httpError(400, 'Need at least 2 confirmed players');

    const players = await playersByIds(ids);
    const preferences = (await Preference.find({ player: { $in: ids } }).lean())
        .map(p => ({ from: String(p.player), with: p.with.map(String), avoid: p.avoid.map(String) }));

    const options = balanceTeams(
        players.map(p => ({ id: String(p._id), overall: p.overall, position: p.position })),
        { preferences, recentTeams: await recentTeams(3), count: 3 }
    );
    res.json({ options, players: Object.fromEntries(players.map(p => [String(p._id), publicPlayer(p)])) });
};

// @route PUT /api/matches/:id/teams  (organizer)  { teamA, teamB, publish }
export const saveTeams = async (req, res) => {
    const match = await loadMatch(req.params.id);
    requireUpcoming(match);
    const teamA = v.idList(req.body?.teamA ?? [], { max: MAX_PLAYERS, field: 'Team A' });
    const teamB = v.idList(req.body?.teamB ?? [], { max: MAX_PLAYERS, field: 'Team B' });
    if (teamA.some(id => teamB.includes(id))) throw httpError(400, 'A player cannot be on both teams');

    const confirmed = new Set(rsvpLists(match).confirmed);
    if ([...teamA, ...teamB].some(id => !confirmed.has(id))) throw httpError(400, 'Only confirmed players can be in a team');

    const publish = req.body?.publish === true;
    const wasPublished = match.teamsPublished;
    match.teamA = teamA;
    match.teamB = teamB;
    match.teamsPublished = publish || (wasPublished && req.body?.publish !== false);
    await match.save();

    if (publish && !wasPublished) {
        notifyPlayers([...teamA, ...teamB], {
            title: 'Teams are out 👕',
            body: `See your team for ${match.place}.`,
            url: `/matches/${match._id}`
        }, { email: true }).catch(() => {});
    }
    res.json(await matchView(match, viewer(req)));
};

// @route POST /api/matches/:id/checkin  (organizer)  { playerId, state: arrived|no_show|clear, arrivedAt? }
export const checkInPlayer = async (req, res) => {
    const match = await loadMatch(req.params.id);
    if (match.status === 'cancelled') throw httpError(400, 'Match was cancelled');
    const playerId = v.requireId(req.body?.playerId, 'player');
    const state = req.body?.state;
    if (!['arrived', 'no_show', 'clear'].includes(state)) throw httpError(400, 'Invalid check-in');
    const arrivedAt = req.body?.arrivedAt ? v.date(req.body.arrivedAt, 'arrival time') : new Date();

    const inMatch = rsvpLists(match).confirmed.includes(playerId) ||
        [...match.teamA, ...match.teamB].some(p => String(p) === playerId);
    if (!inMatch) throw httpError(400, 'That player is not in this match');

    await checkIn(match, playerId, state, arrivedAt);
    res.json(await matchView(match, viewer(req)));
};

// @route POST /api/matches/:id/result  (organizer)  { score: {a,b}, stats: [{player, goals, assists}] }
export const saveResult = async (req, res) => {
    const match = await loadMatch(req.params.id);
    if (match.status === 'cancelled') throw httpError(400, 'Match was cancelled');
    if (!match.teamA.length || !match.teamB.length) throw httpError(400, 'Set the teams before entering a result');

    const score = {
        a: v.int(req.body?.score?.a, { min: 0, max: 99, field: 'Score', required: true }),
        b: v.int(req.body?.score?.b, { min: 0, max: 99, field: 'Score', required: true })
    };
    const inTeams = new Set([...match.teamA, ...match.teamB].map(String));
    const rawStats = Array.isArray(req.body?.stats) ? req.body.stats : [];
    if (rawStats.length > MAX_PLAYERS) throw httpError(400, 'Too many entries');
    const stats = rawStats.map(s => {
        const player = v.requireId(s?.player, 'player');
        if (!inTeams.has(player)) throw httpError(400, 'Stats can only be entered for players in the teams');
        return {
            player,
            goals: v.int(s.goals ?? 0, { min: 0, max: 50, field: 'Goals' }),
            assists: v.int(s.assists ?? 0, { min: 0, max: 50, field: 'Assists' })
        };
    }).filter(s => s.goals || s.assists);

    await completeMatch(match, { score, stats });
    res.json(await matchView(match, viewer(req)));
};

// @route GET /api/matches/:id/rating-task  — who I should rate, plus everyone for the MVP vote
export const getRatingTask = async (req, res) => {
    const match = await loadMatch(req.params.id);
    if (match.status !== 'completed') throw httpError(400, 'The match has not finished');
    const me = String(req.player?._id);
    const task = match.ratingAssignments.find(a => String(a.rater) === me);
    if (!task) throw httpError(404, 'You have nothing to rate for this match');

    const everyone = await playersByIds([...match.teamA, ...match.teamB].map(String).filter(id => id !== me));
    res.json({
        matchId: String(match._id),
        place: match.place,
        kickoff: match.kickoff,
        done: task.done,
        closed: match.ratingsFinalized,
        closesAt: match.ratingsClosesAt,
        ratees: task.ratees.map(String),
        players: Object.fromEntries(everyone.map(p => [String(p._id), publicPlayer(p)]))
    });
};

// @route POST /api/matches/:id/ratings  { ratings: [{ratee, scores, playAgain}], mvp }
export const submitRatings = async (req, res) => {
    const match = await loadMatch(req.params.id);
    if (match.status !== 'completed' || match.ratingsFinalized) throw httpError(400, 'Rating for this match is closed');
    const me = String(req.player?._id);
    const task = match.ratingAssignments.find(a => String(a.rater) === me);
    if (!task) throw httpError(403, 'You have nothing to rate for this match');
    if (task.done) throw httpError(409, 'You already rated this match');

    const assigned = new Set(task.ratees.map(String));
    const list = Array.isArray(req.body?.ratings) ? req.body.ratings : [];
    if (list.length !== assigned.size) throw httpError(400, 'Please rate every player on the list');

    const docs = list.map(r => {
        const ratee = v.requireId(r?.ratee, 'player');
        if (!assigned.has(ratee)) throw httpError(400, 'You can only rate the players you were given');
        // Goalkeeping is optional: most people never see a teammate in goal.
        const scores = {};
        for (const a of ATTRIBUTES) {
            const val = v.int(r.scores?.[a], { min: 1, max: 5, field: a, required: a !== 'goalkeeping' });
            if (val !== undefined) scores[a] = val;
        }
        return { match: match._id, rater: me, ratee, scores, playAgain: v.bool(r.playAgain, 'Play again') };
    });
    if (new Set(docs.map(d => String(d.ratee))).size !== docs.length) throw httpError(400, 'Duplicate player');

    const playedIds = new Set([...match.teamA, ...match.teamB].map(String));
    let mvp = null;
    if (req.body?.mvp !== undefined && req.body.mvp !== null) {
        mvp = v.requireId(req.body.mvp, 'MVP');
        if (!playedIds.has(mvp) || mvp === me) throw httpError(400, 'Pick an MVP who played (not yourself)');
    }

    // Mark done first (atomically) so a double-tap can't submit twice.
    const marked = await Match.updateOne(
        { _id: match._id, ratingAssignments: { $elemMatch: { rater: me, done: false } } },
        { $set: { 'ratingAssignments.$.done': true }, ...(mvp ? { $push: { mvpVotes: { voter: me, for: mvp } } } : {}) }
    );
    if (!marked.modifiedCount) throw httpError(409, 'You already rated this match');

    await PeerRating.insertMany(docs);

    // Everyone has rated: no need to wait for the window to close.
    const fresh = await Match.findById(match._id);
    if (fresh.ratingAssignments.every(a => a.done)) await finalizeRatings(fresh);

    res.json({ ok: true });
};

// @route POST /api/matches/:id/finalize-ratings  (organizer) — close the rating round now
export const closeRatings = async (req, res) => {
    const match = await loadMatch(req.params.id);
    if (match.status !== 'completed') throw httpError(400, 'The match has not finished');
    await finalizeRatings(match);
    res.json(await matchView(match, viewer(req)));
};
