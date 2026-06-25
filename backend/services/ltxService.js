import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { withRetry } from './retry.js';
import { normalizeForRemotion, probeDurationSec } from './ffmpeg.js';

// ── Free image-to-video via the LTX-Video distilled Hugging Face Space ───────
// $0, no local GPU: we drive the Space's Gradio REST API directly from Node
// (no Python / gradio_client needed). An HF_TOKEN lifts the anonymous ZeroGPU
// quota and is strongly recommended. Output is a short MP4 clip.

// One or more LTX Spaces to try in order (comma-separated LTX_HOSTS, or single
// LTX_HOST). Fallbacks help when a specific Space is down — but note ZeroGPU
// quota is per HF-account, so mirrors won't help once the daily quota is spent.
const HOSTS = (process.env.LTX_HOSTS || process.env.LTX_HOST || 'https://lightricks-ltx-video-distilled.hf.space')
    .split(',')
    .map((h) => h.trim().replace(/\/$/, ''))
    .filter(Boolean);

// HF tokens to rotate through (HF_TOKENS list, else single HF_TOKEN). Each is a
// separate free account with its own daily ZeroGPU quota; we advance to the next
// when one is exhausted. A module-level cursor remembers the last working token
// so subsequent scenes don't keep re-hitting an already-spent one.
function getTokens() {
    const list = (process.env.HF_TOKENS || process.env.HF_TOKEN || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    return list.length ? list : [''];
}
let tokenCursor = 0;

function headersFor(token) {
    return token ? { Authorization: `Bearer ${token}` } : {};
}

// LTX has a pixel budget, but the previous 480-wide clips looked soft once
// upscaled to 1080. Bump to ~576-wide for sharper output (still divisible by 32).
// Overridable via LTX_WIDTH/LTX_HEIGHT if a run gets rejected or too slow.
const LTX_DIMS = {
    '9:16': { width: Number(process.env.LTX_WIDTH || 576), height: Number(process.env.LTX_HEIGHT || 1024) },
    '16:9': { width: Number(process.env.LTX_HEIGHT || 1024), height: Number(process.env.LTX_WIDTH || 576) },
};

export function ltxDimsFor(aspectRatio) {
    return LTX_DIMS[aspectRatio] || LTX_DIMS['9:16'];
}

// Thrown when the free GPU itself failed (quota/busy) — distinct so the caller
// can show a helpful message instead of a cryptic "error: null".
const QUOTA_HINT = 'The free animation GPU returned an error — most likely the daily free-GPU quota is used up, or the Space is busy. It resets about every 24h; please try again later.';

/** Pull the output video URL out of the Gradio SSE result stream. */
function parseClipUrl(sse, api) {
    const lines = String(sse).split('\n');
    let lastData = null, sawError = false;
    for (const raw of lines) {
        const line = raw.trim();
        if (line.startsWith('event:')) {
            if (line.slice(6).trim() === 'error') sawError = true;
        } else if (line.startsWith('data:')) {
            lastData = line.slice(5).trim();
            if (sawError) {
                // ZeroGPU failures arrive as `event: error` with null/empty data.
                if (!lastData || lastData === 'null') {
                    const e = new Error(QUOTA_HINT);
                    e.isQuota = true; // signal the caller to rotate to the next token
                    throw e;
                }
                throw new Error('LTX Space error: ' + lastData);
            }
        }
    }
    if (!lastData) throw new Error('LTX returned no data. Raw: ' + String(sse).slice(0, 400));
    const parsed = JSON.parse(lastData);
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    const vid = first?.video || first;
    const url = vid?.url || (vid?.path ? `${api}/file=${vid.path}` : null);
    if (!url) throw new Error('LTX: no video URL in payload: ' + JSON.stringify(parsed).slice(0, 300));
    return url;
}

/**
 * Animate a still image into a short MP4 clip.
 * @param {object} opts
 * @param {Buffer} opts.imageBuffer   - the source still (JPEG/PNG bytes).
 * @param {string} opts.motionPrompt  - what should move / how the camera moves.
 * @param {string} [opts.aspectRatio] - '9:16' (default) | '16:9'.
 * @param {number} [opts.durationSec] - target clip length (clamped 2–5s).
 * @param {number} [opts.seed]
 * @param {string} opts.outDir        - where to write the .mp4.
 * @param {string} [opts.fileName]    - defaults to clip_<scene>.mp4 via caller.
 * @returns {Promise<{fileName: string, filePath: string, durationSec: number}>}
 */
export async function animateStill({ imageBuffer, motionPrompt, aspectRatio = '9:16', durationSec = 3, seed, outDir, fileName = 'clip.mp4' }) {
    if (!imageBuffer) throw new Error('animateStill: imageBuffer is required.');
    if (!motionPrompt) throw new Error('animateStill: motionPrompt is required.');

    const { width, height } = ltxDimsFor(aspectRatio);
    const clamped = Math.max(2, Math.min(5, Math.round(durationSec)));
    const dataUrl = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

    // Param order taken from /gradio_api/info on the Space.
    const data = [
        motionPrompt,
        'blurry, distorted, deformed, low quality, watermark, text, glitch',
        { path: null, url: dataUrl, orig_name: 'still.jpg', mime_type: 'image/jpeg', meta: { _type: 'gradio.FileData' } },
        null,                 // input_video_filepath
        height,               // height_ui
        width,                // width_ui
        'image-to-video',     // mode
        clamped,              // duration_ui (seconds)
        9,                    // ui_frames_to_use (video-to-video only; ignored here)
        seed ?? 0,            // seed_ui
        seed === undefined,   // randomize_seed (true when caller didn't pin one)
        1,                    // ui_guidance_scale (distilled = low)
        false,                // improve_texture_flag (faster)
    ];

    // One attempt against a single host with a single token.
    const callOnce = (host, token) => withRetry(async () => {
        const api = `${host}/gradio_api`;
        const post = await axios.post(`${api}/call/image_to_video`, { data }, {
            headers: { ...headersFor(token), 'Content-Type': 'application/json' }, timeout: 60000,
        });
        const eventId = post.data?.event_id;
        if (!eventId) throw new Error('LTX: no event_id (' + JSON.stringify(post.data).slice(0, 200) + ')');

        const stream = await axios.get(`${api}/call/image_to_video/${eventId}`, {
            headers: headersFor(token), responseType: 'text', timeout: 600000,
        });
        return parseClipUrl(stream.data, api);
    }, { label: `LTX i2v (${host})`, retries: 1 });

    // Rotate tokens on quota; for each token try every host (covers a Space that
    // is simply down). A quota hit short-circuits the host loop since the quota
    // is per-account, not per-Space. Start at the last-known-good token.
    const tokens = getTokens();
    let url = null, workingToken = null, lastErr = null;
    for (let t = 0; t < tokens.length && !url; t++) {
        const token = tokens[(tokenCursor + t) % tokens.length];
        for (const host of HOSTS) {
            try {
                url = await callOnce(host, token);
                workingToken = token;
                tokenCursor = (tokenCursor + t) % tokens.length; // remember it
                break;
            } catch (err) {
                lastErr = err;
                if (err.isQuota) {
                    if (tokens.length > 1) console.warn(`⚠️  HF token #${(tokenCursor + t) % tokens.length + 1} quota spent — rotating to next account.`);
                    break; // other hosts share the same quota; rotate token instead
                }
                if (HOSTS.length > 1) console.warn(`⚠️  LTX host down (${host}): ${err.message} — trying next host.`);
            }
        }
    }
    if (!url) throw lastErr || new Error('LTX: all tokens/hosts failed.');

    const resp = await axios.get(url, { headers: headersFor(workingToken), responseType: 'arraybuffer', timeout: 180000 });
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    // LTX's raw MP4 trips up Remotion's OffthreadVideo frame extraction, so
    // re-encode to a clean constant-framerate H.264/yuv420p clip before use.
    const rawPath = path.join(outDir, `raw_${fileName}`);
    fs.writeFileSync(rawPath, Buffer.from(resp.data));
    const filePath = path.join(outDir, fileName);
    await normalizeForRemotion(rawPath, filePath, { fps: 30 });
    fs.rmSync(rawPath, { force: true });

    // LTX often returns a clip SHORTER than requested. Use the ACTUAL length so
    // the renderer stretches the real motion across the whole scene instead of
    // freezing on the last frame for the remainder (the "only scene 1 moves" bug).
    const actualSec = await probeDurationSec(filePath) || clamped;

    return { fileName, filePath, durationSec: actualSec };
}
