import { describe, it, expect } from '@jest/globals';
import { matchPerformance, rankCandidates, pickWinner, serializePoll } from '../services/pollService.js';

const match = ({ teamA, teamB, a, b, stats = [], mvp = null }) => ({
    teamA, teamB, score: { a, b }, stats, mvp, ratingsFinalized: !!mvp
});

describe('pollService: matchPerformance', () => {
    it('starts at 6 and adds goals, assists, the win and MVP', () => {
        expect(matchPerformance({})).toBe(6);
        expect(matchPerformance({ goals: 2, assists: 1, won: true, mvp: true })).toBe(10);
        expect(matchPerformance({ goals: 1, won: true })).toBe(7.3);
    });

    it('never goes above 10', () => {
        expect(matchPerformance({ goals: 9 })).toBe(10);
    });
});

describe('pollService: rankCandidates', () => {
    it('averages performance across matches and sorts best first', () => {
        const matches = [
            match({ teamA: ['a', 'b'], teamB: ['c'], a: 2, b: 0, stats: [{ player: 'a', goals: 2, assists: 0 }] }),
            match({ teamA: ['a'], teamB: ['b', 'c'], a: 0, b: 1, stats: [{ player: 'c', goals: 1, assists: 0 }] })
        ];
        const ranked = rankCandidates(matches, 5);
        expect(ranked[0]).toMatchObject({ playerId: 'a', goals: 2, matches: 2 });
        expect(ranked.map(r => r.playerId)).toEqual(['a', 'c', 'b']);
    });

    it('limits the number of candidates', () => {
        const m = match({ teamA: ['a', 'b'], teamB: ['c', 'd'], a: 1, b: 0 });
        expect(rankCandidates([m], 2)).toHaveLength(2);
    });

    it('counts the MVP bonus only once ratings are finalized', () => {
        const m = match({ teamA: ['a'], teamB: ['b'], a: 0, b: 0, mvp: 'b' });
        expect(rankCandidates([m], 5)[0].playerId).toBe('b');
    });
});

const buildPoll = (votes) => ({
    _id: 'poll1',
    title: 'Player of the Week',
    type: 'weekly',
    isActive: true,
    createdAt: new Date(),
    closedAt: null,
    winner: null,
    candidates: [
        { _id: 'a', name: 'Ali', position: 'FWD', overall: 80 },
        { _id: 'b', name: 'Bob', position: 'DEF', overall: 70 }
    ],
    candidateStats: [
        { playerId: 'a', avgRating: 7.5, goals: 3, assists: 1, matches: 3 },
        { playerId: 'b', avgRating: 8.0, goals: 0, assists: 2, matches: 3 }
    ],
    votes
});

describe('pollService: pickWinner', () => {
    it('returns the player with the most votes', () => {
        const poll = buildPoll([{ userId: 'u1', playerId: 'a' }, { userId: 'u2', playerId: 'a' }, { userId: 'u3', playerId: 'b' }]);
        expect(pickWinner(poll)).toBe('a');
    });

    it('breaks vote ties with the higher average rating', () => {
        const poll = buildPoll([{ userId: 'u1', playerId: 'a' }, { userId: 'u2', playerId: 'b' }]);
        expect(pickWinner(poll)).toBe('b');
    });

    it('returns null when nobody voted', () => {
        expect(pickWinner(buildPoll([]))).toBeNull();
    });
});

describe('pollService: serializePoll', () => {
    it('reports percentages and the viewer\'s own vote without leaking voter ids', () => {
        const poll = buildPoll([{ userId: 'u1', playerId: 'a' }, { userId: 'u2', playerId: 'a' }, { userId: 'u3', playerId: 'b' }]);
        const out = serializePoll(poll, 'u3');
        expect(out.hasVoted).toBe(true);
        expect(out.myVote).toBe('b');
        expect(out.totalVotes).toBe(3);
        expect(out.candidates.find(c => c._id === 'a')).toMatchObject({ votes: 2, percent: 67 });
        expect(JSON.stringify(out)).not.toContain('u1');
    });

    it('passes through whether the viewer can manage the poll', () => {
        expect(serializePoll(buildPoll([]), 'u9', true).canManage).toBe(true);
        expect(serializePoll(buildPoll([]), 'u9').canManage).toBe(false);
    });
});
