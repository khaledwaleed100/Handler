/**
 * Notifications, on two channels:
 *   - Phone push (Web Push): free, instant, needs the player to tap "Notifications: On" once.
 *     Silently skipped if VAPID keys aren't configured. Generate them once with:
 *       npx web-push generate-vapid-keys
 *   - Email (Gmail): for messages that matter (organizer announcements, "you're in",
 *     teams published). Players can switch email off in Me → App.
 */
import webpush from 'web-push';
import User from '../models/User.js';
import Player from '../models/Player.js';
import { emailConfigured, sendNotificationEmail } from './emailService.js';

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

/**
 * @param {object} options
 * @param {boolean} options.email  also send an email (to people who haven't switched it off)
 * @returns number of people reached by at least one channel
 */
export const notifyUsers = async (userIds, message, { email = false } = {}) => {
    if (!userIds.length) return 0;
    const users = await User.find({ _id: { $in: userIds } }).select('+pushSubscriptions');
    const reached = new Set();

    // Phone notifications first, all at once and marked urgent, so they arrive in seconds.
    // (They used to wait behind the emails, which could take minutes.)
    if (isConfigured()) {
        const data = payload(message);
        await Promise.all(users.flatMap(user => user.pushSubscriptions.map(async sub => {
            try {
                await webpush.sendNotification(sub, data, { TTL: 6 * 3600, urgency: 'high' });
            } catch (err) {
                console.error('Push failed:', err.statusCode || err.message);
                // 404/410: the phone unsubscribed or the app was removed. Forget it.
                if (err.statusCode === 404 || err.statusCode === 410) {
                    await User.updateOne({ _id: user._id }, { $pull: { pushSubscriptions: { endpoint: sub.endpoint } } });
                }
                return;
            }
            reached.add(String(user._id));
        })));
    }

    if (email && emailConfigured()) {
        // Then emails, a few at a time.
        const wanted = users.filter(u => u.preferences?.emailNotifications !== false);
        for (let i = 0; i < wanted.length; i += 5) {
            await Promise.all(wanted.slice(i, i + 5).map(async user => {
                try {
                    await sendNotificationEmail(user.email, user.name, message);
                    reached.add(String(user._id));
                } catch (err) {
                    console.error('Notification email failed:', err.message);
                }
            }));
        }
    }
    return reached.size;
};

export const notifyPlayers = async (playerIds, message, options) => {
    const players = await Player.find({ _id: { $in: playerIds } }).select('user').lean();
    return notifyUsers(players.map(p => p.user), message, options);
};

export const notifyEveryone = async (message, exceptUserId = null, options) => {
    const users = await User.find(exceptUserId ? { _id: { $ne: exceptUserId } } : {}).select('_id').lean();
    return notifyUsers(users.map(u => u._id), message, options);
};
