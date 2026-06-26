import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Route imports
import scriptRoutes from './routes/scriptRoutes.js';
import audioRoutes from './routes/audioRoutes.js';
import imageRoutes from './routes/imageRoutes.js';
import videoRoutes from './routes/videoRoutes.js'; // Phase 2: silent pipeline + SSE
import animationRoutes from './routes/animationRoutes.js'; // Animation Lab: AI motion clips
import { renderVideo } from './controllers/exportController.js'; // NEW IMPORT

// Load environment variables (.env)
dotenv.config();

const app = express();

// ES Module workaround to get the current directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors()); 
app.use(express.json()); 

// Static Folders
app.use('/temp_audio', express.static(path.join(__dirname, 'temp_audio')));
app.use('/temp_images', express.static(path.join(__dirname, 'temp_images')));
// NEW: Serve the exports folder so the frontend can download the MP4
app.use('/exports', express.static(path.join(__dirname, 'public/exports')));
// Phase 2: serve per-job assets (images, audio, final MP4) for preview + render
app.use('/jobs', express.static(path.join(__dirname, 'jobs')));

// Production single-origin deploy: serve the built frontend (frontend/dist) from
// this same server, so one public (tunnel) URL covers both the site and the API.
// Skipped automatically in dev when no build exists.
const frontendDist = path.join(__dirname, '../frontend/dist');
const hasFrontendBuild = fs.existsSync(path.join(frontendDist, 'index.html'));
if (hasFrontendBuild) {
    app.use(express.static(frontendDist));
}

// Routes
app.use('/api/scripts', scriptRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/images', imageRoutes);
// Phase 2: single-button orchestrated pipeline
app.use('/api/video', videoRoutes);
// Animation Lab: AI motion-clip pipeline
app.use('/api/animation', animationRoutes);
// NEW: The MP4 Export Route
app.post('/api/export', renderVideo);

// Basic health check (always available, even when the frontend build is served at '/').
app.get('/healthz', (req, res) => {
    res.send('HookCraft Backend is running smoothly!');
});

if (hasFrontendBuild) {
    // SPA fallback: any non-API GET that didn't match a static file returns the
    // app shell so client-side routing / refreshes work. API + asset prefixes are
    // already handled above, so they never reach here.
    app.use((req, res, next) => {
        if (req.method !== 'GET') return next();
        if (req.path.startsWith('/api')) return next();
        res.sendFile(path.join(frontendDist, 'index.html'));
    });
} else {
    app.get('/', (req, res) => {
        res.send('HookCraft Backend is running (no frontend build found — dev mode).');
    });
}

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`Server is locked and loaded on port ${PORT}`);
});