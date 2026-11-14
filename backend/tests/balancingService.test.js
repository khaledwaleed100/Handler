import { describe, it, expect } from '@jest/globals';
import { balanceTeams } from '../services/balancingService.js';

const p = (id, overall, position = 'MID') => ({ id, overall, position });
const avg = (team, players) => team.reduce((s, id) => s + players.find(x => x.id === id).overall, 0) / team.length;

describe('balanceTeams', () => {
    const ten = [
        p('a', 85, 'FWD'), p('b', 80, 'MID'), p('c', 75, 'DEF'), p('d', 70, 'MID'), p('e', 65, 'FWD'),
        p('f', 60, 'DEF'), p('g', 58, 'MID'), p('h', 55, 'GK'), p('i', 52, 'GK'), p('j', 50, 'MID')
    ];

    it('splits 10 players 5 v 5 with almost equal strength', () => {
        const [best] = balanceTeams(ten);
        expect(best.teamA).toHaveLength(5);
        expect(best.teamB).toHaveLength(5);
        expect(Math.abs(avg(best.teamA, ten) - avg(best.teamB, ten))).toBeLessThanOrEqual(1);
        expect(best.balance).toBeGreaterThanOrEqual(98);
    });

    it('puts the two keepers on different teams', () => {
        const [best] = balanceTeams(ten);
        expect(best.teamA.includes('h')).not.toBe(best.teamA.includes('i'));
    });

    it('returns 3 genuinely different options', () => {
        const options = balanceTeams(ten, { count: 3 });
        expect(options).toHaveLength(3);
        const keys = options.map(o => [...o.teamA].sort().join());
        expect(new Set(keys).size).toBe(3);
    });

    it('keeps "prefer not" pairs apart and reports only counts', () => {
        const players = [p('a', 70), p('b', 70), p('c', 60), p('d', 60)];
        const [best] = balanceTeams(players, { preferences: [{ from: 'a', avoid: ['b'] }] });
        expect(best.teamA.includes('a')).not.toBe(best.teamA.includes('b'));
        expect(best).toMatchObject({ preferencesMet: 1, preferencesTotal: 1 });
        expect(JSON.stringify(best)).not.toMatch(/avoid|with/);
    });

    it('honours "play with" wishes when it costs little balance', () => {
        const players = [p('a', 70), p('b', 69), p('c', 70), p('d', 69)];
        const [best] = balanceTeams(players, { preferences: [{ from: 'a', with: ['b'] }] });
        expect(best.teamA.includes('a')).toBe(best.teamA.includes('b'));
    });

    it('does not let preferences wreck the balance', () => {
        const players = [p('a', 90), p('b', 90), p('c', 50), p('d', 50)];
        const [best] = balanceTeams(players, { preferences: [{ from: 'a', with: ['b'] }] });
        expect(best.teamA.includes('a')).not.toBe(best.teamA.includes('b'));
    });

    it('handles an odd number of players', () => {
        const [best] = balanceTeams(ten.slice(0, 9));
        expect(best.teamA.length + best.teamB.length).toBe(9);
        expect(Math.abs(best.teamA.length - best.teamB.length)).toBe(1);
    });

    it('mixes up teammates from recent weeks', () => {
        const players = [p('a', 60), p('b', 60), p('c', 60), p('d', 60)];
        const [best] = balanceTeams(players, { recentTeams: [['a', 'b'], ['c', 'd'], ['a', 'b'], ['c', 'd']] });
        expect(best.teamA.includes('a')).not.toBe(best.teamA.includes('b'));
    });

    it('rejects too few players', () => {
        expect(() => balanceTeams([p('a', 60)])).toThrow();
    });
});
