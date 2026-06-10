import axios from 'axios';

// ── Image generation providers ─────────────────────────────────────────────
// Each provider: async ({ prompt, width, height, seed }) => Buffer (image bytes).
// Each exposes .providerName and .isAvailable() so the orchestrator can skip
// unconfigured ones. All free; selected/ordered via IMAGE_PROVIDERS in .env.

/**
 * Cloudflare Workers AI — FLUX.1-schnell.
 * Free tier ~230 images/day, resets DAILY. Returns base64 JSON.
 * NOTE: this model ignores width/height (outputs a square ~1024 image);
 * Remotion crops it to fill the chosen aspect ratio.
 */
export async function cloudflareProvider({ prompt, seed }) {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!accountId || !token) {
        throw new Error('Cloudflare not configured (set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN).');
    }

    const body = { prompt };
    if (seed !== undefined && seed !== null) body.seed = seed;

    const resp = await axios({
        url: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: body,
        responseType: 'json',
        timeout: 120000,
    });

    const b64 = resp.data?.result?.image;
    if (!b64) throw new Error('Cloudflare returned no image data.');
    return Buffer.from(b64, 'base64');
}
cloudflareProvider.providerName = 'cloudflare';
cloudflareProvider.isAvailable = () => !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);

/**
 * Pollinations.ai — free Flux. Supports exact width/height + seed.
 * Works anonymously (rate-limited ~1 req/15s, may watermark); a free
 * POLLINATIONS_TOKEN removes the limit and watermark.
 */
export async function pollinationsProvider({ prompt, width = 1024, height = 1024, seed }) {
    const token = process.env.POLLINATIONS_TOKEN;

    const params = new URLSearchParams({ width: String(width), height: String(height) });
    if (seed !== undefined && seed !== null) params.set('seed', String(seed));
    // Flux + watermark-removal are token-gated; only request them when authed,
    // otherwise the anonymous default model still returns a (watermarked) image.
    if (token) {
        params.set('model', 'flux');
        params.set('nologo', 'true');
    }

    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const resp = await axios({
        url: `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`,
        method: 'GET',
        headers,
        responseType: 'arraybuffer',
        timeout: 120000,
    });
    return Buffer.from(resp.data);
}
pollinationsProvider.providerName = 'pollinations';
pollinationsProvider.isAvailable = () => true;

/**
 * Hugging Face Inference — FLUX.1-schnell. Kept as an optional provider.
 * NOTE: HF's free tier is metered monthly and returns 402 when depleted, so it
 * is NOT in the default order.
 */
export async function huggingFaceProvider({ prompt, width = 512, height = 896, seed }) {
    const token = process.env.HF_TOKEN ? process.env.HF_TOKEN.trim() : '';
    if (!token) throw new Error('Hugging Face not configured (set HF_TOKEN).');

    const parameters = { width, height };
    if (seed !== undefined && seed !== null) parameters.seed = seed;

    const resp = await axios({
        url: 'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell',
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'image/jpeg' },
        data: { inputs: prompt, parameters },
        responseType: 'arraybuffer',
        timeout: 120000,
    });
    return Buffer.from(resp.data);
}
huggingFaceProvider.providerName = 'huggingface';
huggingFaceProvider.isAvailable = () => !!(process.env.HF_TOKEN && process.env.HF_TOKEN.trim());

export const PROVIDERS = {
    cloudflare: cloudflareProvider,
    pollinations: pollinationsProvider,
    huggingface: huggingFaceProvider,
    hf: huggingFaceProvider, // alias
};

/** Ordered list of provider functions from IMAGE_PROVIDERS (default: cloudflare → pollinations). */
export function resolveProviderChain() {
    const order = (process.env.IMAGE_PROVIDERS || 'cloudflare,pollinations')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    const chain = order.map((name) => PROVIDERS[name]).filter(Boolean);
    // De-dupe (in case of alias collisions) while preserving order.
    return [...new Set(chain)];
}
