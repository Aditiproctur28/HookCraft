import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Remotion ships ffmpeg + ffprobe inside its platform-specific @remotion/
// compositor-* package. Resolve them so we don't depend on a system install.
const binCache = {};
function findRemotionBin(base) {
    if (binCache[base]) return binCache[base];
    const envVar = base === 'ffprobe' ? process.env.FFPROBE_PATH : process.env.FFMPEG_PATH;
    if (envVar && fs.existsSync(envVar)) { binCache[base] = envVar; return envVar; }
    const remotionDir = path.join(__dirname, '..', 'node_modules', '@remotion');
    if (fs.existsSync(remotionDir)) {
        for (const name of fs.readdirSync(remotionDir)) {
            if (!name.startsWith('compositor-')) continue;
            for (const bin of [`${base}.exe`, base]) {
                const p = path.join(remotionDir, name, bin);
                if (fs.existsSync(p)) { binCache[base] = p; return p; }
            }
        }
    }
    throw new Error(`${base} not found (no @remotion/compositor-* binary and no env override set).`);
}

export function getFfmpegPath() { return findRemotionBin('ffmpeg'); }
export function getFfprobePath() { return findRemotionBin('ffprobe'); }

/** Actual duration of a media file in seconds (0 if it can't be read). */
export async function probeDurationSec(filePath) {
    try {
        const { stdout } = await execFileP(getFfprobePath(), [
            '-v', 'error', '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1', filePath,
        ]);
        const d = parseFloat(String(stdout).trim());
        return Number.isFinite(d) ? d : 0;
    } catch {
        return 0;
    }
}

/**
 * Re-encode a video into a Remotion-friendly clip: H.264 / yuv420p at a
 * constant frame rate, faststart, no audio. This fixes OffthreadVideo frame
 * extraction failures on clips with unusual formats (e.g. LTX-Video output).
 * Writes to `outPath` (must differ from `inPath`).
 */
export async function normalizeForRemotion(inPath, outPath, { fps = 30 } = {}) {
    const ffmpeg = getFfmpegPath();
    await execFileP(ffmpeg, [
        '-y',
        '-i', inPath,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-r', String(fps),
        '-vsync', 'cfr',
        '-an',
        '-movflags', '+faststart',
        outPath,
    ], { maxBuffer: 1024 * 1024 * 32 });
    return outPath;
}
