import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Route imports
import scriptRoutes from './routes/scriptRoutes.js'; 
import audioRoutes from './routes/audioRoutes.js'; 
import imageRoutes from './routes/imageRoutes.js';
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

// Routes
app.use('/api/scripts', scriptRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/images', imageRoutes);
// NEW: The MP4 Export Route
app.post('/api/export', renderVideo);

// Basic health check
app.get('/', (req, res) => {
    res.send('HookCraft Backend is running smoothly!');
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`Server is locked and loaded on port ${PORT}`);
});