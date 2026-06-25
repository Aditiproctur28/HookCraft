// One-off: prove free image-to-video quality end to end.
//   1. Cloudflare FLUX  -> a Pixar-style character still (free).
//   2. LTX-Video Space  -> animate that still into a short clip (free ZeroGPU).
// Saves both to scripts/out/ so we can judge the quality.
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cloudflareProvider } from '../services/imageProviders.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const HOST = process.env.LTX_HOST || 'https://lightricks-ltx-video-distilled.hf.space';
const token = (process.env.HF_TOKEN || '').trim();
const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });

const CHAR_PROMPT =
    'A chubby fluffy orange cat character, Pixar 3D animation style, big expressive eyes, ' +
    'standing in a sunny green meadow with blue sky, cinematic lighting, highly detailed, adorable';
const MOTION_PROMPT =
    'The chubby orange cat walks forward happily through the meadow, tail swaying, ' +
    'gentle camera push-in, smooth cinematic motion';

async function genStill() {
    console.log('① Generating character still on Cloudflare FLUX…');
    const buf = await cloudflareProvider({ prompt: CHAR_PROMPT, seed: 12345 });
    const stillPath = path.join(outDir, 'char.jpg');
    fs.writeFileSync(stillPath, buf);
    console.log(`   saved ${stillPath} (${(buf.length / 1024).toFixed(0)} KB)`);
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

async function animate(dataUrl) {
    console.log('② Calling LTX-Video /image_to_video (free ZeroGPU)…');
    // Param order from /gradio_api/info probe.
    const data = [
        MOTION_PROMPT,                          // prompt
        'blurry, distorted, deformed, low quality, watermark, text', // negative_prompt
        { path: null, url: dataUrl, orig_name: 'char.jpg', mime_type: 'image/jpeg', meta: { _type: 'gradio.FileData' } },
        null,                                   // input_video_filepath
        512,                                    // height_ui
        704,                                    // width_ui
        'image-to-video',                       // mode
        3,                                      // duration_ui (seconds)
        9,                                       // ui_frames_to_use
        0,                                       // seed_ui
        true,                                    // randomize_seed
        1,                                       // ui_guidance_scale (distilled = low)
        false,                                   // improve_texture_flag (faster)
    ];

    const post = await axios.post(`${HOST}/gradio_api/call/image_to_video`, { data }, {
        headers: { ...authHeaders, 'Content-Type': 'application/json' }, timeout: 60000,
    });
    const eventId = post.data?.event_id;
    if (!eventId) throw new Error('No event_id: ' + JSON.stringify(post.data).slice(0, 300));
    console.log('   queued event', eventId, '— waiting for GPU (this can take a few min)…');

    const stream = await axios.get(`${HOST}/gradio_api/call/image_to_video/${eventId}`, {
        headers: authHeaders, responseType: 'text', timeout: 600000,
    });
    return stream.data;
}

function parseResult(sse) {
    // SSE: lines "event: <type>" then "data: <json>". Find the completed payload.
    const blocks = sse.split('\n');
    let lastData = null, sawError = null, sawComplete = false;
    for (let i = 0; i < blocks.length; i++) {
        const line = blocks[i].trim();
        if (line.startsWith('event:')) {
            const ev = line.slice(6).trim();
            if (ev === 'complete') sawComplete = true;
            if (ev === 'error') sawError = true;
        } else if (line.startsWith('data:')) {
            lastData = line.slice(5).trim();
            if (sawError) throw new Error('Space returned error: ' + lastData);
        }
    }
    if (!lastData) throw new Error('No data in stream. Raw:\n' + sse.slice(0, 800));
    const parsed = JSON.parse(lastData);
    // Result is typically [ { video: {path/url}, ... } ] or [ {path,url} ].
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    const vid = first?.video || first;
    const url = vid?.url || (vid?.path ? `${HOST}/gradio_api/file=${vid.path}` : null);
    if (!url) throw new Error('Could not find video url. Payload: ' + JSON.stringify(parsed).slice(0, 400));
    return url;
}

(async () => {
    try {
        const dataUrl = await genStill();
        const sse = await animate(dataUrl);
        const url = parseResult(sse);
        console.log('③ Downloading clip:', url);
        const vid = await axios.get(url, { headers: authHeaders, responseType: 'arraybuffer', timeout: 120000 });
        const clipPath = path.join(outDir, 'test_clip.mp4');
        fs.writeFileSync(clipPath, Buffer.from(vid.data));
        console.log(`✅ DONE → ${clipPath} (${(vid.data.byteLength / 1024).toFixed(0)} KB)`);
    } catch (err) {
        console.error('❌ FAILED:', err.response?.status || '', err.message);
        if (err.response?.data) {
            const d = err.response.data;
            console.error(typeof d === 'string' ? d.slice(0, 600) : JSON.stringify(d).slice(0, 600));
        }
    }
})();
