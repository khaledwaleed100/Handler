/**
 * Rating engine: pure functions, no database. Unit-tested in tests/ratingService.test.js.
 *
 * A player's overall comes from three sources:
 *
 *   1. Self-rating: entered at sign-up. Pulled halfway towards average (60),
 *      and its weight fades to zero as peer ratings arrive.
 *   2. Peer ratings: 1-5 taps from people who played in the same match.
 *      Combined with a trimmed, rater-weighted mean, so a single revenge
 *      rating or a friend inflating a friend gets ignored.
 *   3. Results (Elo): wins, losses and goal difference. Can't be gamed,
 *      and its weight grows with matches played.
 *
 * On top of that, an optional organizer adjustment (-5..+5) that fades over 5 matches.
 */
import { ATTRIBUTES } from '../models/Player.js';

export const NEUTRAL = 60;
/** Distinct raters needed before peer data is shown to the player (anonymity). */
export const MIN_RATERS = 4;
/** Raters needed before peer data fully replaces the self-rating. */
const FULL_PEER_RATERS = 6;
/** Max change of the visible overall per match. */
export const MAX_STEP_PER_MATCH = 3;
/** Ratings considered per player (most recent first). */
export const PEER_WINDOW = 40;

const OUTFIELD = ['pace', 'attack', 'passing', 'defence', 'physical'];
const POSITION_WEIGHTS = {
    GK: { goalkeeping: 3, defence: 1, passing: 1, physical: 1, pace: 0.5, attack: 0 },
    DEF: { defence: 2, physical: 1.5, pace: 1, passing: 1, attack: 0.5, goalkeeping: 0 },
    MID: { passing: 2, pace: 1, attack: 1, defence: 1, physical: 1, goalkeeping: 0 },
    FWD: { attack: 2, pace: 1.5, passing: 1, physical: 1, defence: 0.5, goalkeeping: 0 }
};

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 1-5 tap → 1-99 attribute scale (1→35, 3→65, 5→95). */
export const tapToAttr = (s) => 20 + 15 * s;

/**
 * Mean with outliers removed. Drops the top and bottom 15% once there are
 * at least 5 values; with fewer, uses the median, which already ignores extremes.
 * Values can carry weights: [{ v, w }].
 */
export const robustMean = (items) => {
    const list = items.map(x => (typeof x === 'number' ? { v: x, w: 1 } : x)).filter(x => Number.isFinite(x.v));
    if (list.length === 0) return null;
    list.sort((a, b) => a.v - b.v);
    if (list.length < 5) {
        const mid = Math.floor(list.length / 2);
        return list.length % 2 ? list[mid].v : (list[mid - 1].v + list[mid].v) / 2;
    }
    const cut = Math.max(1, Math.floor(list.length * 0.15));
    const kept = list.slice(cut, list.length - cut);
    const wSum = kept.reduce((s, x) => s + x.w, 0);
    return kept.reduce((s, x) => s + x.v * x.w, 0) / wSum;
};

/**
 * Turns raw peer ratings into per-player attribute averages.
 *
 * ratings: [{ rater, ratee, scores: { pace: 1-5, ... }, playAgain }]
 * Returns Map(rateeId → { attrs: { pace: 1-99 | null, ... }, raterCount }).
 *
 * Rater weighting: a first pass finds the consensus for each player; raters who
 * keep disagreeing with it (in either direction) count for less, down to 40%.
 */
export const aggregatePeerRatings = (ratings) => {
    const byRatee = new Map();
    for (const r of ratings) {
        const key = String(r.ratee);
        if (!byRatee.has(key)) byRatee.set(key, []);
        byRatee.get(key).push(r);
    }

    // Pass 1: unweighted consensus.
    const consensus = new Map();
    for (const [ratee, list] of byRatee) {
        const attrs = {};
        for (const a of ATTRIBUTES) {
            attrs[a] = robustMean(list.filter(r => r.scores?.[a]).map(r => tapToAttr(r.scores[a])));
        }
        consensus.set(ratee, attrs);
    }

    // Rater reliability: mean absolute distance from consensus.
    const deviation = new Map();
    for (const r of ratings) {
        const c = consensus.get(String(r.ratee));
        const key = String(r.rater);
        const d = deviation.get(key) || { sum: 0, n: 0 };
        for (const a of ATTRIBUTES) {
            if (r.scores?.[a] && c[a] !== null) {
                d.sum += Math.abs(tapToAttr(r.scores[a]) - c[a]);
                d.n += 1;
            }
        }
        deviation.set(key, d);
    }
    const weightOf = (rater) => {
        const d = deviation.get(String(rater));
        if (!d || d.n < 3) return 1; // not enough history to judge
        return clamp(1 / (1 + Math.max(0, d.sum / d.n - 8) / 15), 0.4, 1);
    };

    // Pass 2: weighted, trimmed mean.
    const result = new Map();
    for (const [ratee, list] of byRatee) {
        const attrs = {};
        for (const a of ATTRIBUTES) {
            const m = robustMean(list.filter(r => r.scores?.[a]).map(r => ({ v: tapToAttr(r.scores[a]), w: weightOf(r.rater) })));
            attrs[a] = m === null ? null : Math.round(m);
        }
        result.set(ratee, { attrs, raterCount: new Set(list.map(r => String(r.rater))).size });
    }
    return result;
};

/**
 * "Several different people aren't enjoying games with this player."
 * Needs at least 3 distinct people, and at least 40% of distinct raters.
 */
export const hasConcern = (ratingsAboutPlayer) => {
    const byRater = new Map();
    for (const r of ratingsAboutPlayer) {
        const k = String(r.rater);
        byRater.set(k, (byRater.get(k) || false) || r.playAgain === false);
    }
    const negatives = [...byRater.values()].filter(Boolean).length;
    return negatives >= 3 && negatives / byRater.size >= 0.4;
};

// ── Results (Elo) ─────────────────────────────────────────────────────────

export const ELO_START = 1000;

/** Elo → 1-99 skill. 1000 = 60; every 80 Elo points ≈ 10 skill points. */
export const eloToSkill = (elo) => clamp(NEUTRAL + (elo - ELO_START) / 8, 1, 99);

/**
 * Elo change for one match. Every player on a team moves by the same amount
 * (scaled by their own K: new players move faster).
 * Returns Map(playerId → delta).
 */
export const eloDeltas = ({ teamA, teamB, scoreA, scoreB, eloOf, matchesOf }) => {
    const deltas = new Map();
    if (!teamA.length || !teamB.length) return deltas;
    const avg = (team) => team.reduce((s, id) => s + eloOf(id), 0) / team.length;
    const expectedA = 1 / (1 + 10 ** ((avg(teamB) - avg(teamA)) / 400));
    const resultA = scoreA > scoreB ? 1 : scoreA === scoreB ? 0.5 : 0;
    const gd = Math.abs(scoreA - scoreB);
    const margin = gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8;
    const k = (id) => (matchesOf(id) < 10 ? 32 : 20);

    for (const id of teamA) deltas.set(String(id), k(id) * margin * (resultA - expectedA));
    for (const id of teamB) deltas.set(String(id), k(id) * margin * ((1 - resultA) - (1 - expectedA)));
    return deltas;
};

// ── Putting it together ───────────────────────────────────────────────────

/** Weighted average of attributes for a position. */
export const positionScore = (attrs, position) => {
    const w = POSITION_WEIGHTS[position] || POSITION_WEIGHTS.MID;
    let sum = 0;
    let wSum = 0;
    for (const a of ATTRIBUTES) {
        if (!w[a]) continue;
        sum += attrs[a] * w[a];
        wSum += w[a];
    }
    return wSum ? sum / wSum : NEUTRAL;
};

/**
 * Computes the target ratings for one player.
 *
 * input: { position, selfRating, peer: { attrs, raterCount }, elo, matches,
 *          adjustment: { value, matchesAtSet } }
 * returns: { attrs, overall, provisional }
 */
export const computeRatings = ({ position, selfRating = {}, peer = {}, elo = ELO_START, matches = 0, adjustment = {} }) => {
    const raterCount = peer.raterCount || 0;
    const peerWeight = clamp(raterCount / FULL_PEER_RATERS, 0, 1);

    const attrs = {};
    for (const a of ATTRIBUTES) {
        const self = selfRating[a] ?? NEUTRAL;
        const selfEffective = NEUTRAL + (self - NEUTRAL) * 0.5; // you can't rate yourself to the top
        const peerValue = peer.attrs?.[a];
        attrs[a] = Math.round(peerValue == null ? selfEffective : peerWeight * peerValue + (1 - peerWeight) * selfEffective);
        attrs[a] = clamp(attrs[a], 1, 99);
    }
    // Outfield players don't get judged on goalkeeping, and keepers mostly on it.
    if (position !== 'GK') attrs.goalkeeping = Math.min(attrs.goalkeeping, NEUTRAL);

    const eloWeight = 0.4 * clamp(matches / 5, 0, 1);
    const base = (1 - eloWeight) * positionScore(attrs, position) + eloWeight * eloToSkill(elo);

    const sinceAdjust = matches - (adjustment.matchesAtSet || 0);
    const adj = (adjustment.value || 0) * clamp(1 - sinceAdjust / 5, 0, 1);

    return {
        attrs,
        overall: clamp(Math.round(base + adj), 1, 99),
        provisional: raterCount < MIN_RATERS
    };
};

/** Moves a visible number towards its target by at most `max`. */
export const stepTowards = (current, target, max = MAX_STEP_PER_MATCH) =>
    current + clamp(target - current, -max, max);

/**
 * Splits rating work after a match: each player rates `perRater` others,
 * and everyone receives the same number of ratings.
 * Circular assignment over a shuffled list.
 */
export const assignRatings = (playerIds, perRater = 4, random = Math.random) => {
    const ids = [...playerIds].map(String);
    for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const k = Math.min(perRater, ids.length - 1);
    return ids.map((rater, i) => ({
        rater,
        ratees: Array.from({ length: k }, (_, step) => ids[(i + step + 1) % ids.length])
    }));
};

export { OUTFIELD };
