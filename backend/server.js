import 'dotenv/config.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import connectDB from './config/db.js';
import { apiLimiter } from './middlewares/rateLimiter.js';
import { sanitizeBody } from './middlewares/sanitize.js';
import { notFound, errorHandler } from './middlewares/errorMiddleware.js';
import apiRoutes from './routes/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

// Refuse to start with missing or weak secrets: a guessable JWT secret means anyone can log in as anyone.
for (const key of ['JWT_SECRET', 'REFRESH_TOKEN_SECRET']) {
    if (!process.env[key] || process.env[key].length < 32) {
        if (isProd || !process.env[key]) {
            console.error(`${key} must be set (at least 32 characters). See .env.example.`);
            process.exit(1);
        }
    }
}

process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION, shutting down', err);
    process.exit(1);
});

const app = express();
const PORT = process.env.PORT || 3000;

// Render puts one proxy in front of the app; needed for correct client IPs in rate limiting.
app.set('trust proxy', 1);
app.disable('x-powered-by');

connectDB();

// CORS: in production the frontend is served by this same server, so only
// the configured FRONTEND_URL (if any) and local development are allowed.
const allowedOrigins = [process.env.FRONTEND_URL, !isProd && 'http://localhost:4200'].filter(Boolean);
app.use(cors({
    origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            'default-src': ["'self'"],
            'script-src': ["'self'"],
            'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
            'img-src': ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com'],
            'connect-src': ["'self'", 'https://api.open-meteo.com', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://res.cloudinary.com'],
            'worker-src': ["'self'"],
            'manifest-src': ["'self'"],
            'frame-ancestors': ["'none'"],
            'object-src': ["'none'"],
            'base-uri': ["'self'"],
            'form-action': ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' }
}));
app.use(compression());
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(sanitizeBody);

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: Math.round(process.uptime()) }));

app.use('/api', apiLimiter);
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api', apiRoutes);
app.use('/api', notFound);

// Serve the Angular app (unified deployment on Render).
const frontendPath = path.join(__dirname, '../frontend/dist/frontend/browser');
app.use(express.static(frontendPath, {
    index: false,
    setHeaders: (res, file) => {
        // Hashed bundles never change; the shell and service worker always revalidate.
        if (/\.[0-9a-f]{16,}\.(js|css)$/i.test(file) || /[-.][A-Z0-9]{8}\.(js|css)$/.test(file)) {
            res.set('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
            res.set('Cache-Control', 'no-cache');
        }
    }
}));
app.get(/.*/, (req, res) => res.sendFile(path.join(frontendPath, 'index.html')));

app.use(errorHandler);

const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION, shutting down', err);
    server.close(() => process.exit(1));
});

export default app;
