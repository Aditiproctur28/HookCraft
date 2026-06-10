import path from 'path';
import { fileURLToPath } from 'url';
import { generateSceneImage } from '../services/imageService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// POST /api/images/generate — legacy per-scene endpoint, now backed by the shared service.
export const generateImage = async (req, res) => {
    try {
        const { visual_prompt, scene_number } = req.body;
        const outDir = path.join(__dirname, '../temp_images');
        const { fileName } = await generateSceneImage({
            visualPrompt: visual_prompt,
            sceneNumber: scene_number,
            outDir,
        });
        return res.status(200).json({
            success: true,
            file_name: fileName,
            file_path: `/temp_images/${fileName}`,
        });
    } catch (error) {
        console.error('❌ Hugging Face generation error:', error.message);
        return res.status(500).json({ error: 'Failed to generate image', details: error.message });
    }
};
