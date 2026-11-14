/**
 * PollService: business rules for Player of the Week / Month polls.
 *
 * Kept free of Express objects so the ranking and serialisation logic can be
 * unit-tested without a database.
 */
import Poll from '../models/Poll.js';
import Match from '../models/Match.js';

export const POLL_CONFIG = {
    weekly: { matchesRequired: 3, candidateLimit: 5, title: 'Player of the Week' },
    monthly: { matchesRequired: 12, candidateLimit: 5, title: 'Player of the Month' }
};

export const isValidPollType = (type) => Object.prototype.hasOwnProperty.call(POLL_CONFIG, type);

/**
 * Performance in one match, out of 10: starts at 6, plus goals, assists,
 * winning, and being voted MVP.
 */
export const matchPerformance = ({ goals = 0, assists = 0, won = false, mvp = false }) =>
    Math.min(10, Math.round((6 + goals * 0.8 + assists * 0.5 + (won ? 0.5 : 0) + (mvp ? 1.5 : 0)) * 10) / 10);

/** Completed matches not yet used by a poll of this type. */
const pendingMatchFilter = async (type) => {
    const polls = await Poll.find({ type }).select('matchesIncluded').lean();
    const alreadyUsed = polls.flatMap(p => p.matchesIncluded);
    return { status: 'completed', _id: { $nin: alreadyUsed } };
};

export const getPendingMatchCount = async (type) => Match.countDocuments(await pendingMatchFilter(type));

export const getPendingMatches = async (type) =>
    Match.find(await pendingMatchFilter(type)).sort({ kickoff: -1 }).limit(POLL_CONFIG[type].matchesRequired);

/**
 * Averages each player's match performance and returns the top candidates
 * (highest average first; goal contributions, then matches, break ties).
 */
export const rankCandidates = (matches, limit) => {
    const totals = new Map();

    for (const m of matches) {
        const a = m.score?.a ?? 0;
        const b = m.score?.b ?? 0;
        const sides = [...(m.teamA || []).map(id => [id, a > b]), ...(m.teamB || []).map(id => [id, b > a])];
        for (const [id, won] of sides) {
            const pid = String(id);
            const s = (m.stats || []).find(x => String(x.player) === pid) || {};
            const entry = totals.get(pid) || { playerId: pid, ratingSum: 0, goals: 0, assists: 0, matches: 0 };
            entry.ratingSum += matchPerformance({
                goals: s.goals, assists: s.assists, won,
                mvp: m.ratingsFinalized && m.mvp && String(m.mvp) === pid
            });
            entry.goals += s.goals || 0;
            entry.assists += s.assists || 0;
            entry.matches += 1;
            totals.set(pid, entry);
        }
    }

    return [...totals.values()]
        .map(e => ({
            playerId: e.playerId,
            avgRating: Math.round((e.ratingSum / e.matches) * 10) / 10,
            goals: e.goals,
            assists: e.assists,
            matches: e.matches
        }))
        .sort((x, y) =>
            y.avgRating - x.avgRating ||
            (y.goals + y.assists) - (x.goals + x.assists) ||
            y.matches - x.matches)
        .slice(0, limit);
};

/** Picks the winner: most votes, ties broken by the higher average rating. */
export const pickWinner = (poll) => {
    const counts = new Map();
    for (const vote of poll.votes) {
        const pid = String(vote.playerId);
        counts.set(pid, (counts.get(pid) || 0) + 1);
    }
    if (counts.size === 0) return null;

    const ratingOf = (pid) => poll.candidateStats.find(s => String(s.playerId) === pid)?.avgRating || 0;
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || ratingOf(b[0]) - ratingOf(a[0]))[0][0];
};

/**
 * Converts a populated Poll into what the phone needs.
 * Never reveals who voted for whom: only whether *this* user voted, and for whom.
 */
export const serializePoll = (poll, viewerId, canManage = false) => {
    const viewer = String(viewerId);
    const totalVotes = poll.votes.length;
    const myVote = poll.votes.find(vote => String(vote.userId) === viewer);

    const countByPlayer = new Map();
    for (const vote of poll.votes) {
        const pid = String(vote.playerId);
        countByPlayer.set(pid, (countByPlayer.get(pid) || 0) + 1);
    }

    const candidates = poll.candidates.filter(Boolean).map(player => {
        const pid = String(player._id);
        const snap = poll.candidateStats.find(s => String(s.playerId) === pid) || {};
        const votes = countByPlayer.get(pid) || 0;
        return {
            _id: pid,
            name: player.name,
            position: player.position,
            avatarUrl: player.avatarUrl,
            overall: player.overall,
            avgRating: snap.avgRating || 0,
            goals: snap.goals || 0,
            assists: snap.assists || 0,
            matches: snap.matches || 0,
            votes,
            percent: totalVotes ? Math.round((votes / totalVotes) * 100) : 0
        };
    });

    return {
        _id: String(poll._id),
        title: poll.title,
        type: poll.type,
        isActive: poll.isActive,
        createdAt: poll.createdAt,
        closedAt: poll.closedAt,
        canManage,
        hasVoted: !!myVote,
        myVote: myVote ? String(myVote.playerId) : null,
        totalVotes,
        winnerId: poll.winner ? String(poll.winner) : null,
        candidates
    };
};
