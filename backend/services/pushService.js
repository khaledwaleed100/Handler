/**
 * Phone notifications (Web Push). Works once the app is installed / allowed
 * notifications. Silently does nothing if VAPID keys aren't configured.
 *
 * Generate keys once with:  npx web-push generate-vapid-keys
 */
import webpush from 'web-push';
import User from '../models/User.js';
import Player from '../models/Player.js';

let configured = null;

const isConfigured = () => {
    if (configured !== null) return configured;
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
    configured = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
    if (configured) {
        webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    }
    return configured;
};

export const publicKey = () => (isConfigured() ? process.env.VAPID_PUBLIC_KEY : null);

/** Payload format understood by Angular's service worker (click opens the url). */
const payload = ({ title, body, url = '/' }) => JSON.stringify({
    notification: {
        title,
        body,
        icon: '/assets/icons/icon-192x192.png',
        badge: '/assets/icons/icon-96x96.png',
        data: { onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url } } }
    }
});

export const notifyUsers = async (userIds, message) => {
    if (!isConfigured() || !userIds.length) return;
    const users = await User.find({ _id: { $in: userIds } }).select('+pushSubscriptions');
    const data = payload(message);

    await Promise.all(users.flatMap(user => user.pushSubscriptions.map(async sub => {
        try {
            await webpush.sendNotification(sub, data, { TTL: 6 * 3600 });
        } catch (err) {
            // 404/410: the phone unsubscribed or the app was removed. Forget it.
            if (err.statusCode === 404 || err.statusCode === 410) {
                await User.updateOne({ _id: user._id }, { $pull: { pushSubscriptions: { endpoint: sub.endpoint } } });
            }
        }
    })));
};

export const notifyPlayers = async (playerIds, message) => {
    const players = await Player.find({ _id: { $in: playerIds } }).select('user').lean();
    return notifyUsers(players.map(p => p.user), message);
};

export const notifyEveryone = async (message, exceptUserId = null) => {
    const users = await User.find(exceptUserId ? { _id: { $ne: exceptUserId } } : {}).select('_id').lean();
    return notifyUsers(users.map(u => u._id), message);
};
