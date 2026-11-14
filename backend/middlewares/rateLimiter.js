import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const json = (message) => ({ message });
const base = { standardHeaders: 'draft-7', legacyHeaders: false };

// General API budget. Friends on the same Wi-Fi share one IP, so it is generous.
export const apiLimiter = rateLimit({
    ...base,
    windowMs: 15 * 60 * 1000,
    limit: 600,
    message: json('Too many requests, please slow down.'),
    skip: (req) => req.path.startsWith('/polls')
});

// Polls are refreshed live while the vote screen is open.
export const pollLimiter = rateLimit({
    ...base,
    windowMs: 60 * 1000,
    limit: 120,
    message: json('Too many poll requests, slow down for a moment.')
});

// Login / sign-up: keyed per IP + email, so one person guessing passwords
// gets blocked without locking out everyone else on the same Wi-Fi.
export const authLimiter = rateLimit({
    ...base,
    windowMs: 15 * 60 * 1000,
    limit: 10,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|${String(req.body?.email || '').toLowerCase()}`,
    message: json('Too many attempts. Try again in 15 minutes.')
});

// Password reset codes and invite-code checks: strict, to stop guessing.
export const strictLimiter = rateLimit({
    ...base,
    windowMs: 60 * 60 * 1000,
    limit: 10,
    message: json('Too many attempts. Try again later.')
});
