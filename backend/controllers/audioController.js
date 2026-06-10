import path from "path";
import { fileURLToPath } from "url";
import { generateSceneAudio } from "../services/audioService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// POST /api/audio/generate — legacy per-scene endpoint, now backed by the shared service.
export const generateAudio = async (req, res) => {
    try {
        const { scene_number, narration_text, voice_type } = req.body;
        const outDir = path.join(__dirname, '../temp_audio');
        const { fileName, voiceUsed } = await generateSceneAudio({
            sceneNumber: scene_number,
            narrationText: narration_text,
            voiceType: voice_type,
            outDir,
        });
        return res.status(200).json({
            success: true,
            file_path: `/temp_audio/${fileName}`,
            voice_used: voiceUsed,
        });
    } catch (error) {
        console.error(`Audio Generation Error for Scene ${req.body?.scene_number}:`, error.message);
        return res.status(500).json({ success: false, error: "Failed to generate audio track" });
    }
};
