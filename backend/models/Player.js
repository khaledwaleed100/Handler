import mongoose from 'mongoose';

/**
 * The football side of a member: position, ratings, stats.
 *
 * Nothing here is typed in by the organizer any more. Every number is
 * calculated by services/standingsService.js from three sources:
 *   - selfRating: what the player said about themselves at sign-up (fades out)
 *   - peer:       anonymous ratings from people they played with
 *   - elo:        results (wins / losses / goal difference), which can't be gamed
 */
export const ATTRIBUTES = ['pace', 'attack', 'passing', 'defence', 'physical', 'goalkeeping'];
export const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];
export const ADJUSTMENT_REASONS = ['injury_return', 'new_player', 'plays_differently'];

const attr = { type: Number, min: 1, max: 99 };
const attributesSchema = new mongoose.Schema(
    Object.fromEntries(ATTRIBUTES.map(a => [a, { ...attr, default: 60 }])),
    { _id: false }
);
const peerAttributesSchema = new mongoose.Schema(
    Object.fromEntries(ATTRIBUTES.map(a => [a, { ...attr, default: null }])),
    { _id: false }
);

const playerSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    position: { type: String, enum: POSITIONS, required: true },
    avatarUrl: { type: String, default: null },
    avatarPublicId: { type: String, default: null },

    selfRating: { type: attributesSchema, default: () => ({}) },

    // Peer ratings, aggregated. Only filled from matches whose rating window closed.
    peer: {
        attrs: { type: peerAttributesSchema, default: () => ({}) },
        raterCount: { type: Number, default: 0 }
    },

    elo: { type: Number, default: 1000 },

    // What everyone sees. Moves at most a few points per match (see standingsService).
    attrs: { type: attributesSchema, default: () => ({}) },
    overall: { type: Number, default: 60 },
    provisional: { type: Boolean, default: true },

    // Organizer's small, recorded correction (-5..+5). Fades over 5 matches.
    adjustment: {
        value: { type: Number, min: -5, max: 5, default: 0 },
        reason: { type: String, enum: [...ADJUSTMENT_REASONS, null], default: null },
        setAt: { type: Date, default: null },
        matchesAtSet: { type: Number, default: 0 }
    },
    adjustmentLog: [{
        value: Number,
        reason: { type: String, enum: ADJUSTMENT_REASONS },
        at: { type: Date, default: Date.now }
    }],

    stats: {
        matches: { type: Number, default: 0 },
        wins: { type: Number, default: 0 },
        draws: { type: Number, default: 0 },
        losses: { type: Number, default: 0 },
        goals: { type: Number, default: 0 },
        assists: { type: Number, default: 0 },
        mvp: { type: Number, default: 0 }
    },
    form: [{ type: String, enum: ['W', 'D', 'L'] }],

    reliability: {
        onTime: { type: Number, default: 0 },
        late: { type: Number, default: 0 },
        noShow: { type: Number, default: 0 },
        lateDrop: { type: Number, default: 0 }
    },

    // "Several different people aren't enjoying games with this player."
    // Organizer-only, never exposed to members.
    concernFlag: { type: Boolean, default: false }
}, { timestamps: true });

const Player = mongoose.model('Player', playerSchema);

export default Player;
