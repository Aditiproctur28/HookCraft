import express from 'express';
import { startAnimation, streamProgress } from '../controllers/animationController.js';

const router = express.Router();

// POST /api/animation/generate          → { jobId } (full pipeline, no approval pause)
router.post('/generate', startAnimation);
// GET  /api/animation/progress/:jobId   → SSE stream (shared with video jobs)
router.get('/progress/:jobId', streamProgress);

export default router;
