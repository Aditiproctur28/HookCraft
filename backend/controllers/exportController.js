import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ES Module workaround for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const renderVideo = async (req, res) => {
    try {
        const { scenes, totalDurationInFrames } = req.body;

        // 1. Point this to your Frontend folder where Remotion is set up!
        // Adjust this path based on your folder structure (e.g., '../../frontend')
        const frontendRoot = path.resolve(__dirname, '../../frontend'); 
// Change this line (around line 18)
const entryPoint = path.resolve(frontendRoot, 'src/RemotionRoot.jsx');        console.log('📦 Bundling Remotion project...');
        
        // 2. Bundle the frontend React code into a static serve URL
        const bundled = await bundle({
            entryPoint,
            webpackOverride: (config) => config,
        });

        console.log('🎥 Selecting Composition...');

        // 3. Find your registered MasterVideo composition
        const composition = await selectComposition({
            serveUrl: bundled,
            id: 'MasterVideo', 
            inputProps: { scenes }
        });

        // Ensure the exports directory exists
        const exportDir = path.resolve(__dirname, '../public/exports');
        if (!fs.existsSync(exportDir)) {
            fs.mkdirSync(exportDir, { recursive: true });
        }

        const fileName = `hookcraft_export_${Date.now()}.mp4`;
        const outputLocation = path.join(exportDir, fileName);

        console.log(`🚀 Rendering animated video to ${outputLocation}... This may take a minute.`);

        // 4. Render the MP4
        await renderMedia({
            composition,
            serveUrl: bundled,
            codec: 'h264',
            outputLocation,
            inputProps: { scenes },
            durationInFrames: totalDurationInFrames || composition.durationInFrames
        });

        console.log('✅ Render Complete!');

        // 5. Send the download link back to the frontend
        res.json({ 
            success: true, 
            downloadUrl: `/exports/${fileName}` 
        });

    } catch (error) {
        console.error('❌ Export Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};