import path from 'path';
import { fileURLToPath } from 'url';
import { renderVideo as renderVideoService } from '../services/renderService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// POST /api/export — legacy one-shot render endpoint, now backed by the shared service.
export const renderVideo = async (req, res) => {
    try {
        const { scenes, totalDurationInFrames } = req.body;
        const fileName = `hookcraft_export_${Date.now()}.mp4`;
        const outputLocation = path.resolve(__dirname, '../public/exports', fileName);

        await renderVideoService({ scenes, totalDurationInFrames, outputLocation });

        res.json({ success: true, downloadUrl: `/exports/${fileName}` });
    } catch (error) {
        console.error('❌ Export Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
