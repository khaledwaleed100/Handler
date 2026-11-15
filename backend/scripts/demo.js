/**
 * Local demo: starts the app on a temporary in-memory database filled with a
 * sample group (organizer + 11 players, 3 played matches, 1 upcoming).
 * Nothing touches your real database. Everything disappears when you stop it.
 *
 *   npm run demo        (from the backend folder; build the frontend first)
 *
 * Organizer login:  organizer@demo.test / demo1234
 * Player login:     omar@demo.test / demo1234   (any first name below works)
 */
import path from 'path';
import { fileURLToPath } from 'url';

// Reuse the database binary the tests already downloaded, wherever this is started from.
process.env.MONGOMS_DOWNLOAD_DIR ||= path.join(path.dirname(fileURLToPath(import.meta.url)), '../node_modules/.cache/mongodb-memory-server');
const { MongoMemoryServer } = await import('mongodb-memory-server');

const mongo = await MongoMemoryServer.create();
process.env.MONGO_URI = mongo.getUri();
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET ||= 'demo-only-secret-demo-only-secret-12345';
process.env.REFRESH_TOKEN_SECRET ||= 'demo-only-refresh-demo-only-refresh-123';
process.env.ORGANIZER_EMAIL = 'organizer@demo.test';
process.env.PORT ||= '3000';
for (const k of ['CLOUDINARY_CLOUD_NAME', 'GMAIL_USER', 'VAPID_PUBLIC_KEY']) delete process.env[k];

await import('../server.js');
const mongoose = (await import('mongoose')).default;
await mongoose.connection.asPromise();

const { default: User } = await import('../models/User.js');
const { default: Player } = await import('../models/Player.js');
const { default: Match } = await import('../models/Match.js');
const { default: PeerRating } = await import('../models/PeerRating.js');
const { getSettings } = await import('../models/Settings.js');
const { assignRatings } = await import('../services/ratingService.js');
const { recomputeStandings } = await import('../services/standingsService.js');

const people = [
    ['Khaled', 'MID', 72], ['Omar', 'FWD', 78], ['Youssef', 'DEF', 66], ['Mahmoud', 'GK', 70], ['Ahmed', 'MID', 64],
    ['Karim', 'FWD', 85], ['Hassan', 'DEF', 60], ['Mostafa', 'MID', 75], ['Ali', 'GK', 58], ['Tarek', 'FWD', 62],
    ['Ziad', 'DEF', 70], ['Seif', 'MID', 68]
];
const players = [];
for (const [i, [name, position, level]] of people.entries()) {
    const email = i === 0 ? 'organizer@demo.test' : `${name.toLowerCase()}@demo.test`;
    const user = new User({ email, name: `${name} ${['Waleed', 'Hany', 'Adel', 'Samir', 'Fathy', 'Nabil'][i % 6]}`, phone: `+20 10 ${1000000 + i * 7919}`, role: i === 0 ? 'organizer' : 'member', contactConsentAt: new Date() });
    await user.setPassword('demo1234');
    await user.save();
    const self = { pace: level, attack: level, passing: level, defence: level, physical: level, goalkeeping: position === 'GK' ? level : 40 };
    players.push({ level, doc: await Player.create({ user: user._id, name: user.name, position, selfRating: self, attrs: self }) });
}

const day = 24 * 3600 * 1000;
const settings = await getSettings();
settings.groupName = 'Tuesday Ballers';
await settings.save();

// Three played matches with results and finished rating rounds.
for (let w = 3; w >= 1; w--) {
    const squad = players.slice(0, 10).sort(() => Math.random() - 0.5);
    const teamA = squad.slice(0, 5);
    const teamB = squad.slice(5);
    const strength = (t) => t.reduce((s, p) => s + p.level, 0);
    const a = Math.max(0, Math.round((strength(teamA) - strength(teamB)) / 15 + 3 + Math.random() * 2));
    const b = Math.max(0, Math.round((strength(teamB) - strength(teamA)) / 15 + 3 + Math.random() * 2));
    const kickoff = new Date(Date.now() - w * 7 * day);
    const ids = squad.map(p => p.doc._id);
    const scorer = (team, n) => Array.from({ length: n }, () => team[Math.floor(Math.random() * team.length)].doc._id);
    const goals = new Map();
    for (const id of [...scorer(teamA, a), ...scorer(teamB, b)]) goals.set(String(id), (goals.get(String(id)) || 0) + 1);

    const match = await Match.create({
        createdBy: players[0].doc.user, place: 'El Shams Club', kickoff, capacity: 10, status: 'completed',
        rsvps: ids.map(id => ({ player: id, status: 'in', at: new Date(kickoff - 3 * day) })),
        teamA: teamA.map(p => p.doc._id), teamB: teamB.map(p => p.doc._id), teamsPublished: true,
        score: { a, b }, stats: [...goals].map(([player, g]) => ({ player, goals: g, assists: Math.random() < 0.5 ? 1 : 0 })),
        attendance: [{ player: ids[1], state: 'late', arrivedAt: new Date(+kickoff + 12 * 60000), minutesLate: 12 }],
        completedAt: kickoff, ratingsClosesAt: new Date(+kickoff + 3 * day), ratingsFinalized: true,
        mvp: [...goals].sort((x, y) => y[1] - x[1])[0]?.[0] || ids[0]
    });
    const levelOf = new Map(players.map(p => [String(p.doc._id), p.level]));
    for (const task of assignRatings(ids.map(String), 4)) {
        for (const ratee of task.ratees) {
            const tap = () => Math.min(5, Math.max(1, Math.round((levelOf.get(ratee) - 35) / 12 + (Math.random() - 0.5))));
            await PeerRating.create({ match: match._id, rater: task.rater, ratee, scores: { pace: tap(), attack: tap(), passing: tap(), defence: tap(), physical: tap() }, playAgain: true });
        }
    }
}

// Next match: Saturday-ish, 8 confirmed so far.
const next = new Date(Date.now() + 2 * day);
next.setHours(20, 0, 0, 0);
await Match.create({
    createdBy: players[0].doc.user, place: 'El Shams Club', kickoff: next, capacity: 10,
    rsvps: players.slice(0, 8).map((p, i) => ({ player: p.doc._id, status: 'in', at: new Date(Date.now() - (10 - i) * 3600e3) }))
        .concat([{ player: players[10].doc._id, status: 'maybe', at: new Date() }])
});

await recomputeStandings({ capChanges: false });

console.log('\n  Demo ready → http://localhost:' + process.env.PORT);
console.log('  Organizer: organizer@demo.test / demo1234');
console.log('  Player:    omar@demo.test / demo1234\n');
console.log('  Invite link for new players: http://localhost:' + process.env.PORT + '/join/' + settings.inviteCode + '\n');
