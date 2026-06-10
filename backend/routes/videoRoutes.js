import express from 'express';
import {
    startVideo,
    regenerateCharacterHandler,
    approveHandler,
    streamProgress,
} from '../controllers/videoController.js';

const router = express.Router();

// POST /api/video/generate                       → { jobId } (prep, pauses for approval)
router.post('/generate', startVideo);
// POST /api/video/:jobId/regenerate-character     → new character concept (via SSE)
router.post('/:jobId/regenerate-character', regenerateCharacterHandler);
// POST /api/video/:jobId/approve                  → resumes production
router.post('/:jobId/approve', approveHandler);
// GET  /api/video/progress/:jobId                 → SSE stream
router.get('/progress/:jobId', streamProgress);

export default router;
