import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/**
 * One player's anonymous rating of another after a match.
 * The rater is stored only to stop duplicates and to weight unreliable raters.
 * It is never sent to any client, including the organizer.
 */
const score = { type: Number, min: 1, max: 5 };

const peerRatingSchema = new mongoose.Schema({
    match: { type: ObjectId, ref: 'Match', required: true },
    rater: { type: ObjectId, ref: 'Player', required: true },
    ratee: { type: ObjectId, ref: 'Player', required: true },
    scores: {
        pace: score,
        attack: score,
        passing: score,
        defence: score,
        physical: score,
        goalkeeping: score
    },
    playAgain: { type: Boolean, default: true }
}, { timestamps: true });

peerRatingSchema.index({ match: 1, rater: 1, ratee: 1 }, { unique: true });
peerRatingSchema.index({ ratee: 1, createdAt: -1 });

export default mongoose.model('PeerRating', peerRatingSchema);
