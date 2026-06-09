import express from 'express';
// We will create this controller file in the very next step!
import { generateScript } from '../controllers/scriptController.js';

const router = express.Router();

// Define the POST route for generating scripts
// This maps to: POST http://localhost:3001/api/scripts/generate
router.post('/generate', generateScript);

export default router;