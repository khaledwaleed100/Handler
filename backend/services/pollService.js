/**
 * PollService: business rules for Player of the Week / Month polls.
 *
 * Kept free of Express objects so the ranking and serialisation logic can be
 * unit-tested without a database.
 */
import Poll from '../models/Poll.js';
import Match from '../models/Match.js';

export const POLL_CONFIG = {
    weekly: { matchesRequired: 3, candidateLimit: 5, picks: 1, title: 'Player of the Week' },
    monthly: { matchesRequired: 12, candidateLimit: 5, picks: 1, title: 'Player of the Month' },
    // Ten best performers; each voter picks up to five; the five most-voted make the team.
    team: { matchesRequired: 3, candidateLimit: 10, picks: 5, title: 'Team of the Week' }
};

/** How many players one voter picks (and how many are crowned) in this kind of poll. */
export const picksFor = (type) => POLL_CONFIG[type]?.picks || 1;

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

/**
 * Picks the top `count` candidates: most votes first, ties broken by the higher
 * average rating. Empty when nobody voted.
 */
export const pickWinners = (poll, count = 1) => {
    const counts = new Map();
    for (const vote of poll.votes) {
        const pid = String(vote.playerId);
        counts.set(pid, (counts.get(pid) || 0) + 1);
    }
    if (counts.size === 0) return [];

    const ratingOf = (pid) => poll.candidateStats.find(s => String(s.playerId) === pid)?.avgRating || 0;
    return poll.candidates
        .filter(Boolean)
        .map(c => String(c._id ?? c))
        .sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0) || ratingOf(b) - ratingOf(a))
        .slice(0, count);
};

/** The single winner (Player of the Week / Month), or null when nobody voted. */
export const pickWinner = (poll) => pickWinners(poll, 1)[0] ?? null;

/**
 * Converts a populated Poll into what the phone needs.
 * Never reveals who voted for whom: only whether *this* user voted, and for whom.
 */
export const serializePoll = (poll, viewerId, canManage = false) => {
    const viewer = String(viewerId);
    // Counted in people, so percentages mean "share of voters who picked this player".
    const totalVotes = new Set(poll.votes.map(vote => String(vote.userId))).size;
    const myVotes = poll.votes.filter(vote => String(vote.userId) === viewer).map(vote => String(vote.playerId));
    const winnerIds = poll.winners?.length ? poll.winners.map(String) : poll.winner ? [String(poll.winner)] : [];

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
        picks: picksFor(poll.type),
        hasVoted: myVotes.length > 0,
        myVote: myVotes[0] ?? null,
        myVotes,
        totalVotes,
        winnerId: winnerIds[0] ?? null,
        winnerIds,
        candidates
    };
};
