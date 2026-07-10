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
 * Hugging Face Inference — FLUX.1-schnell. Unlike Cloudflare, this model HONORS
 * the requested width/height, so it's the provider used for non-square (e.g.
 * 16:9 landscape) renders that would otherwise be cropped.
 *
 * Free HF accounts meter monthly and return 402 when depleted, so we rotate
 * through a pool of tokens (HF_TOKENS, else single HF_TOKEN) — mirroring the
 * Animation Lab — advancing to the next account on 402/429 and remembering the
 * last working one so subsequent scenes don't re-hit a spent token.
 */
function getHfTokens() {
    return (process.env.HF_TOKENS || process.env.HF_TOKEN || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
}
let hfTokenCursor = 0;

export async function huggingFaceProvider({ prompt, width = 512, height = 896, seed }) {
    const tokens = getHfTokens();
    if (tokens.length === 0) throw new Error('Hugging Face not configured (set HF_TOKEN or HF_TOKENS).');

    const parameters = { width, height };
    if (seed !== undefined && seed !== null) parameters.seed = seed;

    let lastErr = null;
    for (let i = 0; i < tokens.length; i++) {
        const idx = (hfTokenCursor + i) % tokens.length;
        const token = tokens[idx];
        try {
            const resp = await axios({
                url: 'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell',
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'image/jpeg' },
                data: { inputs: prompt, parameters },
                responseType: 'arraybuffer',
                timeout: 120000,
            });
            hfTokenCursor = idx; // remember the working account for the next scene
            return Buffer.from(resp.data);
        } catch (err) {
            lastErr = err;
            const status = err?.response?.status;
            // 402 = monthly quota spent, 429 = rate-limited → rotate to the next
            // free account. Any other error is a real failure for THIS provider;
            // let it bubble so the orchestrator falls back to the next provider.
            if (status === 402 || status === 429) {
                if (tokens.length > 1) console.warn(`⚠️  HF token #${idx + 1} exhausted (HTTP ${status}) — rotating to next account.`);
                continue;
            }
            throw err;
        }
    }
    throw lastErr || new Error('All Hugging Face tokens are exhausted.');
}
huggingFaceProvider.providerName = 'huggingface';
huggingFaceProvider.isAvailable = () => getHfTokens().length > 0;

export const PROVIDERS = {
    cloudflare: cloudflareProvider,
    pollinations: pollinationsProvider,
    huggingface: huggingFaceProvider,
    hf: huggingFaceProvider, // alias
};

/**
 * Ordered list of provider functions to try.
 * - If IMAGE_PROVIDERS is set, it wins verbatim (advanced override).
 * - Otherwise the default is ASPECT-AWARE: landscape (16:9) prefers HuggingFace,
 *   because Cloudflare's FLUX only outputs squares — which get cropped top/bottom
 *   when stretched into a wide frame. Vertical (9:16) keeps Cloudflare first,
 *   exactly as before (a square cover-crops cleanly into a tall frame).
 * @param {'16:9'|'9:16'} [aspectRatio]
 */
export function resolveProviderChain(aspectRatio) {
    const envOrder = process.env.IMAGE_PROVIDERS;
    const order = envOrder
        ? envOrder.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
        : (aspectRatio === '16:9'
            ? ['huggingface', 'cloudflare']   // landscape: honor real dimensions
            : ['cloudflare', 'pollinations']); // vertical: unchanged from before
    const chain = order.map((name) => PROVIDERS[name]).filter(Boolean);
    // De-dupe (in case of alias collisions) while preserving order.
    return [...new Set(chain)];
}
