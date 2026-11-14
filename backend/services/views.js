/**
 * What each kind of viewer is allowed to see. Every API response that
 * contains player or match data goes through one of these functions, so the
 * privacy rules live in one place:
 *
 *   - Everyone:        public card (name, position, overall, attributes, stats, form, positive badges)
 *   - The player:      + own self-rating, peer breakdown (once 4+ people rated), punctuality, adjustment value
 *   - The organizer:   + contact details, punctuality, concern flag, adjustment reason and history
 *
 * Never sent to anyone: who rated whom, MVP votes, "play again" answers,
 * "play with / prefer not" choices.
 */
import Player from '../models/Player.js';
import User from '../models/User.js';
import { MIN_RATERS, eloToSkill } from './ratingService.js';
import { rsvpLists } from './matchService.js';

const plain = (doc) => (doc?.toObject ? doc.toObject() : doc);

export const badgesFor = (p) => {
    const b = [];
    const s = p.stats || {};
    const r = p.reliability || {};
    const counted = (r.onTime || 0) + (r.late || 0) + (r.noShow || 0);
    if (counted >= 5 && (r.onTime || 0) / counted >= 0.9 && (r.lateDrop || 0) <= 1) b.push('reliable');
    if ((s.mvp || 0) >= 1) b.push('mvp');
    if ((s.matches || 0) >= 5 && (s.goals || 0) / s.matches >= 1) b.push('scorer');
    if ((s.assists || 0) >= 5 && (s.assists || 0) >= (s.goals || 0)) b.push('playmaker');
    if ((s.matches || 0) >= 25) b.push('veteran');
    const form = p.form || [];
    if (form.length >= 3 && form.slice(-3).every(x => x === 'W')) b.push('hot');
    return b;
};

export const publicPlayer = (doc) => {
    const p = plain(doc);
    if (!p) return null;
    return {
        _id: String(p._id),
        name: p.name,
        position: p.position,
        avatarUrl: p.avatarUrl,
        overall: p.overall,
        provisional: p.provisional,
        attrs: p.attrs,
        stats: p.stats,
        form: p.form || [],
        badges: badgesFor(p)
    };
};

export const selfPlayer = (doc) => {
    const p = plain(doc);
    const showPeer = (p.peer?.raterCount || 0) >= MIN_RATERS;
    return {
        ...publicPlayer(p),
        selfRating: p.selfRating,
        peer: showPeer ? { attrs: p.peer.attrs, raterCount: p.peer.raterCount } : null,
        resultsSkill: Math.round(eloToSkill(p.elo ?? 1000)),
        adjustment: p.adjustment?.value || 0,
        reliability: p.reliability
    };
};

export const organizerPlayer = (doc, user) => {
    const p = plain(doc);
    const u = plain(user) || {};
    return {
        ...selfPlayer(p),
        role: u.role,
        contact: {
            email: u.email,
            // The phone number is only shown if the player agreed to share it.
            phone: u.contactConsentAt ? u.phone : null
        },
        concernFlag: !!p.concernFlag,
        adjustment: p.adjustment?.value || 0,
        adjustmentReason: p.adjustment?.reason || null,
        adjustmentLog: (p.adjustmentLog || []).slice(-10).reverse()
    };
};

/** Loads all players referenced by the matches, as public cards keyed by id. */
const loadPlayerCards = async (matches) => {
    const ids = new Set();
    for (const m of matches) {
        for (const r of m.rsvps || []) ids.add(String(r.player));
        for (const id of [...(m.teamA || []), ...(m.teamB || [])]) ids.add(String(id));
        for (const s of m.stats || []) ids.add(String(s.player));
        if (m.mvp) ids.add(String(m.mvp));
    }
    const players = await Player.find({ _id: { $in: [...ids] } });
    return Object.fromEntries(players.map(p => [String(p._id), publicPlayer(p)]));
};

const matchSummary = (m, viewer) => {
    const me = viewer.player ? String(viewer.player._id) : null;
    const lists = rsvpLists(m);
    const showTeams = m.teamsPublished || viewer.isOrganizer;
    const myRsvp = m.rsvps.find(r => String(r.player) === me);
    const task = m.ratingAssignments?.find(a => String(a.rater) === me);
    const myPayment = m.payments?.find(p => String(p.player) === me);

    return {
        _id: String(m._id),
        place: m.place,
        mapUrl: m.mapUrl,
        kickoff: m.kickoff,
        capacity: m.capacity,
        price: m.price,
        status: m.status,
        rsvp: lists,
        myRsvp: myRsvp ? myRsvp.status : null,
        myPlace: lists.confirmed.includes(me) ? 'confirmed' : lists.waitlist.includes(me) ? 'waitlist' : null,
        teamsPublished: m.teamsPublished,
        teamA: showTeams ? m.teamA.map(String) : [],
        teamB: showTeams ? m.teamB.map(String) : [],
        score: m.status === 'completed' ? m.score : null,
        stats: m.status === 'completed' ? m.stats.map(s => ({ player: String(s.player), goals: s.goals, assists: s.assists })) : [],
        mvp: m.ratingsFinalized && m.mvp ? String(m.mvp) : null,
        ratings: m.status === 'completed' ? {
            closesAt: m.ratingsClosesAt,
            finalized: m.ratingsFinalized,
            myTaskPending: !!task && !task.done && !m.ratingsFinalized,
            done: (m.ratingAssignments || []).filter(a => a.done).length,
            total: (m.ratingAssignments || []).length
        } : null,
        myAttendance: (m.attendance || []).find(a => String(a.player) === me) || null,
        myPayment: m.price > 0 && lists.confirmed.includes(me) || myPayment ? { paid: !!myPayment?.paid } : null,
        // Organizer-only details.
        attendance: viewer.isOrganizer ? m.attendance : undefined,
        payments: viewer.isOrganizer ? m.payments : undefined
    };
};

export const matchView = async (match, viewer) => {
    const m = plain(match);
    return { ...matchSummary(m, viewer), players: await loadPlayerCards([m]) };
};

export const matchListView = async (matches, viewer) => {
    const list = matches.map(plain);
    return { matches: list.map(m => matchSummary(m, viewer)), players: await loadPlayerCards(list) };
};

export const meView = async (user, player) => ({
    user: {
        _id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        contactConsent: !!user.contactConsentAt,
        preferences: user.preferences
    },
    player: player ? selfPlayer(player) : null
});

export const usersById = async (ids) => {
    const users = await User.find({ _id: { $in: ids } });
    return new Map(users.map(u => [String(u._id), u]));
};
