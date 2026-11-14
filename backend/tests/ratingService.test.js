import { describe, it, expect } from '@jest/globals';
import {
    aggregatePeerRatings, assignRatings, computeRatings, eloDeltas, eloToSkill, hasConcern,
    robustMean, stepTowards, tapToAttr, MIN_RATERS
} from '../services/ratingService.js';

const allScores = (s) => ({ pace: s, attack: s, passing: s, defence: s, physical: s });

describe('robustMean', () => {
    it('uses the median for small samples, so one extreme value is ignored', () => {
        expect(robustMean([60, 62, 99])).toBe(62);
    });

    it('trims the extremes for larger samples', () => {
        const withOutliers = robustMean([1, 60, 61, 62, 63, 64, 99]);
        expect(withOutliers).toBeGreaterThan(59);
        expect(withOutliers).toBeLessThan(64);
    });

    it('returns null when empty', () => {
        expect(robustMean([])).toBeNull();
    });
});

describe('aggregatePeerRatings', () => {
    it('ignores one revenge rating among fair ones', () => {
        const ratings = ['r1', 'r2', 'r3', 'r4', 'r5'].map((rater, i) => ({
            rater, ratee: 'x', scores: allScores(i === 0 ? 1 : 4), playAgain: true
        }));
        const agg = aggregatePeerRatings(ratings).get('x');
        expect(agg.raterCount).toBe(5);
        expect(agg.attrs.pace).toBe(tapToAttr(4));
    });

    it('leaves attributes nobody rated empty', () => {
        const agg = aggregatePeerRatings([{ rater: 'r1', ratee: 'x', scores: { pace: 3 } }]).get('x');
        expect(agg.attrs.pace).toBe(65);
        expect(agg.attrs.goalkeeping).toBeNull();
    });

    it('counts distinct raters, not ratings', () => {
        const ratings = [
            { rater: 'r1', ratee: 'x', scores: allScores(3) },
            { rater: 'r1', ratee: 'x', scores: allScores(3) }
        ];
        expect(aggregatePeerRatings(ratings).get('x').raterCount).toBe(1);
    });
});

describe('hasConcern', () => {
    const r = (rater, playAgain) => ({ rater, playAgain });

    it('needs at least 3 different people', () => {
        expect(hasConcern([r('a', false), r('b', false), r('c', true)])).toBe(false);
        expect(hasConcern([r('a', false), r('b', false), r('c', false), r('d', true)])).toBe(true);
    });

    it('does not flag when most people are happy', () => {
        const happy = 'defghijklm'.split('').map(x => r(x, true));
        expect(hasConcern([r('a', false), r('b', false), r('c', false), ...happy])).toBe(false);
    });

    it('one person voting many times counts once', () => {
        expect(hasConcern([r('a', false), r('a', false), r('a', false), r('a', false)])).toBe(false);
    });
});

describe('Elo', () => {
    const base = { eloOf: () => 1000, matchesOf: () => 20 };

    it('winners gain exactly what losers lose when teams are even', () => {
        const d = eloDeltas({ ...base, teamA: ['a1', 'a2'], teamB: ['b1', 'b2'], scoreA: 3, scoreB: 2 });
        expect(d.get('a1')).toBeCloseTo(10);
        expect(d.get('b1')).toBeCloseTo(-10);
    });

    it('a big win moves ratings more than a narrow one', () => {
        const narrow = eloDeltas({ ...base, teamA: ['a'], teamB: ['b'], scoreA: 1, scoreB: 0 }).get('a');
        const big = eloDeltas({ ...base, teamA: ['a'], teamB: ['b'], scoreA: 8, scoreB: 0 }).get('a');
        expect(big).toBeGreaterThan(narrow);
    });

    it('beating a stronger team is worth more', () => {
        const eloOf = (id) => (id.startsWith('b') ? 1200 : 1000);
        const upset = eloDeltas({ eloOf, matchesOf: () => 20, teamA: ['a'], teamB: ['b'], scoreA: 1, scoreB: 0 }).get('a');
        expect(upset).toBeGreaterThan(10);
    });

    it('maps 1000 to 60', () => {
        expect(eloToSkill(1000)).toBe(60);
        expect(eloToSkill(1080)).toBe(70);
    });
});

describe('computeRatings', () => {
    const maxSelf = { pace: 99, attack: 99, passing: 99, defence: 99, physical: 99, goalkeeping: 99 };

    it('a self-rating of 99 alone cannot reach the top', () => {
        const r = computeRatings({ position: 'FWD', selfRating: maxSelf });
        expect(r.overall).toBeLessThanOrEqual(80);
        expect(r.provisional).toBe(true);
    });

    it('peer ratings take over from the self-rating', () => {
        const peerAttrs = { pace: 50, attack: 50, passing: 50, defence: 50, physical: 50, goalkeeping: null };
        const r = computeRatings({ position: 'FWD', selfRating: maxSelf, peer: { attrs: peerAttrs, raterCount: 6 } });
        expect(r.attrs.attack).toBe(50);
        expect(r.provisional).toBe(false);
    });

    it('stays provisional until enough different people have rated', () => {
        const peer = { attrs: { pace: 70 }, raterCount: MIN_RATERS - 1 };
        expect(computeRatings({ position: 'MID', peer }).provisional).toBe(true);
    });

    it('results pull the overall towards real performance', () => {
        const winner = computeRatings({ position: 'MID', elo: 1200, matches: 10 });
        const loser = computeRatings({ position: 'MID', elo: 800, matches: 10 });
        expect(winner.overall).toBeGreaterThan(loser.overall);
    });

    it('the organizer adjustment fades out over 5 matches', () => {
        const fresh = computeRatings({ position: 'MID', matches: 2, adjustment: { value: 5, matchesAtSet: 2 } });
        const faded = computeRatings({ position: 'MID', matches: 7, adjustment: { value: 5, matchesAtSet: 2 } });
        const none = computeRatings({ position: 'MID', matches: 7 });
        expect(fresh.overall - computeRatings({ position: 'MID', matches: 2 }).overall).toBe(5);
        expect(faded.overall).toBe(none.overall);
    });

    it('outfield players are not rated up by goalkeeping', () => {
        expect(computeRatings({ position: 'FWD', selfRating: maxSelf }).attrs.goalkeeping).toBeLessThanOrEqual(60);
    });
});

describe('stepTowards', () => {
    it('moves at most 3 points at a time', () => {
        expect(stepTowards(60, 80)).toBe(63);
        expect(stepTowards(60, 50)).toBe(57);
        expect(stepTowards(60, 61)).toBe(61);
    });
});

describe('assignRatings', () => {
    it('everyone rates 4 others and is rated by 4, never themselves', () => {
        const ids = Array.from({ length: 10 }, (_, i) => `p${i}`);
        const tasks = assignRatings(ids, 4);
        const received = new Map();
        for (const t of tasks) {
            expect(t.ratees).toHaveLength(4);
            expect(t.ratees).not.toContain(t.rater);
            expect(new Set(t.ratees).size).toBe(4);
            for (const r of t.ratees) received.set(r, (received.get(r) || 0) + 1);
        }
        expect([...received.values()].every(n => n === 4)).toBe(true);
    });

    it('handles tiny matches', () => {
        const tasks = assignRatings(['a', 'b', 'c'], 4);
        expect(tasks.every(t => t.ratees.length === 2)).toBe(true);
    });
});
