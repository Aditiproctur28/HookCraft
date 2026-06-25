// Diagnostic: call the LTX Space with the PIPELINE's exact params and dump the
// raw SSE stream so we can see the real error (quota vs. bad dimensions, etc.).
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const HOST = (process.env.LTX_HOST || 'https://lightricks-ltx-video-distilled.hf.space').replace(/\/$/, '');
const API = `${HOST}/gradio_api`;
const token = (process.env.HF_TOKEN || '').trim();
const headers = token ? { Authorization: `Bearer ${token}` } : {};

const still = path.join(__dirname, 'out', 'char.jpg');
if (!fs.existsSync(still)) { console.error('Need scripts/out/char.jpg (run generate-test-clip.mjs first).'); process.exit(1); }
const dataUrl = `data:image/jpeg;base64,${fs.readFileSync(still).toString('base64')}`;

async function tryDims(w, h, label) {
    console.log(`\n=== ${label}: ${w}x${h} ===`);
    const data = [
        'the cat looks around, gentle camera push-in, smooth motion',
        'blurry, distorted, deformed, low quality, watermark, text',
        { path: null, url: dataUrl, orig_name: 'still.jpg', mime_type: 'image/jpeg', meta: { _type: 'gradio.FileData' } },
        null, h, w, 'image-to-video', 3, 9, 0, true, 1, false,
    ];
    try {
        const post = await axios.post(`${API}/call/image_to_video`, { data }, { headers: { ...headers, 'Content-Type': 'application/json' }, timeout: 60000 });
        const eventId = post.data?.event_id;
        console.log('event_id:', eventId);
        if (!eventId) { console.log('POST payload:', JSON.stringify(post.data).slice(0, 400)); return; }
        const stream = await axios.get(`${API}/call/image_to_video/${eventId}`, { headers, responseType: 'text', timeout: 600000 });
        console.log('--- RAW SSE (first 1200 chars) ---');
        console.log(String(stream.data).slice(0, 1200));
    } catch (err) {
        console.log('REQUEST ERROR:', err.response?.status, err.message);
        if (err.response?.data) console.log(String(err.response.data).slice(0, 400));
    }
}

await tryDims(480, 832, 'pipeline vertical');
await tryDims(704, 512, 'known-good earlier');
