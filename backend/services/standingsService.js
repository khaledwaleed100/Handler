/**
 * Recomputes every player's numbers from the source data.
 *
 * Instead of adding and subtracting stats as things change (which drifts and
 * breaks when a result is edited), this replays all completed matches in order.
 * A friends' group has at most a few hundred matches, so this takes milliseconds.
 */
import Player from '../models/Player.js';
import Match from '../models/Match.js';
import PeerRating from '../models/PeerRating.js';
import {
    ELO_START, PEER_WINDOW, aggregatePeerRatings, computeRatings, eloDeltas, hasConcern, stepTowards
} from './ratingService.js';

const emptyState = () => ({
    elo: ELO_START,
    stats: { matches: 0, wins: 0, draws: 0, losses: 0, goals: 0, assists: 0, mvp: 0 },
    form: [],
    reliability: { onTime: 0, late: 0, noShow: 0, lateDrop: 0 },
    playedMatches: []
});

/**
 * @param {object} opts
 * @param {boolean} opts.capChanges  limit how far the visible overall moves (after matches)
 */
export const recomputeStandings = async ({ capChanges = true } = {}) => {
    const players = await Player.find();
    if (players.length === 0) return;

    const state = new Map(players.map(p => [String(p._id), emptyState()]));
    const get = (id) => state.get(String(id));

    const matches = await Match.find({ status: 'completed' }).sort({ kickoff: 1 }).lean();

    for (const m of matches) {
        const teamA = m.teamA.map(String).filter(id => state.has(id));
        const teamB = m.teamB.map(String).filter(id => state.has(id));
        const scoreA = m.score?.a ?? 0;
        const scoreB = m.score?.b ?? 0;

        const deltas = eloDeltas({
            teamA, teamB, scoreA, scoreB,
            eloOf: id => get(id).elo,
            matchesOf: id => get(id).stats.matches
        });
        for (const [id, d] of deltas) get(id).elo += d;

        const result = (id, onA) => {
            if (scoreA === scoreB) return 'D';
            return (scoreA > scoreB) === onA ? 'W' : 'L';
        };
        for (const [team, onA] of [[teamA, true], [teamB, false]]) {
            for (const id of team) {
                const s = get(id);
                const r = result(id, onA);
                s.stats.matches += 1;
                if (r === 'W') s.stats.wins += 1;
                else if (r === 'D') s.stats.draws += 1;
                else s.stats.losses += 1;
                s.form.push(r);
                s.playedMatches.push(String(m._id));
            }
        }

        for (const st of m.stats || []) {
            const s = get(st.player);
            if (!s) continue;
            s.stats.goals += st.goals || 0;
            s.stats.assists += st.assists || 0;
        }
        if (m.mvp && get(m.mvp)) get(m.mvp).stats.mvp += 1;

        // Punctuality. Players nobody checked in count as on time (benefit of the doubt).
        const marked = new Set();
        for (const a of m.attendance || []) {
            const s = get(a.player);
            if (!s) continue;
            marked.add(String(a.player));
            const accepted = a.dispute?.state === 'accepted';
            if (a.state === 'no_show' && !accepted) s.reliability.noShow += 1;
            else if (a.state === 'late' && !accepted) s.reliability.late += 1;
            else s.reliability.onTime += 1;
        }
        for (const id of [...teamA, ...teamB]) {
            if (!marked.has(id)) get(id).reliability.onTime += 1;
        }
    }

    // Late drop-outs count for any match whose kickoff has passed.
    const withDrops = await Match.find({ 'lateDrops.0': { $exists: true }, kickoff: { $lte: new Date() } })
        .select('lateDrops').lean();
    for (const m of withDrops) {
        for (const d of m.lateDrops) {
            const s = get(d.player);
            if (s) s.reliability.lateDrop += 1;
        }
    }

    // Peer ratings: only from matches whose rating window has closed.
    const finalizedIds = matches.filter(m => m.ratingsFinalized).map(m => m._id);
    const ratings = await PeerRating.find({ match: { $in: finalizedIds } })
        .sort({ createdAt: -1 })
        .select('match rater ratee scores playAgain')
        .lean();

    const recentByRatee = new Map();
    for (const r of ratings) {
        const k = String(r.ratee);
        const list = recentByRatee.get(k) || [];
        if (list.length < PEER_WINDOW) list.push(r);
        recentByRatee.set(k, list);
    }
    const peer = aggregatePeerRatings([...recentByRatee.values()].flat());

    const ops = players.map(p => {
        const id = String(p._id);
        const s = get(id);
        const agg = peer.get(id) || { attrs: {}, raterCount: 0 };

        // Concern flag: "play again" answers from the player's last 10 matches.
        const lastTen = new Set(s.playedMatches.slice(-10));
        const recent = (recentByRatee.get(id) || []).filter(r => lastTen.has(String(r.match)));

        const target = computeRatings({
            position: p.position,
            selfRating: p.selfRating?.toObject ? p.selfRating.toObject() : p.selfRating,
            peer: agg,
            elo: s.elo,
            matches: s.stats.matches,
            adjustment: p.adjustment
        });

        // New players (no matches yet) jump straight to their target.
        const overall = capChanges && s.stats.matches > 0 ? stepTowards(p.overall ?? target.overall, target.overall) : target.overall;

        return {
            updateOne: {
                filter: { _id: p._id },
                update: {
                    $set: {
                        elo: Math.round(s.elo * 10) / 10,
                        stats: s.stats,
                        form: s.form.slice(-5),
                        reliability: s.reliability,
                        'peer.attrs': agg.attrs,
                        'peer.raterCount': agg.raterCount,
                        attrs: target.attrs,
                        overall,
                        provisional: target.provisional,
                        concernFlag: hasConcern(recent)
                    }
                }
            }
        };
    });

    await Player.bulkWrite(ops);
};
