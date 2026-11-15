import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

/**
 * End-to-end: a whole match week through the real API, on an in-memory MongoDB.
 * Checks the happy path and, just as importantly, what each person must NOT see or do.
 */
let mongoServer;
let app;
const people = {}; // key → { token, playerId, email, agent }
let inviteCode;
let matchId;

const PASSWORD = 'secret123';
const SELF = { pace: 70, attack: 70, passing: 70, defence: 70, physical: 70, goalkeeping: 40 };
const auth = (key) => ({ Authorization: `Bearer ${people[key].token}` });

const signUp = async (key, { position = 'MID', invite = inviteCode, selfRating = SELF, setupCode } = {}) => {
    const email = `${key}@test.dev`;
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/register').send({
        email, password: PASSWORD, name: key, phone: '+20 100 000 0000', position, selfRating,
        consent: true, inviteCode: invite, setupCode
    });
    if (res.status === 201) people[key] = { token: res.body.accessToken, playerId: res.body.player._id, email, agent };
    return res;
};

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongoServer.getUri();
    process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1';
    process.env.REFRESH_TOKEN_SECRET = 'test-refresh-test-refresh-test-refresh-1';
    process.env.ORGANIZER_EMAIL = 'boss@test.dev';
    process.env.ORGANIZER_SETUP_CODE = 'setup-code-1234';
    process.env.PORT = '0';
    app = (await import('../server.js')).default;
    await mongoose.connection.asPromise();
}, 120000);

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer?.stop();
});

describe('Joining the group', () => {
    it('refuses the organizer email without the setup code (stops someone grabbing it)', async () => {
        const res = await signUp('boss', { invite: undefined, setupCode: 'guess' });
        expect(res.status).toBe(403);
    });

    it('lets the organizer email sign up with the setup code', async () => {
        const res = await signUp('boss', { invite: undefined, setupCode: 'setup-code-1234' });
        expect(res.status).toBe(201);
        expect(res.body.user.role).toBe('organizer');
    });

    it('refuses strangers without the invite link', async () => {
        const res = await signUp('stranger', { invite: 'wrong-code' });
        expect(res.status).toBe(403);
    });

    it('gives the organizer an invite link, and members can join with it', async () => {
        const res = await request(app).get('/api/organizer/overview').set(auth('boss'));
        inviteCode = res.body.settings.inviteCode;
        expect(inviteCode).toBeTruthy();
        expect((await request(app).get(`/api/auth/invite/${inviteCode}`)).body.valid).toBe(true);

        const positions = ['GK', 'DEF', 'DEF', 'MID', 'MID', 'FWD', 'FWD', 'GK', 'MID', 'FWD'];
        for (let i = 0; i < positions.length; i++) {
            expect((await signUp(`p${i}`, { position: positions[i] })).status).toBe(201);
        }
    });

    it('requires consent to share contact details', async () => {
        const res = await request(app).post('/api/auth/register').send({
            email: 'noconsent@test.dev', password: PASSWORD, name: 'No', phone: '+201000000000',
            position: 'MID', inviteCode, consent: false
        });
        expect(res.status).toBe(400);
    });

    it('rejects weak passwords and duplicate emails', async () => {
        expect((await request(app).post('/api/auth/register').send({
            email: 'weak@test.dev', password: 'short', name: 'W', phone: '+201000000000', position: 'MID', inviteCode, consent: true
        })).status).toBe(400);
        expect((await signUp('p0')).status).toBe(409);
    });
});

describe('Security basics', () => {
    it('blocks MongoDB operator injection in login', async () => {
        const res = await request(app).post('/api/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
        expect(res.status).toBe(400);
    });

    it('gives the same answer for a wrong email and a wrong password', async () => {
        const a = await request(app).post('/api/auth/login').send({ email: 'nobody@test.dev', password: PASSWORD });
        const b = await request(app).post('/api/auth/login').send({ email: 'p1@test.dev', password: 'wrongpass1' });
        expect(a.status).toBe(401);
        expect(b.status).toBe(401);
        expect(a.body.message).toBe(b.body.message);
    });

    it('locks an account after 10 wrong passwords', async () => {
        for (let i = 0; i < 10; i++) {
            await request(app).post('/api/auth/login').set('X-Forwarded-For', `10.0.0.${i}`).send({ email: 'p6@test.dev', password: `wrong${i}pass` });
        }
        const locked = await request(app).post('/api/auth/login').set('X-Forwarded-For', '10.0.1.1').send({ email: 'p6@test.dev', password: PASSWORD });
        expect(locked.status).toBe(429);
    });

    it('keeps people signed in with the refresh cookie, and rotates it', async () => {
        const first = await people.p1.agent.post('/api/auth/refresh');
        expect(first.status).toBe(200);
        expect(first.body.accessToken).toBeTruthy();
        const second = await people.p1.agent.post('/api/auth/refresh');
        expect(second.status).toBe(200);
    });

    it('cannot promote yourself to organizer through the profile', async () => {
        await request(app).put('/api/me').set(auth('p1')).send({ role: 'organizer', name: 'p1' });
        const me = await request(app).get('/api/me').set(auth('p1'));
        expect(me.body.user.role).toBe('member');
    });

    it('members cannot use organizer routes', async () => {
        expect((await request(app).post('/api/matches').set(auth('p1')).send({ place: 'X', kickoff: new Date().toISOString() })).status).toBe(403);
        expect((await request(app).get('/api/organizer/overview').set(auth('p1'))).status).toBe(403);
    });

    it('the squad list never contains contact details or private flags', async () => {
        const res = await request(app).get('/api/players').set(auth('p1'));
        const text = JSON.stringify(res.body);
        expect(res.body).toHaveLength(11);
        expect(text).not.toMatch(/@test\.dev|\+20|concernFlag|selfRating|adjustment|reliability/);
    });

    it('the organizer sees contact details', async () => {
        const res = await request(app).get('/api/organizer/overview').set(auth('boss'));
        const p1 = res.body.members.find(m => m._id === people.p1.playerId);
        expect(p1.contact.email).toBe('p1@test.dev');
        expect(p1.contact.phone).toBe('+20 100 000 0000');
    });
});

describe('Match week', () => {
    it('organizer creates a match', async () => {
        const kickoff = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
        const res = await request(app).post('/api/matches').set(auth('boss'))
            .send({ place: 'The Cage', kickoff, capacity: 10, mapUrl: 'https://maps.google.com/?q=cage' });
        expect(res.status).toBe(201);
        matchId = res.body._id;
    });

    it('fills 10 spots and puts the 11th on the waitlist', async () => {
        for (const key of ['boss', ...Array.from({ length: 9 }, (_, i) => `p${i}`)]) {
            expect((await request(app).post(`/api/matches/${matchId}/rsvp`).set(auth(key)).send({ status: 'in' })).status).toBe(200);
        }
        const res = await request(app).post(`/api/matches/${matchId}/rsvp`).set(auth('p9')).send({ status: 'in' });
        expect(res.body.myPlace).toBe('waitlist');
        expect(res.body.rsvp.confirmed).toHaveLength(10);
    });

    it('moves the waitlist up when someone drops, and records the late drop-out', async () => {
        await request(app).post(`/api/matches/${matchId}/rsvp`).set(auth('p8')).send({ status: 'out' });
        const res = await request(app).get(`/api/matches/${matchId}`).set(auth('p9'));
        expect(res.body.myPlace).toBe('confirmed');
        expect(JSON.stringify(res.body)).not.toContain('lateDrops');
    });

    it('stores private preferences that only the owner can read', async () => {
        const put = await request(app).put('/api/me/preferences').set(auth('p1'))
            .send({ with: [people.p2.playerId], avoid: [people.p3.playerId] });
        expect(put.status).toBe(200);
        const mine = await request(app).get('/api/me/preferences').set(auth('p1'));
        expect(mine.body.avoid).toEqual([people.p3.playerId]);
        const theirs = await request(app).get('/api/me/preferences').set(auth('p3'));
        expect(theirs.body.avoid).toEqual([]);
    });

    it('rejects too many preferences and picking yourself', async () => {
        const ids = ['p2', 'p3', 'p4', 'p5'].map(k => people[k].playerId);
        expect((await request(app).put('/api/me/preferences').set(auth('p1')).send({ with: ids, avoid: [] })).status).toBe(400);
        expect((await request(app).put('/api/me/preferences').set(auth('p1')).send({ with: [people.p1.playerId], avoid: [] })).status).toBe(400);
    });

    it('suggests balanced teams and only reports preference counts', async () => {
        const res = await request(app).post(`/api/matches/${matchId}/teams/suggest`).set(auth('boss'));
        expect(res.status).toBe(200);
        expect(res.body.options).toHaveLength(3);
        const [best] = res.body.options;
        expect(best.teamA.length + best.teamB.length).toBe(10);
        expect(best.preferencesTotal).toBe(2);
        expect(best.teamA.includes(people.p1.playerId)).not.toBe(best.teamA.includes(people.p3.playerId));
        expect(JSON.stringify(res.body)).not.toMatch(/"avoid"|"with"/);
    });

    it('hides teams from members until published', async () => {
        const { body } = await request(app).post(`/api/matches/${matchId}/teams/suggest`).set(auth('boss'));
        const [best] = body.options;
        await request(app).put(`/api/matches/${matchId}/teams`).set(auth('boss')).send({ teamA: best.teamA, teamB: best.teamB, publish: false });
        expect((await request(app).get(`/api/matches/${matchId}`).set(auth('p1'))).body.teamA).toEqual([]);

        const pub = await request(app).put(`/api/matches/${matchId}/teams`).set(auth('boss')).send({ teamA: best.teamA, teamB: best.teamB, publish: true });
        expect(pub.status).toBe(200);
        expect((await request(app).get(`/api/matches/${matchId}`).set(auth('p1'))).body.teamA).toHaveLength(5);
    });

    it('shows the organizer who has seen the match, not members', async () => {
        await request(app).get(`/api/matches/${matchId}`).set(auth('p7'));
        const org = await request(app).get(`/api/matches/${matchId}`).set(auth('boss'));
        expect(org.body.seen).toContain(people.p7.playerId);
        const member = await request(app).get(`/api/matches/${matchId}`).set(auth('p7'));
        expect(member.body.seen).toBeUndefined();
    });

    it('lets only the organizer notify the group, and not twice in 30 minutes', async () => {
        expect((await request(app).post(`/api/matches/${matchId}/notify`).set(auth('p1')).send({ kind: 'soon' })).status).toBe(403);
        const first = await request(app).post(`/api/matches/${matchId}/notify`).set(auth('boss')).send({ kind: 'soon' });
        expect(first.status).toBe(200);
        expect(first.body.recipients).toBe(9); // everyone confirmed except the organizer
        expect((await request(app).post(`/api/matches/${matchId}/notify`).set(auth('boss')).send({ kind: 'soon' })).status).toBe(429);
        expect((await request(app).post(`/api/matches/${matchId}/notify`).set(auth('boss')).send({ kind: 'message' })).status).toBe(400);
    });

    it('refuses teams with players who are not confirmed', async () => {
        const res = await request(app).put(`/api/matches/${matchId}/teams`).set(auth('boss'))
            .send({ teamA: [people.p8.playerId], teamB: [people.p0.playerId] });
        expect(res.status).toBe(400);
    });

    it('records lateness; the player sees their own record, others do not', async () => {
        const late = new Date(Date.now() + 2 * 3600 * 1000 + 15 * 60 * 1000).toISOString();
        const res = await request(app).post(`/api/matches/${matchId}/checkin`).set(auth('boss'))
            .send({ playerId: people.p2.playerId, state: 'arrived', arrivedAt: late });
        expect(res.body.attendance.find(a => a.player === people.p2.playerId).state).toBe('late');

        const mine = await request(app).get(`/api/matches/${matchId}`).set(auth('p2'));
        expect(mine.body.myAttendance.minutesLate).toBe(15);
        const other = await request(app).get(`/api/matches/${matchId}`).set(auth('p1'));
        expect(other.body.attendance).toBeUndefined();
        expect(other.body.myAttendance).toBeNull();
    });

    it('lets a player dispute lateness once, and the organizer decide', async () => {
        const first = await request(app).post(`/api/me/attendance/${matchId}/dispute`).set(auth('p2')).send({ note: 'I was parking outside' });
        expect(first.status).toBe(200);
        const again = await request(app).post(`/api/me/attendance/${matchId}/dispute`).set(auth('p2')).send({ note: 'again' });
        expect(again.status).toBe(400);

        const overview = await request(app).get('/api/organizer/overview').set(auth('boss'));
        expect(overview.body.disputes).toHaveLength(1);
        const decide = await request(app).post('/api/organizer/disputes').set(auth('boss'))
            .send({ matchId, playerId: people.p2.playerId, decision: 'accept' });
        expect(decide.status).toBe(200);

        const record = await request(app).get('/api/me/attendance').set(auth('p2'));
        expect(record.body[0].dispute.state).toBe('accepted');
    });

    it('saves the result and updates everyone\'s stats from it', async () => {
        const match = (await request(app).get(`/api/matches/${matchId}`).set(auth('boss'))).body;
        const scorer = match.teamA[0];
        const res = await request(app).post(`/api/matches/${matchId}/result`).set(auth('boss'))
            .send({ score: { a: 3, b: 1 }, stats: [{ player: scorer, goals: 2, assists: 0 }] });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('completed');

        const card = (await request(app).get(`/api/players/${scorer}`).set(auth('p1'))).body;
        expect(card.player.stats).toMatchObject({ matches: 1, wins: 1, goals: 2 });
        expect(card.recent[0]).toMatchObject({ result: 'W', score: '3-1', goals: 2 });
    });

    it('cannot enter stats for someone who did not play', async () => {
        const res = await request(app).post(`/api/matches/${matchId}/result`).set(auth('boss'))
            .send({ score: { a: 3, b: 1 }, stats: [{ player: people.p8.playerId, goals: 1 }] });
        expect(res.status).toBe(400);
    });
});

describe('Rating round', () => {
    const fiveTaps = { pace: 4, attack: 4, passing: 4, defence: 4, physical: 4 };

    it('gives each player 4 people to rate, and nobody sees who rates whom', async () => {
        const task = await request(app).get(`/api/matches/${matchId}/rating-task`).set(auth('p1'));
        expect(task.status).toBe(200);
        expect(task.body.ratees).toHaveLength(4);
        expect(task.body.ratees).not.toContain(people.p1.playerId);

        const match = await request(app).get(`/api/matches/${matchId}`).set(auth('boss'));
        expect(JSON.stringify(match.body)).not.toMatch(/ratingAssignments|mvpVotes|rater/);
    });

    it('rejects rating someone you were not given', async () => {
        const task = (await request(app).get(`/api/matches/${matchId}/rating-task`).set(auth('p1'))).body;
        const notMine = [...Object.keys(task.players)].find(id => !task.ratees.includes(id));
        const ratings = [...task.ratees.slice(0, 3), notMine].map(ratee => ({ ratee, scores: fiveTaps, playAgain: true }));
        expect((await request(app).post(`/api/matches/${matchId}/ratings`).set(auth('p1')).send({ ratings })).status).toBe(400);
    });

    it('accepts one submission per person, then finalizes when everyone is done', async () => {
        const match = (await request(app).get(`/api/matches/${matchId}`).set(auth('boss'))).body;
        const played = [...match.teamA, ...match.teamB];
        const keyOf = (pid) => Object.keys(people).find(k => people[k].playerId === pid);
        const mvp = match.teamA[0];

        for (const pid of played) {
            const key = keyOf(pid);
            const task = (await request(app).get(`/api/matches/${matchId}/rating-task`).set(auth(key))).body;
            const ratings = task.ratees.map(ratee => ({ ratee, scores: fiveTaps, playAgain: true }));
            const res = await request(app).post(`/api/matches/${matchId}/ratings`).set(auth(key))
                .send({ ratings, mvp: pid === mvp ? match.teamA[1] : mvp });
            expect(res.status).toBe(200);
        }

        const key = keyOf(played[0]);
        const task = (await request(app).get(`/api/matches/${matchId}/rating-task`).set(auth(key))).body;
        const again = await request(app).post(`/api/matches/${matchId}/ratings`).set(auth(key))
            .send({ ratings: task.ratees.map(ratee => ({ ratee, scores: fiveTaps, playAgain: true })) });
        expect(again.status).toBe(400);

        const after = (await request(app).get(`/api/matches/${matchId}`).set(auth('p1'))).body;
        expect(after.ratings.finalized).toBe(true);
        expect(after.mvp).toBe(mvp);
    });

    it('shows a player their own peer breakdown once 4+ people rated them', async () => {
        const me = (await request(app).get('/api/me').set(auth('p1'))).body;
        expect(me.player.peer.raterCount).toBe(4);
        expect(me.player.peer.attrs.pace).toBe(80);
        expect(me.player.provisional).toBe(false);
    });
});

describe('Organizer adjustment', () => {
    it('needs a reason, is capped at ±5, and is logged', async () => {
        const id = people.p4.playerId;
        expect((await request(app).put(`/api/organizer/players/${id}/adjustment`).set(auth('boss')).send({ value: 3 })).status).toBe(400);
        expect((await request(app).put(`/api/organizer/players/${id}/adjustment`).set(auth('boss')).send({ value: 9, reason: 'new_player' })).status).toBe(400);
        const ok = await request(app).put(`/api/organizer/players/${id}/adjustment`).set(auth('boss')).send({ value: 3, reason: 'new_player' });
        expect(ok.status).toBe(200);
        expect(ok.body.adjustmentLog[0]).toMatchObject({ value: 3, reason: 'new_player' });

        const mine = (await request(app).get('/api/me').set(auth('p4'))).body;
        expect(mine.player.adjustment).toBe(3);
        expect(JSON.stringify(mine)).not.toContain('new_player');
    });
});

describe('Polls', () => {
    it('lets the organizer open a poll early, everyone vote once, and close it', async () => {
        const created = await request(app).post('/api/polls/generate').set(auth('boss')).send({ type: 'weekly', force: true });
        expect(created.status).toBe(201);
        const poll = created.body;
        const candidate = poll.candidates[0]._id;

        expect((await request(app).post(`/api/polls/${poll._id}/vote`).set(auth('p1')).send({ playerId: candidate })).status).toBe(200);
        expect((await request(app).post(`/api/polls/${poll._id}/vote`).set(auth('p1')).send({ playerId: candidate })).status).toBe(409);
        expect((await request(app).post(`/api/polls/${poll._id}/close`).set(auth('p1'))).status).toBe(403);

        const closed = await request(app).post(`/api/polls/${poll._id}/close`).set(auth('boss'));
        expect(closed.body.winnerId).toBe(candidate);
    });

    it('runs a Team of the Week vote: up to five picks each, the most-voted are crowned', async () => {
        const created = await request(app).post('/api/polls/generate').set(auth('boss')).send({ type: 'team', force: true });
        expect(created.status).toBe(201);
        const poll = created.body;
        expect(poll.picks).toBe(5);
        expect(poll.candidates.length).toBeGreaterThan(5);
        const ids = poll.candidates.map(c => c._id);
        const vote = (key, playerIds) => request(app).post(`/api/polls/${poll._id}/vote`).set(auth(key)).send({ playerIds });

        expect((await vote('p1', ids.slice(0, 6))).status).toBe(400);
        expect((await vote('p1', ids.slice(0, 5))).status).toBe(200);
        expect((await vote('p1', ids.slice(0, 5))).status).toBe(409);
        const mine = await vote('p2', ids.slice(0, 2));
        expect(mine.body).toMatchObject({ totalVotes: 2, hasVoted: true, myVotes: ids.slice(0, 2) });

        const closed = await request(app).post(`/api/polls/${poll._id}/close`).set(auth('boss'));
        expect(closed.body.winnerIds).toHaveLength(5);
        expect(closed.body.winnerIds.slice(0, 2).sort()).toEqual(ids.slice(0, 2).sort());
    });
});

describe('Organizer favourites and match details', () => {
    it('stars and un-stars a player, for the organizer only', async () => {
        const id = people.p2.playerId;
        expect((await request(app).put(`/api/organizer/players/${id}/favorite`).set(auth('p1')).send({ favorite: true })).status).toBe(403);
        expect((await request(app).put(`/api/organizer/players/${id}/favorite`).set(auth('boss')).send({ favorite: true })).body).toEqual([id]);
        const overview = (await request(app).get('/api/organizer/overview').set(auth('boss'))).body;
        expect(overview.members.find(m => m._id === id).favorite).toBe(true);
        expect((await request(app).put(`/api/organizer/players/${id}/favorite`).set(auth('boss')).send({ favorite: false })).body).toEqual([]);
        expect((await request(app).get('/api/organizer/favorites').set(auth('boss'))).body).toEqual([]);
    });

    it('sends the match details to the players who are in', async () => {
        const kickoff = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
        const match = (await request(app).post('/api/matches').set(auth('boss')).send({ place: 'Details Arena', kickoff })).body;
        expect((await request(app).post(`/api/matches/${match._id}/rsvp`).set(auth('p1')).send({ status: 'in' })).status).toBe(200);
        const sent = await request(app).post(`/api/matches/${match._id}/notify`).set(auth('boss')).send({ kind: 'details' });
        expect(sent.status).toBe(200);
        expect(sent.body.recipients).toBe(1);
        await request(app).delete(`/api/matches/${match._id}`).set(auth('boss'));
    });
});

describe('Weekly repeat and automatic reminders', () => {
    it('reminds the group the day before, once, and creates next week\'s match at kick-off', async () => {
        const { default: Match } = await import('../models/Match.js');
        const { runDueJobs } = await import('../services/schedulerService.js');
        const hour = 3600 * 1000;
        const kickoff = new Date(Date.now() + 23 * hour);
        const created = await request(app).post('/api/matches').set(auth('boss'))
            .send({ place: 'Weekly Arena', kickoff: kickoff.toISOString(), repeatWeekly: true });
        expect(created.body.repeatWeekly).toBe(true);
        const id = created.body._id;
        await request(app).post(`/api/matches/${id}/rsvp`).set(auth('p1')).send({ status: 'in' });

        // A match created moments ago is not reminded about: "New match" has just gone out.
        expect((await runDueJobs({ force: true })).reminders).toBe(0);
        await Match.collection.updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { createdAt: new Date(Date.now() - 5 * hour) } });
        expect((await runDueJobs({ force: true })).reminders).toBe(1);
        expect((await runDueJobs({ force: true })).reminders).toBe(0);
        const seen = (await request(app).get(`/api/matches/${id}`).set(auth('boss'))).body;
        expect(seen.notifications.map(n => n.kind)).toContain('auto24');

        // Kick-off passes: next week's match appears, exactly once.
        await Match.updateOne({ _id: id }, { $set: { kickoff: new Date(Date.now() - hour) } });
        expect((await runDueJobs({ force: true })).spawned).toBe(1);
        expect((await runDueJobs({ force: true })).spawned).toBe(0);
        const upcoming = (await request(app).get('/api/matches').set(auth('p1'))).body.matches.filter(m => m.place === 'Weekly Arena');
        const next = upcoming.find(m => m._id !== id);
        expect(next).toMatchObject({ repeatWeekly: true, status: 'upcoming' });
        expect(Math.round((new Date(next.kickoff) - Date.now()) / (24 * hour))).toBe(7);

        // The organizer can stop the series; turning reminders off silences them.
        expect((await request(app).put(`/api/matches/${next._id}`).set(auth('boss')).send({ repeatWeekly: false })).body.repeatWeekly).toBe(false);
        expect((await request(app).put('/api/organizer/settings').set(auth('boss')).send({ autoReminders: false })).body.autoReminders).toBe(false);
        for (const m of upcoming) await request(app).delete(`/api/matches/${m._id}`).set(auth('boss'));
    });
});

describe('Usage stats and Google sign-in', () => {
    it('gives the organizer usage numbers without anyone\'s answers', async () => {
        const res = await request(app).get('/api/organizer/overview').set(auth('boss'));
        expect(res.body.stats.members).toBe(11);
        expect(res.body.stats.active7).toBeGreaterThan(0);
        const p1 = res.body.members.find(m => m._id === people.p1.playerId);
        expect(p1.usage.replies).toBe(1);
        expect(JSON.stringify(res.body)).not.toMatch(/playAgain|mvpVotes|"avoid"/);
    });

    it('reports Google sign-in as not set up without a client id', async () => {
        expect((await request(app).get('/api/config')).body.googleClientId).toBeNull();
        expect((await request(app).post('/api/auth/google').send({ credential: 'x' })).status).toBe(503);
    });

    it('rejects a forged Google sign-up token', async () => {
        const res = await request(app).post('/api/auth/google/complete')
            .send({ signupToken: 'forged', phone: '+201000000000', position: 'MID', consent: true });
        expect(res.status).toBe(400);
    });
});

describe('Account deletion', () => {
    it('deletes an account and everything personal about it', async () => {
        expect((await request(app).delete('/api/me').set(auth('p9')).send({ password: 'wrong' })).status).toBe(400);
        expect((await request(app).delete('/api/me').set(auth('p9')).send({ password: PASSWORD })).status).toBe(200);
        expect((await request(app).get('/api/players').set(auth('p1'))).body.some(p => p._id === people.p9.playerId)).toBe(false);
        expect((await request(app).post('/api/auth/login').send({ email: 'p9@test.dev', password: PASSWORD })).status).toBe(401);
    });

    it('the organizer account cannot be deleted from the app', async () => {
        expect((await request(app).delete('/api/me').set(auth('boss')).send({ password: PASSWORD })).status).toBe(400);
    });
});
