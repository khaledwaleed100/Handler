import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import User from '../models/User.js';
import Player from '../models/Player.js';
import Match from '../models/Match.js';
import PeerRating from '../models/PeerRating.js';
import Preference, { MAX_AVOID, MAX_WITH } from '../models/Preference.js';
import Feedback from '../models/Feedback.js';
import { httpError } from '../utils/httpError.js';
import * as v from '../utils/validate.js';
import { meView, publicPlayer } from '../services/views.js';
import { recomputeStandings } from '../services/standingsService.js';
import { publicKey } from '../services/pushService.js';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const avatarUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 3 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) cb(null, true);
        else cb(httpError(400, 'Photo must be JPG, PNG or WebP'));
    }
});

/** Checks the file really is an image by its first bytes, not just its declared type. */
const looksLikeImage = (buf) => {
    if (!buf || buf.length < 12) return false;
    const jpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const png = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const webp = buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
    return jpg || png || webp;
};

const requirePlayer = (req) => {
    if (!req.player) throw httpError(404, 'Player profile not found');
    return req.player;
};

// @route GET /api/me
export const getMe = async (req, res) => {
    res.json({ ...(await meView(req.user, req.player)), pushKey: publicKey() });
};

// @route PUT /api/me  { name, phone, position, selfRating, lang, theme }
export const updateMe = async (req, res) => {
    const b = req.body || {};
    const player = requirePlayer(req);
    const user = req.user;

    const name = v.str(b.name, { min: 2, max: 40, field: 'Name' });
    const phone = v.phone(b.phone);
    const position = v.position(b.position);
    const selfRating = v.selfRating(b.selfRating);

    let ratingsChanged = false;
    if (name) { user.name = name; player.name = name; }
    if (phone !== undefined) user.phone = phone;
    if (position && position !== player.position) { player.position = position; ratingsChanged = true; }
    if (selfRating) { player.selfRating = selfRating; ratingsChanged = true; }
    if (b.lang !== undefined) {
        if (!['en', 'ar'].includes(b.lang)) throw httpError(400, 'Invalid language');
        user.preferences.lang = b.lang;
    }
    if (b.emailNotifications !== undefined) user.preferences.emailNotifications = v.bool(b.emailNotifications, 'Emails');
    if (b.theme !== undefined) {
        if (!['light', 'dark'].includes(b.theme)) throw httpError(400, 'Invalid theme');
        user.preferences.theme = b.theme;
    }

    await user.save();
    await player.save();
    if (ratingsChanged) await recomputeStandings();
    res.json(await meView(user, await Player.findById(player._id)));
};

// @route PUT /api/me/password  { currentPassword, newPassword }
export const changePassword = async (req, res) => {
    const user = await User.findById(req.user._id).select('+passwordHash');
    // People who joined with Google can add a password without a current one.
    if (user.hasPassword && !(await user.matchPassword(req.body?.currentPassword))) throw httpError(400, 'Current password is wrong');
    await user.setPassword(v.password(req.body?.newPassword));
    await user.save();
    res.json({ ok: true });
};

// @route POST /api/me/avatar  (multipart, field "avatar")
export const uploadAvatar = async (req, res) => {
    const player = requirePlayer(req);
    if (!req.file) throw httpError(400, 'No photo uploaded');
    if (!looksLikeImage(req.file.buffer)) throw httpError(400, 'That file is not a photo');
    if (!process.env.CLOUDINARY_CLOUD_NAME) throw httpError(503, 'Photo uploads are not set up yet');

    const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream({
            folder: 'five-a-side/avatars',
            transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
            format: 'webp'
        }, (err, r) => (err ? reject(err) : resolve(r))).end(req.file.buffer);
    });

    const oldId = player.avatarPublicId;
    player.avatarUrl = result.secure_url;
    player.avatarPublicId = result.public_id;
    await player.save();
    if (oldId) cloudinary.uploader.destroy(oldId).catch(() => {});
    res.json({ avatarUrl: player.avatarUrl });
};

// @route GET /api/me/preferences  — only the owner can ever read these
export const getPreferences = async (req, res) => {
    const player = requirePlayer(req);
    const pref = await Preference.findOne({ player: player._id }).lean();
    res.json({ with: (pref?.with || []).map(String), avoid: (pref?.avoid || []).map(String), maxWith: MAX_WITH, maxAvoid: MAX_AVOID });
};

// @route PUT /api/me/preferences  { with: [ids], avoid: [ids] }
export const setPreferences = async (req, res) => {
    const player = requirePlayer(req);
    const withIds = v.idList(req.body?.with ?? [], { max: MAX_WITH, field: 'Play with' });
    const avoidIds = v.idList(req.body?.avoid ?? [], { max: MAX_AVOID, field: 'Prefer not' });
    const me = String(player._id);

    if (withIds.includes(me) || avoidIds.includes(me)) throw httpError(400, 'You cannot pick yourself');
    if (withIds.some(id => avoidIds.includes(id))) throw httpError(400, 'Someone cannot be in both lists');
    const all = [...withIds, ...avoidIds];
    if (all.length && (await Player.countDocuments({ _id: { $in: all } })) !== all.length) {
        throw httpError(400, 'Unknown player');
    }

    await Preference.findOneAndUpdate(
        { player: player._id },
        { with: withIds, avoid: avoidIds },
        { upsert: true }
    );
    res.json({ with: withIds, avoid: avoidIds, maxWith: MAX_WITH, maxAvoid: MAX_AVOID });
};

// @route GET /api/me/attendance  — my punctuality record, newest first
export const getMyAttendance = async (req, res) => {
    const player = requirePlayer(req);
    const matches = await Match.find({ 'attendance.player': player._id })
        .sort({ kickoff: -1 }).limit(30).select('place kickoff attendance status').lean();
    res.json(matches.map(m => {
        const a = m.attendance.find(x => String(x.player) === String(player._id));
        return {
            matchId: String(m._id),
            place: m.place,
            kickoff: m.kickoff,
            state: a.state,
            arrivedAt: a.arrivedAt,
            minutesLate: a.minutesLate,
            dispute: a.dispute,
            canDispute: a.state !== 'on_time' && a.dispute.state === 'none' &&
                Date.now() - new Date(m.kickoff) < 48 * 3600 * 1000
        };
    }));
};

/** Shortest feedback or punctuality note: enough to say what happened. */
const MIN_TEXT = 10;

// @route POST /api/me/attendance/:matchId/dispute  { note }
export const disputeAttendance = async (req, res) => {
    const player = requirePlayer(req);
    v.requireId(req.params.matchId, 'match');
    const note = v.str(req.body?.note, { min: MIN_TEXT, max: 300, field: 'Your note', required: true });

    const match = await Match.findById(req.params.matchId);
    const entry = match?.attendance.find(a => String(a.player) === String(player._id));
    if (!entry) throw httpError(404, 'Nothing to dispute');
    if (entry.state === 'on_time') throw httpError(400, 'You were marked on time');
    if (entry.dispute.state !== 'none') throw httpError(400, 'You already asked about this match');
    if (Date.now() - new Date(match.kickoff) > 48 * 3600 * 1000) throw httpError(400, 'Disputes are open for 48 hours after the match');

    entry.dispute = { state: 'pending', note, at: new Date() };
    await match.save();
    res.json({ ok: true });
};

// @route POST /api/me/push  { subscription }
export const addPushSubscription = async (req, res) => {
    const sub = req.body?.subscription;
    const endpoint = v.url(sub?.endpoint, 'Endpoint');
    if (!endpoint?.startsWith('https://')) throw httpError(400, 'Invalid subscription');
    const keys = {
        p256dh: v.str(sub?.keys?.p256dh, { min: 10, max: 200, field: 'key', required: true }),
        auth: v.str(sub?.keys?.auth, { min: 10, max: 100, field: 'key', required: true })
    };
    await User.updateOne({ _id: req.user._id }, { $pull: { pushSubscriptions: { endpoint } } });
    await User.updateOne({ _id: req.user._id }, { $push: { pushSubscriptions: { $each: [{ endpoint, keys }], $slice: -5 } } });
    res.json({ ok: true });
};

// @route DELETE /api/me/push  { endpoint }
export const removePushSubscription = async (req, res) => {
    const endpoint = v.str(req.body?.endpoint, { max: 1000, field: 'Endpoint', required: true });
    await User.updateOne({ _id: req.user._id }, { $pull: { pushSubscriptions: { endpoint } } });
    res.json({ ok: true });
};

// @route POST /api/me/feedback  { message }
export const sendFeedback = async (req, res) => {
    const message = v.str(req.body?.message, { min: MIN_TEXT, max: 1000, field: 'Your message', required: true });
    await Feedback.create({ userId: req.user._id, message });
    res.status(201).json({ ok: true });
};

// @route DELETE /api/me  { password }
// Deletes the account, profile, photo, preferences and every rating given or received.
// Past match results stay (they belong to everyone), shown as "Former player".
export const deleteMe = async (req, res) => {
    if (req.user.role === 'organizer') throw httpError(400, 'The organizer account cannot be deleted from the app');
    const user = await User.findById(req.user._id).select('+passwordHash');
    // Password accounts confirm with the password; Google-only accounts type their email.
    const confirmed = user.hasPassword
        ? await user.matchPassword(req.body?.password)
        : String(req.body?.password || '').trim().toLowerCase() === user.email;
    if (!confirmed) throw httpError(400, user.hasPassword ? 'Password is wrong' : 'Type your email exactly to confirm');

    const player = req.player;
    if (player) {
        if (player.avatarPublicId) cloudinary.uploader.destroy(player.avatarPublicId).catch(() => {});
        await Promise.all([
            PeerRating.deleteMany({ $or: [{ rater: player._id }, { ratee: player._id }] }),
            Preference.deleteOne({ player: player._id }),
            Preference.updateMany({}, { $pull: { with: player._id, avoid: player._id } }),
            Match.updateMany({ status: 'upcoming' }, { $pull: { rsvps: { player: player._id }, teamA: player._id, teamB: player._id } })
        ]);
        await player.deleteOne();
    }
    await Feedback.deleteMany({ userId: user._id });
    await user.deleteOne();
    await recomputeStandings({ capChanges: false });

    res.clearCookie('refreshToken', { path: '/api/auth' });
    res.json({ ok: true });
};

// @route GET /api/players  — the squad, as public cards
export const listPlayers = async (req, res) => {
    const players = await Player.find().sort({ overall: -1, name: 1 });
    res.json(players.map(publicPlayer));
};

// @route GET /api/players/:id  — one public card plus recent matches
export const getPlayer = async (req, res) => {
    v.requireId(req.params.id, 'player');
    const player = await Player.findById(req.params.id);
    if (!player) throw httpError(404, 'Player not found');

    const recent = await Match.find({ status: 'completed', $or: [{ teamA: player._id }, { teamB: player._id }] })
        .sort({ kickoff: -1 }).limit(8).select('place kickoff teamA teamB score stats mvp ratingsFinalized').lean();

    res.json({
        player: publicPlayer(player),
        recent: recent.map(m => {
            const onA = m.teamA.some(id => String(id) === String(player._id));
            const mine = m.stats.find(s => String(s.player) === String(player._id));
            const [us, them] = onA ? [m.score.a, m.score.b] : [m.score.b, m.score.a];
            return {
                matchId: String(m._id),
                place: m.place,
                kickoff: m.kickoff,
                result: us > them ? 'W' : us === them ? 'D' : 'L',
                score: `${us}-${them}`,
                goals: mine?.goals || 0,
                assists: mine?.assists || 0,
                mvp: m.ratingsFinalized && String(m.mvp) === String(player._id)
            };
        })
    });
};
