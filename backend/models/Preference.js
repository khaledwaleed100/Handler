import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/**
 * Private "who I enjoy playing with / would rather not be teamed with".
 * Only the owner can read it back. The team balancer uses it, and nobody
 * (including the organizer) is ever shown who picked whom.
 */
export const MAX_WITH = 3;
export const MAX_AVOID = 2;

const preferenceSchema = new mongoose.Schema({
    player: { type: ObjectId, ref: 'Player', required: true, unique: true },
    with: [{ type: ObjectId, ref: 'Player' }],
    avoid: [{ type: ObjectId, ref: 'Player' }]
}, { timestamps: true });

export default mongoose.model('Preference', preferenceSchema);
