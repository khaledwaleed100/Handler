/**
 * Team balancer: tries every possible split and keeps the best few.
 *
 * For 10 players there are only 126 ways to make two teams of 5, so we can
 * check them all instead of guessing. Each split gets a "cost"; lower is better:
 *
 *   - Strength: difference between the teams' average overall (most important)
 *   - Positions: keepers on different sides, defenders and forwards spread out
 *   - Preferences: "play with" wishes kept together, "prefer not" pairs kept apart
 *   - Variety: the same people shouldn't be teammates every single week
 *
 * Preferences go in as pairs and come out only as a count ("8 of 10 met"),
 * so nobody, including the organizer, can see who asked for what.
 */

export const MAX_PLAYERS = 22;

const W = {
    strength: 4,      // per point of average-overall difference
    keepers: 12,      // two keepers on the same team
    defenders: 3,     // per defender of imbalance beyond 1
    forwards: 2,      // per forward of imbalance beyond 1
    withSplit: 2.5,   // a "play with" wish not met
    avoidTogether: 5, // a "prefer not" pair on the same team
    repeat: 0.6       // per pair that were teammates in a recent match
};

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** All index combinations of size k from 0..n-1 (optionally forcing index 0 in). */
function* combinations(n, k, forceFirst) {
    const combo = forceFirst ? [0] : [];
    function* rec(start) {
        if (combo.length === k) { yield combo; return; }
        for (let i = start; i < n; i++) {
            if (n - i < k - combo.length) return;
            combo.push(i);
            yield* rec(i + 1);
            combo.pop();
        }
    }
    yield* rec(forceFirst ? 1 : 0);
}

/**
 * players:     [{ id, overall, position }]
 * preferences: [{ from, with: [ids], avoid: [ids] }]
 * recentTeams: [[ids], [ids], ...] teams from recent matches (for variety)
 * Returns up to `count` options, best first.
 */
export const balanceTeams = (players, { preferences = [], recentTeams = [], count = 3 } = {}) => {
    const n = players.length;
    if (n < 2) throw new Error('Need at least 2 players');
    if (n > MAX_PLAYERS) throw new Error(`At most ${MAX_PLAYERS} players`);

    const ids = players.map(p => String(p.id));
    const index = new Map(ids.map((id, i) => [id, i]));
    const overall = players.map(p => p.overall);
    const pos = players.map(p => p.position);
    const mean = overall.reduce((s, v) => s + v, 0) / n;

    // Preference pairs among the players in this match.
    const withPairs = [];
    const avoidPairs = [];
    for (const pref of preferences) {
        const a = index.get(String(pref.from));
        if (a === undefined) continue;
        for (const b of (pref.with || []).map(String)) if (index.has(b)) withPairs.push([a, index.get(b)]);
        for (const b of (pref.avoid || []).map(String)) if (index.has(b)) avoidPairs.push([a, index.get(b)]);
    }
    const totalPrefs = withPairs.length + avoidPairs.length;

    // How often each pair were teammates recently.
    const repeatCount = new Map();
    for (const team of recentTeams) {
        const inTeam = team.map(String).filter(id => index.has(id));
        for (let i = 0; i < inTeam.length; i++) {
            for (let j = i + 1; j < inTeam.length; j++) {
                const k = pairKey(index.get(inTeam[i]), index.get(inTeam[j]));
                repeatCount.set(k, (repeatCount.get(k) || 0) + 1);
            }
        }
    }

    const sizeA = Math.floor(n / 2);
    const even = n % 2 === 0;
    const results = [];
    const side = new Array(n);

    for (const combo of combinations(n, sizeA, even)) {
        side.fill(1);
        for (const i of combo) side[i] = 0;

        let sumA = 0, sumB = 0;
        const pc = [{ GK: 0, DEF: 0, MID: 0, FWD: 0 }, { GK: 0, DEF: 0, MID: 0, FWD: 0 }];
        for (let i = 0; i < n; i++) {
            if (side[i] === 0) sumA += overall[i]; else sumB += overall[i];
            pc[side[i]][pos[i]] = (pc[side[i]][pos[i]] || 0) + 1;
        }
        const avgA = sumA / sizeA;
        const avgB = sumB / (n - sizeA);
        const diff = Math.abs(avgA - avgB);

        let cost = diff * W.strength;
        const keepers = pc[0].GK + pc[1].GK;
        if (keepers >= 2 && (pc[0].GK === 0 || pc[1].GK === 0)) cost += W.keepers;
        const defImb = Math.abs((pc[0].DEF + pc[0].GK) - (pc[1].DEF + pc[1].GK));
        if (defImb > 1) cost += (defImb - 1) * W.defenders;
        const fwdImb = Math.abs(pc[0].FWD - pc[1].FWD);
        if (fwdImb > 1) cost += (fwdImb - 1) * W.forwards;

        let met = 0;
        for (const [a, b] of withPairs) {
            if (side[a] === side[b]) met++; else cost += W.withSplit;
        }
        for (const [a, b] of avoidPairs) {
            if (side[a] !== side[b]) met++; else cost += W.avoidTogether;
        }

        for (const [k, times] of repeatCount) {
            const [a, b] = k.split('|').map(Number);
            if (side[a] === side[b]) cost += W.repeat * times;
        }

        results.push({ cost, sideKey: side.join(''), avgA, avgB, diff, met });
    }

    results.sort((a, b) => a.cost - b.cost);

    // Pick distinct options: each must differ from the ones already picked by
    // more than a single swap, so the organizer gets real alternatives.
    const picked = [];
    const differs = (x, y) => {
        let d = 0;
        for (let i = 0; i < n; i++) if (x[i] !== y[i]) d++;
        return Math.min(d, n - d); // mirror images are the same split
    };
    for (const r of results) {
        if (picked.every(p => differs(p.sideKey, r.sideKey) > 2)) picked.push(r);
        if (picked.length === count) break;
    }
    if (picked.length < count) {
        for (const r of results) {
            if (!picked.includes(r)) picked.push(r);
            if (picked.length === count) break;
        }
    }

    return picked.map(r => ({
        teamA: ids.filter((_, i) => r.sideKey[i] === '0'),
        teamB: ids.filter((_, i) => r.sideKey[i] === '1'),
        strengthA: Math.round(r.avgA * 10) / 10,
        strengthB: Math.round(r.avgB * 10) / 10,
        balance: Math.max(0, Math.round(100 * (1 - r.diff / (mean || 1)))),
        preferencesMet: r.met,
        preferencesTotal: totalPrefs
    }));
};
