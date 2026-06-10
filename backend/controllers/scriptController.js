import { generateScript as generateScriptService } from '../services/geminiService.js';

// POST /api/scripts/generate — thin wrapper around the shared Gemini service.
export const generateScript = async (req, res) => {
    const { topic } = req.body;
    try {
        const data = await generateScriptService(topic);
        res.json(data);
    } catch (error) {
        console.error("Gemini API Error:", error);
        const status = /provide a topic/i.test(error.message) ? 400 : 500;
        res.status(status).json({ error: error.message || "Failed to generate script." });
    }
};
