import mongoose from 'mongoose';
import { randomBytes } from 'crypto';

/** Group-wide settings. There is exactly one document (key: 'main'). */
export const newInviteCode = () => randomBytes(9).toString('base64url');

const settingsSchema = new mongoose.Schema({
    key: { type: String, default: 'main', unique: true },
    groupName: { type: String, trim: true, maxlength: 40, default: 'Our 5-a-side' },
    inviteCode: { type: String, default: newInviteCode },
    lateGraceMinutes: { type: Number, min: 0, max: 30, default: 5 },
    defaultCapacity: { type: Number, min: 2, max: 22, default: 10 },
    defaultPrice: { type: Number, min: 0, max: 100000, default: 0 },
    currency: { type: String, trim: true, maxlength: 5, default: 'EGP' },
    ratingWindowHours: { type: Number, min: 12, max: 168, default: 72 }
}, { timestamps: true });

const Settings = mongoose.model('Settings', settingsSchema);

export const getSettings = async () =>
    Settings.findOneAndUpdate({ key: 'main' }, { $setOnInsert: { key: 'main' } }, { upsert: true, returnDocument: 'after' });

export default Settings;
