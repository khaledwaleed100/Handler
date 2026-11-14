import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

/**
 * A person who can log in. Every user owns exactly one Player profile
 * (see Player.js), which is what the rest of the app works with.
 *
 * Sensitive fields are `select: false`, so they never leave the database
 * unless a query explicitly asks for them.
 */
const pushSubscriptionSchema = new mongoose.Schema({
    endpoint: { type: String, required: true },
    keys: {
        p256dh: { type: String, required: true },
        auth: { type: String, required: true }
    }
}, { _id: false });

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['organizer', 'member'], default: 'member' },

    // Contact details: visible to the organizer only, never to other members.
    phone: { type: String, trim: true, maxlength: 20, default: '' },
    contactConsentAt: { type: Date, default: null },

    preferences: {
        theme: { type: String, enum: ['light', 'dark'], default: 'dark' },
        lang: { type: String, enum: ['en', 'ar'], default: 'en' }
    },

    // Hashes of active refresh tokens, one per signed-in device (max 5).
    refreshTokenHashes: { type: [String], default: [], select: false },
    resetCodeHash: { type: String, select: false },
    resetCodeExpires: { type: Date, select: false },
    resetAttempts: { type: Number, default: 0, select: false },

    pushSubscriptions: { type: [pushSubscriptionSchema], default: [], select: false }
}, { timestamps: true });

const BCRYPT_ROUNDS = 12;

userSchema.methods.setPassword = async function (plain) {
    this.passwordHash = await bcrypt.hash(plain, BCRYPT_ROUNDS);
};

userSchema.methods.matchPassword = async function (plain) {
    if (!this.passwordHash || typeof plain !== 'string') return false;
    return bcrypt.compare(plain, this.passwordHash);
};

const User = mongoose.model('User', userSchema);

export default User;
