import express from 'express';
import { startVideo, streamProgress } from '../controllers/videoController.js';

const router = express.Router();

// POST http://localhost:3001/api/video/generate  → { jobId }
router.post('/generate', startVideo);

// GET  http://localhost:3001/api/video/progress/:jobId  → SSE stream
router.get('/progress/:jobId', streamProgress);

export default router;
