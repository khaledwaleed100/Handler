import mongoose from 'mongoose';
import { httpError } from './httpError.js';
import { ATTRIBUTES, POSITIONS } from '../models/Player.js';

/**
 * Small, explicit validators. Every controller copies only the fields it
 * expects from req.body, through these helpers, so nobody can sneak in
 * extra fields such as `role` or `stats`.
 */
export const isId = (v) => typeof v === 'string' && mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(v);

export const requireId = (v, what = 'id') => {
    if (!isId(v)) throw httpError(400, `Invalid ${what}`);
    return v;
};

export const str = (v, { min = 0, max = 200, field = 'value', required = false } = {}) => {
    if (v === undefined || v === null || v === '') {
        if (required) throw httpError(400, `${field} is required`);
        return v === '' ? '' : undefined;
    }
    if (typeof v !== 'string') throw httpError(400, `${field} must be text`);
    const s = v.trim();
    if (s.length < min) throw httpError(400, `${field} needs at least ${min} characters`);
    if (s.length > max) throw httpError(400, `${field} can be at most ${max} characters`);
    return s;
};

export const int = (v, { min, max, field = 'value', required = false } = {}) => {
    if (v === undefined || v === null || v === '') {
        if (required) throw httpError(400, `${field} is required`);
        return undefined;
    }
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) throw httpError(400, `${field} must be a whole number ${min}-${max}`);
    return n;
};

export const bool = (v, field = 'value') => {
    if (typeof v !== 'boolean') throw httpError(400, `${field} must be true or false`);
    return v;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const email = (v) => {
    const s = str(v, { min: 5, max: 254, field: 'Email', required: true }).toLowerCase();
    if (!EMAIL_RE.test(s)) throw httpError(400, 'Invalid email');
    return s;
};

export const password = (v) => {
    if (typeof v !== 'string' || v.length < 8 || v.length > 128) {
        throw httpError(400, 'Password must be 8-128 characters');
    }
    if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) throw httpError(400, 'Password needs at least one letter and one number');
    return v;
};

const PHONE_RE = /^\+?[0-9 ()-]{7,20}$/;
export const phone = (v, required = false) => {
    const s = str(v, { max: 20, field: 'Phone', required });
    if (!s) return s;
    if (!PHONE_RE.test(s)) throw httpError(400, 'Invalid phone number');
    return s;
};

export const position = (v, required = false) => {
    if (v === undefined && !required) return undefined;
    if (!POSITIONS.includes(v)) throw httpError(400, 'Invalid position');
    return v;
};

/** Self-rating: each attribute 1-99. Missing attributes default to 60. */
export const selfRating = (v) => {
    if (v === undefined) return undefined;
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw httpError(400, 'Invalid self rating');
    const out = {};
    for (const a of ATTRIBUTES) {
        out[a] = int(v[a] ?? 60, { min: 1, max: 99, field: a });
    }
    return out;
};

export const url = (v, field = 'Link') => {
    const s = str(v, { max: 500, field });
    if (!s) return s;
    let parsed;
    try { parsed = new URL(s); } catch { throw httpError(400, `${field} is not a valid link`); }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw httpError(400, `${field} must be a web link`);
    return parsed.toString();
};

export const date = (v, field = 'Date') => {
    const d = new Date(v);
    if (typeof v !== 'string' || Number.isNaN(d.getTime())) throw httpError(400, `Invalid ${field}`);
    return d;
};

export const idList = (v, { max, field = 'list' }) => {
    if (!Array.isArray(v)) throw httpError(400, `${field} must be a list`);
    if (v.length > max) throw httpError(400, `${field} can have at most ${max} entries`);
    const ids = v.map(x => requireId(x, field));
    return [...new Set(ids)];
};
