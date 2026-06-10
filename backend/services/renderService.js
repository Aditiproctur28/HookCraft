import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Bundling is expensive; cache the serve URL across renders in this process.
let cachedServeUrl = null;

async function getServeUrl() {
    if (cachedServeUrl) return cachedServeUrl;
    const frontendRoot = path.resolve(__dirname, '../../frontend');
    const entryPoint = path.resolve(frontendRoot, 'src/RemotionRoot.jsx');
    cachedServeUrl = await bundle({ entryPoint, webpackOverride: (config) => config });
    return cachedServeUrl;
}

/**
 * Render the MasterVideo composition to an MP4 on disk.
 * @param {object} opts
 * @param {Array}  opts.scenes                - Scenes with imageUrl/audioUrl/narrationText/durationInFrames.
 * @param {number} opts.totalDurationInFrames
 * @param {string} opts.outputLocation        - Absolute path for the output .mp4.
 * @param {function} [opts.onProgress]        - Optional (0..1) progress callback.
 * @returns {Promise<string>} the output file path.
 */
export async function renderVideo({ scenes, totalDurationInFrames, outputLocation, onProgress }) {
    const serveUrl = await getServeUrl();

    const composition = await selectComposition({
        serveUrl,
        id: 'MasterVideo',
        inputProps: { scenes }
    });

    const exportDir = path.dirname(outputLocation);
    if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
    }

    await renderMedia({
        composition,
        serveUrl,
        codec: 'h264',
        outputLocation,
        inputProps: { scenes },
        durationInFrames: totalDurationInFrames || composition.durationInFrames,
        onProgress: onProgress ? ({ progress }) => onProgress(progress) : undefined,
    });

    return outputLocation;
}
