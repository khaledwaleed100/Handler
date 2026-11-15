import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const voteSchema = new mongoose.Schema({
    userId: { type: ObjectId, ref: 'User', required: true },
    playerId: { type: ObjectId, ref: 'Player', required: true }
}, { timestamps: true });

// Snapshot of each candidate's numbers when the poll opened, so results never shift.
const candidateStatSchema = new mongoose.Schema({
    playerId: { type: ObjectId, ref: 'Player', required: true },
    avgRating: { type: Number, default: 0 },
    goals: { type: Number, default: 0 },
    assists: { type: Number, default: 0 },
    matches: { type: Number, default: 0 }
}, { _id: false });

const pollSchema = new mongoose.Schema({
    createdBy: { type: ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    type: { type: String, enum: ['weekly', 'monthly', 'team'], required: true },
    candidates: [{ type: ObjectId, ref: 'Player' }],
    candidateStats: [candidateStatSchema],
    votes: [voteSchema],
    isActive: { type: Boolean, default: true },
    closedAt: { type: Date, default: null },
    winner: { type: ObjectId, ref: 'Player', default: null },
    // Everyone crowned, best first: one player for Player of the Week/Month, five for Team of the Week.
    winners: [{ type: ObjectId, ref: 'Player' }],
    matchesIncluded: [{ type: ObjectId, ref: 'Match' }]
}, { timestamps: true });

pollSchema.index({ isActive: 1, createdAt: -1 });
pollSchema.index({ type: 1 });

export default mongoose.model('Poll', pollSchema);
