/**
 * Wipes ALL app data from the database: accounts, players, matches, ratings,
 * polls, feedback and settings. This cannot be undone.
 *
 * Usage (from the backend folder, with MONGO_URI in .env or the environment):
 *   node scripts/resetData.js              → shows what would be deleted
 *   node scripts/resetData.js --yes        → deletes it
 *
 * Player photos on Cloudinary are not touched; delete the
 * "five-a-side/avatars" folder in the Cloudinary dashboard if you want them gone.
 */
import 'dotenv/config.js';
import mongoose from 'mongoose';

const COLLECTIONS = [
    'users', 'players', 'matches', 'peerratings', 'preferences', 'settings', 'polls', 'feedbacks',
    'notes' // from the old version
];

const run = async () => {
    if (!process.env.MONGO_URI) {
        console.error('MONGO_URI is not set.');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;
    const existing = new Set((await db.listCollections().toArray()).map(c => c.name));

    console.log(`Database: ${db.databaseName}`);
    for (const name of COLLECTIONS) {
        if (existing.has(name)) console.log(`  ${name}: ${await db.collection(name).countDocuments()} documents`);
    }

    if (!process.argv.includes('--yes')) {
        console.log('\nNothing deleted. Run again with --yes to delete everything listed above.');
        await mongoose.disconnect();
        return;
    }

    for (const name of COLLECTIONS) {
        if (existing.has(name)) await db.collection(name).drop();
    }
    console.log('\nDone. All app data deleted. Sign up with ORGANIZER_EMAIL to create the organizer account.');
    await mongoose.disconnect();
};

run().catch(async (err) => {
    console.error(err);
    await mongoose.disconnect();
    process.exit(1);
});
