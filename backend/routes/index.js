import { Router } from 'express';
import { protect, organizerOnly } from '../middlewares/authMiddleware.js';
import { authLimiter, pollLimiter, strictLimiter } from '../middlewares/rateLimiter.js';
import * as auth from '../controllers/authController.js';
import * as me from '../controllers/meController.js';
import * as matches from '../controllers/matchController.js';
import * as org from '../controllers/organizerController.js';
import * as polls from '../controllers/pollController.js';
import { broadcast, subscribe, topicFor } from '../services/eventsService.js';

/**
 * Every API route in one place, so access rules are easy to review:
 *   public       → no login
 *   protect      → any signed-in member
 *   organizerOnly → the organizer
 * Express 5 forwards errors from async handlers automatically.
 */
const router = Router();

// ── Public ──────────────────────────────────────────────
router.get('/auth/invite/:code', strictLimiter, auth.checkInvite);
router.post('/auth/register', authLimiter, auth.register);
router.post('/auth/login', authLimiter, auth.login);
router.post('/auth/google', authLimiter, auth.googleSignIn);
router.post('/auth/google/complete', authLimiter, auth.googleComplete);
router.get('/config', auth.publicConfig);
router.post('/auth/refresh', auth.refresh);
router.post('/auth/logout', auth.logout);
router.post('/auth/forgot', strictLimiter, auth.forgotPassword);
router.post('/auth/reset', strictLimiter, auth.resetPassword);

// ── Members ─────────────────────────────────────────────
router.use(protect);

// After every successful change, tell the open apps which screens to reload.
router.use((req, res, next) => {
    const change = topicFor(req.method, req.path);
    if (change) {
        res.on('finish', () => {
            if (res.statusCode < 400) broadcast(change.topic, change.id ? { id: change.id } : {});
        });
    }
    next();
});

router.get('/events', subscribe);

router.get('/home', org.home);
router.get('/settings', org.publicSettings);

router.get('/me', me.getMe);
router.put('/me', me.updateMe);
router.delete('/me', me.deleteMe);
router.put('/me/password', me.changePassword);
router.post('/me/avatar', me.avatarUpload.single('avatar'), me.uploadAvatar);
router.get('/me/preferences', me.getPreferences);
router.put('/me/preferences', me.setPreferences);
router.get('/me/attendance', me.getMyAttendance);
router.post('/me/attendance/:matchId/dispute', me.disputeAttendance);
router.post('/me/push', me.addPushSubscription);
router.delete('/me/push', me.removePushSubscription);
router.post('/me/feedback', me.sendFeedback);

router.get('/players', me.listPlayers);
router.get('/players/:id', me.getPlayer);

router.get('/matches', matches.listMatches);
router.get('/matches/:id', matches.getMatch);
router.post('/matches/:id/rsvp', matches.rsvp);
router.get('/matches/:id/rating-task', matches.getRatingTask);
router.post('/matches/:id/ratings', matches.submitRatings);

router.get('/polls', pollLimiter, polls.getPolls);
router.get('/polls/status', pollLimiter, polls.getPollStatus);
router.post('/polls/:id/vote', pollLimiter, polls.voteOnPoll);

// ── Organizer ───────────────────────────────────────────
router.post('/matches', organizerOnly, matches.createMatch);
router.put('/matches/:id', organizerOnly, matches.updateMatch);
router.delete('/matches/:id', organizerOnly, matches.deleteMatch);
router.post('/matches/:id/roster', organizerOnly, matches.setRosterStatus);
router.post('/matches/:id/teams/suggest', organizerOnly, matches.suggestTeams);
router.put('/matches/:id/teams', organizerOnly, matches.saveTeams);
router.post('/matches/:id/checkin', organizerOnly, matches.checkInPlayer);
router.post('/matches/:id/result', organizerOnly, matches.saveResult);
router.post('/matches/:id/notify', organizerOnly, matches.notifyGroup);
router.post('/matches/:id/finalize-ratings', organizerOnly, matches.closeRatings);

router.post('/polls/generate', organizerOnly, polls.generatePoll);
router.post('/polls/:id/close', organizerOnly, polls.closePoll);

router.get('/organizer/overview', organizerOnly, org.overview);
router.put('/organizer/settings', organizerOnly, org.updateSettings);
router.post('/organizer/test-email', organizerOnly, strictLimiter, org.testEmail);
router.post('/organizer/invite/reset', organizerOnly, org.resetInvite);
router.put('/organizer/players/:id/adjustment', organizerOnly, org.setAdjustment);
router.get('/organizer/favorites', organizerOnly, org.getFavorites);
router.put('/organizer/players/:id/favorite', organizerOnly, org.setFavorite);
router.delete('/organizer/players/:id', organizerOnly, org.removeMember);
router.post('/organizer/disputes', organizerOnly, org.resolveDispute);

export default router;
