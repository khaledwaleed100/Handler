import Poll from '../models/Poll.js';
import { httpError } from '../utils/httpError.js';
import { isId } from '../utils/validate.js';
import { isOrganizer } from '../middlewares/authMiddleware.js';
import { notifyEveryone } from '../services/pushService.js';
import {
    POLL_CONFIG, isValidPollType, getPendingMatches, getPendingMatchCount, rankCandidates, pickWinner, serializePoll
} from '../services/pollService.js';

const CANDIDATE_FIELDS = 'name position avatarUrl overall';
const RECENTLY_CLOSED_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const FORCE_MIN_MATCHES = 1;

const loadSerialized = async (pollId, req) => {
    const poll = await Poll.findById(pollId).populate('candidates', CANDIDATE_FIELDS);
    return serializePoll(poll, req.user._id, isOrganizer(req));
};

// @route GET /api/polls/status  — drives the organizer's "Start poll" button
export const getPollStatus = async (req, res) => {
    const organizer = isOrganizer(req);
    const status = { canManage: organizer };
    for (const [type, cfg] of Object.entries(POLL_CONFIG)) {
        const [pending, active] = await Promise.all([
            getPendingMatchCount(type),
            Poll.findOne({ type, isActive: true }).select('_id')
        ]);
        status[type] = {
            required: cfg.matchesRequired,
            completed: Math.min(pending, cfg.matchesRequired),
            pending,
            canGenerate: organizer && pending >= cfg.matchesRequired && !active,
            canForce: organizer && pending >= FORCE_MIN_MATCHES && pending < cfg.matchesRequired && !active,
            activePollId: active ? String(active._id) : null
        };
    }
    res.json(status);
};

// @route POST /api/polls/generate  (organizer)  { type, force? }
export const generatePoll = async (req, res) => {
    const type = req.body?.type || 'weekly';
    if (!isValidPollType(type)) throw httpError(400, 'Invalid poll type');
    const cfg = POLL_CONFIG[type];
    const minMatches = req.body?.force === true ? FORCE_MIN_MATCHES : cfg.matchesRequired;

    if (await Poll.exists({ type, isActive: true })) {
        throw httpError(409, `A ${type} poll is already open. Close it before starting a new one.`);
    }

    const matches = await getPendingMatches(type);
    if (matches.length < minMatches) {
        throw httpError(400, `Need ${minMatches} completed match${minMatches > 1 ? 'es' : ''} for this poll. You have ${matches.length}.`);
    }

    const ranked = rankCandidates(matches, cfg.candidateLimit);
    if (ranked.length < 2) throw httpError(400, 'Not enough players to build a poll.');

    const poll = await Poll.create({
        createdBy: req.user._id,
        title: cfg.title,
        type,
        candidates: ranked.map(r => r.playerId),
        candidateStats: ranked,
        matchesIncluded: matches.map(m => m._id)
    });

    notifyEveryone({ title: `${cfg.title} 🏆`, body: 'Voting is open. Pick your favourite.', url: '/vote' }, req.user._id).catch(() => {});
    res.status(201).json(await loadSerialized(poll._id, req));
};

// @route GET /api/polls  — open polls plus recently closed ones
export const getPolls = async (req, res) => {
    const since = new Date(Date.now() - RECENTLY_CLOSED_WINDOW_MS);
    const polls = await Poll.find({ $or: [{ isActive: true }, { closedAt: { $gte: since } }] })
        .populate('candidates', CANDIDATE_FIELDS)
        .sort({ isActive: -1, createdAt: -1 })
        .limit(10);

    res.set('Cache-Control', 'no-cache');
    res.json(polls.map(p => serializePoll(p, req.user._id, isOrganizer(req))));
};

// @route POST /api/polls/:id/vote  { playerId }  — one vote per user, enforced atomically
export const voteOnPoll = async (req, res) => {
    const playerId = req.body?.playerId;
    if (!isId(req.params.id) || !isId(playerId)) throw httpError(400, 'Invalid poll or player');

    const updated = await Poll.findOneAndUpdate(
        { _id: req.params.id, isActive: true, candidates: playerId, 'votes.userId': { $ne: req.user._id } },
        { $push: { votes: { userId: req.user._id, playerId } } },
        { returnDocument: 'after' }
    );

    if (!updated) {
        const poll = await Poll.findById(req.params.id);
        if (!poll) throw httpError(404, 'Poll not found');
        if (!poll.isActive) throw httpError(400, 'This poll is closed');
        if (poll.votes.some(vote => String(vote.userId) === String(req.user._id))) {
            throw httpError(409, 'You have already voted in this poll');
        }
        throw httpError(400, 'That player is not a candidate in this poll');
    }
    res.json(await loadSerialized(updated._id, req));
};

// @route POST /api/polls/:id/close  (organizer)
export const closePoll = async (req, res) => {
    if (!isId(req.params.id)) throw httpError(400, 'Invalid poll');
    const poll = await Poll.findById(req.params.id);
    if (!poll) throw httpError(404, 'Poll not found');
    if (!poll.isActive) throw httpError(400, 'Poll is already closed');

    poll.isActive = false;
    poll.closedAt = new Date();
    poll.winner = pickWinner(poll);
    await poll.save();
    res.json(await loadSerialized(poll._id, req));
};
