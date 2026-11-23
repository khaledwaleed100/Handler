import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const rsvpSchema = new mongoose.Schema({
    player: { type: ObjectId, ref: 'Player', required: true },
    status: { type: String, enum: ['in', 'out', 'maybe'], required: true },
    at: { type: Date, default: Date.now }
}, { _id: false });

const attendanceSchema = new mongoose.Schema({
    player: { type: ObjectId, ref: 'Player', required: true },
    state: { type: String, enum: ['on_time', 'late', 'no_show'], required: true },
    arrivedAt: { type: Date, default: null },
    minutesLate: { type: Number, default: 0 },
    dispute: {
        state: { type: String, enum: ['none', 'pending', 'accepted', 'rejected'], default: 'none' },
        note: { type: String, maxlength: 300, default: '' },
        at: { type: Date, default: null },
        resolvedAt: { type: Date, default: null }
    }
}, { _id: false });

const matchSchema = new mongoose.Schema({
    createdBy: { type: ObjectId, ref: 'User', required: true },
    place: { type: String, required: true, trim: true, maxlength: 80 },
    mapUrl: { type: String, trim: true, maxlength: 500, default: '' },
    kickoff: { type: Date, required: true },
    capacity: { type: Number, min: 2, max: 22, default: 10 },
    status: { type: String, enum: ['upcoming', 'completed', 'cancelled'], default: 'upcoming' },
    // Weekly repeat: at kick-off, next week's match is created (once: repeatSpawned).
    repeatWeekly: { type: Boolean, default: false },
    repeatSpawned: { type: Boolean, default: false },

    rsvps: [rsvpSchema],
    lateDrops: [{ player: { type: ObjectId, ref: 'Player' }, at: Date, _id: false }],

    teamA: [{ type: ObjectId, ref: 'Player' }],
    teamB: [{ type: ObjectId, ref: 'Player' }],
    teamsPublished: { type: Boolean, default: false },

    score: { a: { type: Number, default: 0 }, b: { type: Number, default: 0 } },
    stats: [{
        player: { type: ObjectId, ref: 'Player', required: true },
        goals: { type: Number, min: 0, max: 50, default: 0 },
        assists: { type: Number, min: 0, max: 50, default: 0 },
        _id: false
    }],
    completedAt: { type: Date, default: null },

    attendance: [attendanceSchema],
    // Who opened the match page (for the organizer's "seen / not seen" list).
    seenBy: [{ player: { type: ObjectId, ref: 'Player' }, at: Date, _id: false }],
    // Organizer-sent notifications, newest last (shown so the organizer doesn't double-send).
    notifications: [{ kind: String, at: Date, recipients: Number, note: { type: String, default: '' }, _id: false }],

    // Post-match rating round. Each player rates a few others; who rated whom is never exposed.
    ratingAssignments: [{
        rater: { type: ObjectId, ref: 'Player' },
        ratees: [{ type: ObjectId, ref: 'Player' }],
        done: { type: Boolean, default: false },
        _id: false
    }],
    mvpVotes: [{ voter: { type: ObjectId, ref: 'Player' }, for: { type: ObjectId, ref: 'Player' }, _id: false }],
    mvp: { type: ObjectId, ref: 'Player', default: null },
    ratingsClosesAt: { type: Date, default: null },
    ratingsFinalized: { type: Boolean, default: false }
}, { timestamps: true });

matchSchema.index({ status: 1, kickoff: 1 });

const Match = mongoose.model('Match', matchSchema);

export default Match;
