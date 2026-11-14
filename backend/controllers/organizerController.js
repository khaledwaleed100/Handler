import Player, { ADJUSTMENT_REASONS } from '../models/Player.js';
import User from '../models/User.js';
import Match from '../models/Match.js';
import Feedback from '../models/Feedback.js';
import PeerRating from '../models/PeerRating.js';
import Preference from '../models/Preference.js';
import { getSettings, newInviteCode } from '../models/Settings.js';
import { httpError } from '../utils/httpError.js';
import * as v from '../utils/validate.js';
import { matchView, organizerPlayer } from '../services/views.js';
import { recomputeStandings } from '../services/standingsService.js';
import { finalizeDueMatches } from '../services/matchService.js';
import { notifyPlayers } from '../services/pushService.js';

const settingsView = (s) => ({
    groupName: s.groupName,
    inviteCode: s.inviteCode,
    lateGraceMinutes: s.lateGraceMinutes,
    defaultCapacity: s.defaultCapacity,
    defaultPrice: s.defaultPrice,
    currency: s.currency,
    ratingWindowHours: s.ratingWindowHours
});

// @route GET /api/settings  — group basics every member needs (no invite code)
export const publicSettings = async (req, res) => {
    const s = await getSettings();
    res.json({ groupName: s.groupName, currency: s.currency, lateGraceMinutes: s.lateGraceMinutes });
};

// @route GET /api/organizer/overview
export const overview = async (req, res) => {
    const [settings, players, feedback, disputeMatches, pricedMatches] = await Promise.all([
        getSettings(),
        Player.find().sort({ name: 1 }),
        Feedback.find().sort({ createdAt: -1 }).limit(30).populate('userId', 'name').lean(),
        Match.find({ 'attendance.dispute.state': 'pending' }).select('place kickoff attendance').lean(),
        Match.find({ status: 'completed', price: { $gt: 0 } }).select('place kickoff price teamA teamB payments').lean()
    ]);
    const users = new Map((await User.find({ _id: { $in: players.map(p => p.user) } })).map(u => [String(u._id), u]));

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

    // Who still owes money, per player.
    const owed = new Map();
    for (const m of pricedMatches) {
        const paid = new Set(m.payments.filter(p => p.paid).map(p => String(p.player)));
        for (const id of [...m.teamA, ...m.teamB].map(String)) {
            if (paid.has(id)) continue;
            const e = owed.get(id) || { playerId: id, amount: 0, matches: [] };
            e.amount += m.price;
            e.matches.push({ matchId: String(m._id), place: m.place, kickoff: m.kickoff, price: m.price });
            owed.set(id, e);
        }
    }

    res.json({
        settings: settingsView(settings),
        members: players.map(p => organizerPlayer(p, users.get(String(p.user)))),
        disputes,
        unpaid: [...owed.values()].sort((a, b) => b.amount - a.amount),
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
        defaultPrice: v.int(b.defaultPrice, { min: 0, max: 100000, field: 'Price' }),
        ratingWindowHours: v.int(b.ratingWindowHours, { min: 12, max: 168, field: 'Rating window' })
    };
    for (const [k, val] of Object.entries(fields)) if (val !== undefined) s[k] = val;
    const currency = v.str(b.currency, { min: 1, max: 5, field: 'Currency' });
    if (currency) s.currency = currency;
    await s.save();
    res.json(settingsView(s));
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
        Feedback.deleteMany({ userId: player.user })
    ]);
    await player.deleteOne();
    if (user) await user.deleteOne();
    await recomputeStandings({ capChanges: false });
    res.json({ ok: true });
};

// @route GET /api/home  — everything the Home tab needs in one request
export const home = async (req, res) => {
    await finalizeDueMatches();

    const me = req.player ? String(req.player._id) : null;
    const viewer = { player: req.player, isOrganizer: req.user.role === 'organizer' };

    const next = await Match.findOne({ status: 'upcoming', kickoff: { $gte: new Date(Date.now() - 3 * 3600 * 1000) } }).sort({ kickoff: 1 });

    const toRate = me ? await Match.find({
        status: 'completed',
        ratingsFinalized: false,
        ratingAssignments: { $elemMatch: { rater: me, done: false } }
    }).select('place kickoff ratingsClosesAt ratingAssignments').lean() : [];

    const unpaid = me ? await Match.find({
        status: 'completed', price: { $gt: 0 },
        $or: [{ teamA: me }, { teamB: me }],
        payments: { $not: { $elemMatch: { player: me, paid: true } } }
    }).select('place kickoff price').lean() : [];

    const todo = {
        rate: toRate.map(m => ({
            matchId: String(m._id),
            place: m.place,
            kickoff: m.kickoff,
            closesAt: m.ratingsClosesAt,
            count: m.ratingAssignments.find(a => String(a.rater) === me)?.ratees.length || 0
        })),
        unpaid: unpaid.map(m => ({ matchId: String(m._id), place: m.place, kickoff: m.kickoff, price: m.price }))
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
        currency: settings.currency,
        next: next ? await matchView(next, viewer) : null,
        todo
    });
};
