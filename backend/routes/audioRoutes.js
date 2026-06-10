import express from 'express';
// We will build this controller in the very next step!
import { generateAudio } from '../controllers/audioController.js';

const router = express.Router();

// Define the POST route for generating voiceovers
// This maps to: POST http://localhost:3001/api/audio/generate
router.post('/generate', generateAudio);

export default router;