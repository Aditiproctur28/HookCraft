// One-off probe: discover the LTX-Video distilled Space's gradio API signature.
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const HOST = process.env.LTX_HOST || 'https://lightricks-ltx-video-distilled.hf.space';
const token = (process.env.HF_TOKEN || '').trim();
const headers = token ? { Authorization: `Bearer ${token}` } : {};

try {
    const { data } = await axios.get(`${HOST}/gradio_api/info`, { headers, timeout: 30000 });
    const eps = data.named_endpoints || {};
    for (const [name, info] of Object.entries(eps)) {
        const params = (info.parameters || []).map((p) => `${p.parameter_name || p.label}:${p.python_type?.type || p.type}`);
        console.log(`ENDPOINT ${name}  (${params.length} params)`);
        console.log('   ', params.join(' | '));
    }
    if (Object.keys(eps).length === 0) console.log('No named_endpoints. Raw keys:', Object.keys(data));
} catch (err) {
    console.log('PROBE FAILED:', err.response?.status, err.response?.statusText || err.message);
    if (err.response?.data) console.log(String(err.response.data).slice(0, 500));
}
