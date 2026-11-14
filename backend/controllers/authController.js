import jwt from 'jsonwebtoken';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import User from '../models/User.js';
import Player from '../models/Player.js';
import { getSettings } from '../models/Settings.js';
import { httpError } from '../utils/httpError.js';
import * as v from '../utils/validate.js';
import { meView } from '../services/views.js';
import { recomputeStandings } from '../services/standingsService.js';
import { emailConfigured, sendResetCode } from '../services/emailService.js';

const ACCESS_TTL = '15m';
const REFRESH_TTL_DAYS = 30;
const RESET_TTL_MS = 15 * 60 * 1000;
const RESET_MAX_ATTEMPTS = 5;

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const safeEqual = (a, b) => {
    const x = Buffer.from(a || '');
    const y = Buffer.from(b || '');
    return x.length === y.length && timingSafeEqual(x, y);
};

const signAccess = (user) => jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: ACCESS_TTL, algorithm: 'HS256' });
const signRefresh = (user) => jwt.sign({ id: String(user._id) }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: `${REFRESH_TTL_DAYS}d`, algorithm: 'HS256' });

// The refresh cookie is only sent to /api/auth, can't be read by JavaScript,
// and isn't sent from other websites.
const cookieOptions = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: REFRESH_TTL_DAYS * 24 * 3600 * 1000
});

const MAX_DEVICES = 5;

/**
 * Issues a new token pair. Only a hash of the refresh token is stored.
 * `replaceHash` is the hash of the token being rotated out (on refresh).
 */
const startSession = async (res, user, replaceHash = null) => {
    const refresh = signRefresh(user);
    const kept = (user.refreshTokenHashes || []).filter(h => h !== replaceHash);
    user.refreshTokenHashes = [...kept, sha256(refresh)].slice(-MAX_DEVICES);
    await user.save();
    res.cookie('refreshToken', refresh, cookieOptions());
    return signAccess(user);
};

const isOrganizerEmail = (email) =>
    !!process.env.ORGANIZER_EMAIL && email === process.env.ORGANIZER_EMAIL.trim().toLowerCase();

// @route GET /api/auth/invite/:code  — is this invite link valid?
export const checkInvite = async (req, res) => {
    const settings = await getSettings();
    const code = String(req.params.code || '');
    if (!safeEqual(code, settings.inviteCode)) throw httpError(404, 'This invite link is not valid any more');
    res.json({ valid: true, groupName: settings.groupName });
};

// @route POST /api/auth/register
// Sign-up needs the group's invite code. The one exception is ORGANIZER_EMAIL
// (set on the server), which creates the organizer account.
export const register = async (req, res) => {
    const b = req.body || {};
    const email = v.email(b.email);
    const organizer = isOrganizerEmail(email);

    if (!organizer) {
        const settings = await getSettings();
        if (!safeEqual(String(b.inviteCode || ''), settings.inviteCode)) {
            throw httpError(403, 'You need an invite link from the organizer to join');
        }
    }
    if (b.consent !== true) throw httpError(400, 'Please agree to share your contact details with the organizer');

    const name = v.str(b.name, { min: 2, max: 40, field: 'Name', required: true });
    const pass = v.password(b.password);
    const phone = v.phone(b.phone, true);
    const position = v.position(b.position, true);
    const selfRating = v.selfRating(b.selfRating ?? {});

    if (await User.exists({ email })) throw httpError(409, 'An account with this email already exists');

    const user = new User({
        email,
        name,
        phone,
        role: organizer ? 'organizer' : 'member',
        contactConsentAt: new Date(),
        preferences: { lang: b.lang === 'ar' ? 'ar' : 'en' }
    });
    await user.setPassword(pass);
    await user.save();

    try {
        await Player.create({ user: user._id, name, position, selfRating, attrs: selfRating });
    } catch (err) {
        await user.deleteOne();
        throw err;
    }
    await recomputeStandings({ capChanges: false });

    const accessToken = await startSession(res, user);
    res.status(201).json({ accessToken, ...(await meView(user, await Player.findOne({ user: user._id }))) });
};

// @route POST /api/auth/login
export const login = async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const user = email ? await User.findOne({ email }).select('+passwordHash +refreshTokenHashes') : null;
    // Same message whether the email exists or not.
    if (!user || !(await user.matchPassword(req.body?.password))) throw httpError(401, 'Wrong email or password');

    const accessToken = await startSession(res, user);
    res.json({ accessToken, ...(await meView(user, await Player.findOne({ user: user._id }))) });
};

// @route POST /api/auth/refresh  — swaps the cookie for a fresh token pair (rotation)
export const refresh = async (req, res) => {
    const token = req.cookies?.refreshToken;
    if (!token) throw httpError(401, 'Not signed in');

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET, { algorithms: ['HS256'] });
    } catch {
        throw httpError(401, 'Not signed in');
    }
    const hash = sha256(token);
    const user = await User.findById(decoded.id).select('+refreshTokenHashes');
    if (!user || !user.refreshTokenHashes.some(h => safeEqual(h, hash))) {
        // A valid but already-used token means it may have been stolen: end every session.
        if (user) { user.refreshTokenHashes = []; await user.save(); }
        res.clearCookie('refreshToken', { ...cookieOptions(), maxAge: undefined });
        throw httpError(401, 'Not signed in');
    }

    const accessToken = await startSession(res, user, hash);
    res.json({ accessToken, ...(await meView(user, await Player.findOne({ user: user._id }))) });
};

// @route POST /api/auth/logout
export const logout = async (req, res) => {
    const token = req.cookies?.refreshToken;
    if (token) {
        await User.updateOne({ refreshTokenHashes: sha256(token) }, { $pull: { refreshTokenHashes: sha256(token) } });
    }
    res.clearCookie('refreshToken', { ...cookieOptions(), maxAge: undefined });
    res.json({ ok: true });
};

// @route POST /api/auth/forgot  — emails a 6-digit code. Always answers the same way.
export const forgotPassword = async (req, res) => {
    if (!emailConfigured()) throw httpError(503, 'Password reset by email is not set up yet. Ask the organizer.');
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const user = email ? await User.findOne({ email }) : null;
    if (user) {
        const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
        user.resetCodeHash = sha256(`${user._id}:${code}`);
        user.resetCodeExpires = new Date(Date.now() + RESET_TTL_MS);
        user.resetAttempts = 0;
        await user.save();
        try {
            await sendResetCode(user.email, user.name, code);
        } catch (err) {
            console.error('Reset email failed:', err.message);
        }
    }
    res.json({ ok: true, message: 'If that email has an account, a code is on its way.' });
};

// @route POST /api/auth/reset  { email, code, newPassword }
export const resetPassword = async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const code = String(req.body?.code || '');
    const newPassword = v.password(req.body?.newPassword);

    const user = email ? await User.findOne({ email }).select('+resetCodeHash +resetCodeExpires +resetAttempts') : null;
    const invalid = httpError(400, 'Wrong or expired code');
    if (!user || !user.resetCodeHash || user.resetCodeExpires < new Date()) throw invalid;

    if (user.resetAttempts >= RESET_MAX_ATTEMPTS) {
        user.resetCodeHash = undefined;
        await user.save();
        throw httpError(400, 'Too many wrong codes. Ask for a new one.');
    }
    if (!safeEqual(user.resetCodeHash, sha256(`${user._id}:${code}`))) {
        user.resetAttempts += 1;
        await user.save();
        throw invalid;
    }

    await user.setPassword(newPassword);
    user.resetCodeHash = undefined;
    user.resetCodeExpires = undefined;
    user.resetAttempts = 0;
    user.refreshTokenHashes = []; // sign out everywhere
    await user.save();
    res.json({ ok: true });
};
