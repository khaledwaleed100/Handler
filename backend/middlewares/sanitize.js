import { httpError } from '../utils/httpError.js';

/**
 * Rejects request bodies that try to smuggle MongoDB operators
 * (keys starting with "$" or containing ".") into a query.
 */
const isUnsafe = (value, depth = 0) => {
    if (depth > 10) return true;
    if (Array.isArray(value)) return value.some(v => isUnsafe(v, depth + 1));
    if (value && typeof value === 'object') {
        return Object.keys(value).some(k =>
            k.startsWith('$') || k.includes('.') || k === '__proto__' || k === 'constructor' ||
            isUnsafe(value[k], depth + 1));
    }
    return false;
};

export const sanitizeBody = (req, res, next) => {
    if (req.body && isUnsafe(req.body)) return next(httpError(400, 'Invalid request'));
    next();
};
