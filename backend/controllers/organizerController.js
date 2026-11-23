import Player, { ADJUSTMENT_REASONS } from '../models/Player.js';
import User from '../models/User.js';
import Match from '../models/Match.js';
import Feedback from '../models/Feedback.js';
import PeerRating from '../models/PeerRating.js';
import Preference from '../models/Preference.js';
import Poll from '../models/Poll.js';
import { getSettings, newInviteCode } from '../models/Settings.js';
import { httpError } from '../utils/httpError.js';
import * as v from '../utils/validate.js';
import { matchView, organizerPlayer } from '../services/views.js';
import { recomputeStandings } from '../services/standingsService.js';
import { finalizeDueMatches } from '../services/matchService.js';
import { runDueJobs } from '../services/schedulerService.js';
import { markSeen } from './matchController.js';
import { notifyPlayers } from '../services/pushService.js';
import { emailMethod, sendTestEmail } from '../services/emailService.js';

const settingsView = (s) => ({
    groupName: s.groupName,
    inviteCode: s.inviteCode,
    lateGraceMinutes: s.lateGraceMinutes,
    defaultCapacity: s.defaultCapacity,
    ratingWindowHours: s.ratingWindowHours,
    autoReminders: s.autoReminders !== false
});

// @route GET /api/settings  — group basics every member needs (no invite code)
export const publicSettings = async (req, res) => {
    const s = await getSettings();
    res.json({ groupName: s.groupName, lateGraceMinutes: s.lateGraceMinutes });
};

const DAY = 24 * 3600 * 1000;
const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);

/**
 * How the group uses the app. Counts only, nothing about what anyone answered.
 */
const usageStats = async (players, users) => {
    const now = Date.now();
    const ids = players.map(p => String(p._id));
    const userList = [...users.values()];
    const [recent, rated, polls] = await Promise.all([
        Match.find({ status: { $ne: 'cancelled' } }).sort({ kickoff: -1 }).limit(5).select('rsvps seenBy').lean(),
        Match.find({ status: 'completed', 'ratingAssignments.0': { $exists: true } }).sort({ kickoff: -1 }).limit(5).select('ratingAssignments').lean(),
        Poll.find().sort({ createdAt: -1 }).limit(3).select('votes').lean()
    ]);

    const members = ids.length;
    const avg = (list) => (list.length ? Math.round(list.reduce((s, x) => s + x, 0) / list.length) : null);
    const repliesByPlayer = new Map(ids.map(id => [id, 0]));
    for (const m of recent) for (const r of m.rsvps) if (repliesByPlayer.has(String(r.player))) repliesByPlayer.set(String(r.player), repliesByPlayer.get(String(r.player)) + 1);

    return {
        stats: {
            members,
            active7: userList.filter(u => u.lastActiveAt && now - u.lastActiveAt < 7 * DAY).length,
            active30: userList.filter(u => u.lastActiveAt && now - u.lastActiveAt < 30 * DAY).length,
            pushOn: userList.filter(u => u.pushSubscriptions?.length).length,
            google: userList.filter(u => u.googleId).length,
            replyRate: avg(recent.map(m => pct(m.rsvps.length, members))),
            seenRate: avg(recent.map(m => pct((m.seenBy || []).length, members))),
            ratingRate: avg(rated.map(m => pct(m.ratingAssignments.filter(a => a.done).length, m.ratingAssignments.length))),
            // People who voted, not votes cast (Team of the Week gives each person several picks).
            pollTurnout: avg(polls.map(p => pct(new Set(p.votes.map(x => String(x.userId))).size, members))),
            matchesCounted: recent.length
        },
        repliesByPlayer,
        recentCount: recent.length
    };
};

// @route GET /api/organizer/overview
export const overview = async (req, res) => {
    const [settings, players, feedback, disputeMatches] = await Promise.all([
        getSettings(),
        Player.find().sort({ name: 1 }),
        Feedback.find().sort({ createdAt: -1 }).limit(30).populate('userId', 'name').lean(),
        Match.find({ 'attendance.dispute.state': 'pending' }).select('place kickoff attendance').lean()
    ]);
    const users = new Map((await User.find({ _id: { $in: players.map(p => p.user) } }).select('+pushSubscriptions +googleId'))
        .map(u => [String(u._id), u]));

    const disputes = disputeMatches.flatMap(m => m.attendance
        .filter(a => a.dispute?.state === 'pending')
        .map(a => ({
            matchId: String(m._id),
            place: m.place,
            kickoff: m.kickoff,
            playerId: String(a.player),
            state: a.state,
            minutesLate: a.minutesLate,
            note: a.dispute.note
        })));

    const { stats, repliesByPlayer, recentCount } = await usageStats(players, users);
    const favorites = new Set((req.user.favoritePlayers || []).map(String));

    res.json({
        settings: settingsView(settings),
        stats,
        members: players.map(p => {
            const u = users.get(String(p.user));
            return {
                ...organizerPlayer(p, u),
                favorite: favorites.has(String(p._id)),
                usage: {
                    lastActiveAt: u?.lastActiveAt || null,
                    push: !!u?.pushSubscriptions?.length,
                    email: u?.preferences?.emailNotifications !== false,
                    google: !!u?.googleId,
                    replies: repliesByPlayer.get(String(p._id)) || 0,
                    outOf: recentCount
                }
            };
        }),
        disputes,
        feedback: feedback.map(f => ({ _id: String(f._id), name: f.userId?.name || 'Former player', message: f.message, at: f.createdAt }))
    });
};

// @route PUT /api/organizer/settings
export const updateSettings = async (req, res) => {
    const b = req.body || {};
    const s = await getSettings();
    const groupName = v.str(b.groupName, { min: 2, max: 40, field: 'Group name' });
    if (groupName) s.groupName = groupName;
    const fields = {
        lateGraceMinutes: v.int(b.lateGraceMinutes, { min: 0, max: 30, field: 'Grace period' }),
        defaultCapacity: v.int(b.defaultCapacity, { min: 2, max: 22, field: 'Players per match' }),
        ratingWindowHours: v.int(b.ratingWindowHours, { min: 12, max: 168, field: 'Rating window' })
    };
    for (const [k, val] of Object.entries(fields)) if (val !== undefined) s[k] = val;
    if (typeof b.autoReminders === 'boolean') s.autoReminders = b.autoReminders;
    await s.save();
    res.json(settingsView(s));
};

// @route POST /api/organizer/test-email  — sends the organizer a test email and reports the real error
export const testEmail = async (req, res) => {
    const method = emailMethod();
    if (!method) throw httpError(400, 'Email is not set up on the server (no BREVO_API_KEY or Gmail settings)');
    try {
        await sendTestEmail(req.user.email, req.user.name);
    } catch (err) {
        const blocked = /timeout|ETIMEDOUT|ECONNREFUSED|ENETUNREACH/i.test(err.message) && method === 'gmail';
        throw httpError(502, blocked
            ? 'Gmail could not be reached. Render\'s free plan blocks this; set up Brevo (see DEPLOY.md).'
            : `Sending failed: ${err.message}`);
    }
    res.json({ ok: true, method, to: req.user.email });
};

// @route POST /api/organizer/invite/reset  — old link stops working
export const resetInvite = async (req, res) => {
    const s = await getSettings();
    s.inviteCode = newInviteCode();
    await s.save();
    res.json(settingsView(s));
};

// @route PUT /api/organizer/players/:id/adjustment  { value: -5..5, reason }
export const setAdjustment = async (req, res) => {
    v.requireId(req.params.id, 'player');
    const player = await Player.findById(req.params.id);
    if (!player) throw httpError(404, 'Player not found');

    const value = v.int(req.body?.value, { min: -5, max: 5, field: 'Adjustment', required: true });
    const reason = value === 0 ? null : req.body?.reason;
    if (value !== 0 && !ADJUSTMENT_REASONS.includes(reason)) throw httpError(400, 'Pick a reason');

    player.adjustment = { value, reason, setAt: new Date(), matchesAtSet: player.stats.matches };
    player.adjustmentLog.push({ value, reason: reason || undefined, at: new Date() });
    if (player.adjustmentLog.length > 50) player.adjustmentLog = player.adjustmentLog.slice(-50);
    await player.save();
    await recomputeStandings({ capChanges: false });

    const fresh = await Player.findById(player._id);
    res.json(organizerPlayer(fresh, await User.findById(fresh.user)));
};

// @route GET /api/organizer/favorites  — ids of the organizer's starred players
export const getFavorites = async (req, res) => {
    res.json((req.user.favoritePlayers || []).map(String));
};

// @route PUT /api/organizer/players/:id/favorite  { favorite: true|false }
export const setFavorite = async (req, res) => {
    v.requireId(req.params.id, 'player');
    if (!(await Player.exists({ _id: req.params.id }))) throw httpError(404, 'Player not found');
    const change = req.body?.favorite === false
        ? { $pull: { favoritePlayers: req.params.id } }
        : { $addToSet: { favoritePlayers: req.params.id } };
    const user = await User.findByIdAndUpdate(req.user._id, change, { returnDocument: 'after' });
    res.json(user.favoritePlayers.map(String));
};

// @route POST /api/organizer/disputes  { matchId, playerId, decision: accept|reject }
export const resolveDispute = async (req, res) => {
    const matchId = v.requireId(req.body?.matchId, 'match');
    const playerId = v.requireId(req.body?.playerId, 'player');
    const decision = req.body?.decision;
    if (!['accept', 'reject'].includes(decision)) throw httpError(400, 'Invalid decision');

    const match = await Match.findById(matchId);
    const entry = match?.attendance.find(a => String(a.player) === playerId);
    if (!entry || entry.dispute.state !== 'pending') throw httpError(404, 'No open request');

    entry.dispute.state = decision === 'accept' ? 'accepted' : 'rejected';
    entry.dispute.resolvedAt = new Date();
    await match.save();
    if (match.status === 'completed') await recomputeStandings({ capChanges: false });

    notifyPlayers([playerId], {
        title: decision === 'accept' ? 'Arrival time corrected ✅' : 'Arrival time kept',
        body: `${match.place}: the organizer ${decision === 'accept' ? 'accepted' : 'did not accept'} your request.`,
        url: '/me'
    }).catch(() => {});
    res.json({ ok: true });
};

// @route DELETE /api/organizer/players/:id  — remove a member from the group
export const removeMember = async (req, res) => {
    v.requireId(req.params.id, 'player');
    const player = await Player.findById(req.params.id);
    if (!player) throw httpError(404, 'Player not found');
    const user = await User.findById(player.user);
    if (user?.role === 'organizer') throw httpError(400, 'You cannot remove the organizer');

    await Promise.all([
        PeerRating.deleteMany({ $or: [{ rater: player._id }, { ratee: player._id }] }),
        Preference.deleteOne({ player: player._id }),
        Preference.updateMany({}, { $pull: { with: player._id, avoid: player._id } }),
        Match.updateMany({ status: 'upcoming' }, { $pull: { rsvps: { player: player._id }, teamA: player._id, teamB: player._id } }),
        Feedback.deleteMany({ userId: player.user }),
        User.updateMany({}, { $pull: { favoritePlayers: player._id } })
    ]);
    await player.deleteOne();
    if (user) await user.deleteOne();
    await recomputeStandings({ capChanges: false });
    res.json({ ok: true });
};

// @route GET /api/home  — everything the Home tab needs in one request
export const home = async (req, res) => {
    await finalizeDueMatches();
    runDueJobs(); // in the background: reminders and emails must never slow a screen down

    const me = req.player ? String(req.player._id) : null;
    const viewer = { player: req.player, isOrganizer: req.user.role === 'organizer' };

    const next = await Match.findOne({ status: 'upcoming', kickoff: { $gt: new Date() } }).sort({ kickoff: 1 });
    if (next) await markSeen(next, req.player); // Home shows the next match, so it counts as seen.

    const toRate = me ? await Match.find({
        status: 'completed',
        ratingsFinalized: false,
        ratingAssignments: { $elemMatch: { rater: me, done: false } }
    }).select('place kickoff ratingsClosesAt ratingAssignments').lean() : [];

    const todo = {
        rate: toRate.map(m => ({
            matchId: String(m._id),
            place: m.place,
            kickoff: m.kickoff,
            closesAt: m.ratingsClosesAt,
            count: m.ratingAssignments.find(a => String(a.rater) === me)?.ratees.length || 0
        }))
    };

    if (viewer.isOrganizer) {
        const [disputes, needResult] = await Promise.all([
            Match.countDocuments({ 'attendance.dispute.state': 'pending' }),
            Match.find({ status: 'upcoming', kickoff: { $lte: new Date() } }).select('place kickoff').lean()
        ]);
        todo.disputes = disputes;
        todo.needResult = needResult.map(m => ({ matchId: String(m._id), place: m.place, kickoff: m.kickoff }));
    }

    const settings = await getSettings();
    res.json({
        groupName: settings.groupName,
        next: next ? await matchView(next, viewer) : null,
        todo
    });
};
