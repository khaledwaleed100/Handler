import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Player from '../models/Player.js';
import { httpError } from '../utils/httpError.js';

/**
 * Requires a valid access token. Loads the user and their player profile onto
 * the request as req.user and req.player.
 */
export const protect = async (req, res, next) => {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return next(httpError(401, 'Not authorized'));

    try {
        const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET, { algorithms: ['HS256'] });
        const user = await User.findById(decoded.id);
        if (!user) return next(httpError(401, 'Not authorized'));
        req.user = user;
        req.player = await Player.findOne({ user: user._id });
        next();
    } catch {
        next(httpError(401, 'Not authorized'));
    }
};

export const organizerOnly = (req, res, next) => {
    if (req.user?.role === 'organizer') return next();
    next(httpError(403, 'Organizer only'));
};

export const isOrganizer = (req) => req.user?.role === 'organizer';
