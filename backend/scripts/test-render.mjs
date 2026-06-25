// Smoke-test the NEW AnimatedVideo render path without the slow Gemini→FLUX→LTX
// loop: serve the existing test clip + a freshly-voiced line over a tiny local
// server, then render one scene through renderAnimatedVideo.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { generateSceneAudio } from '../services/audioService.js';
import { renderAnimatedVideo } from '../services/renderService.js';
import { normalizeForRemotion } from '../services/ffmpeg.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const outDir = path.join(__dirname, 'out');
const PORT = 3010;
const BASE = `http://localhost:${PORT}`;

// Static server over scripts/out so Remotion can fetch clip + audio by URL.
const server = http.createServer((req, res) => {
    const file = path.join(outDir, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(outDir) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': ext === '.mp4' ? 'video/mp4' : 'audio/mpeg' });
    fs.createReadStream(file).pipe(res);
});

await new Promise((r) => server.listen(PORT, r));
console.log('static server on', BASE);

try {
    if (!fs.existsSync(path.join(outDir, 'test_clip.mp4'))) {
        throw new Error('out/test_clip.mp4 missing — run generate-test-clip.mjs first.');
    }

    console.log('Normalizing clip for Remotion…');
    await normalizeForRemotion(path.join(outDir, 'test_clip.mp4'), path.join(outDir, 'test_clip_norm.mp4'), { fps: 30 });

    console.log('Voicing one line…');
    const aud = await generateSceneAudio({
        sceneNumber: 1,
        narrationText: 'A chubby orange cat strolls happily through the sunny meadow.',
        voiceType: 'male',
        language: 'en',
        outDir,
    });

    const scenes = [{
        scene_number: 1,
        narrationText: 'A chubby orange cat strolls happily through the sunny meadow.',
        clipUrl: `${BASE}/test_clip_norm.mp4`,
        audioUrl: `${BASE}/${aud.fileName}`,
        durationInFrames: aud.durationInFrames,
        wordTimings: aud.wordTimings,
        clipDurationSec: 3,
    }];

    console.log('Rendering AnimatedVideo (bundling Remotion, ~30-60s)…');
    const out = path.join(outDir, 'anim_render_test.mp4');
    await renderAnimatedVideo({
        scenes,
        totalDurationInFrames: aud.durationInFrames,
        width: 1080,
        height: 1920,
        captionStyle: 'word',
        outputLocation: out,
        onProgress: (p) => process.stdout.write(`\r  render ${Math.round(p * 100)}%   `),
    });
    console.log(`\n✅ RENDER OK → ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
} catch (err) {
    console.error('\n❌ RENDER TEST FAILED:', err.message);
    process.exitCode = 1;
} finally {
    server.close();
}
