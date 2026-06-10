// Resilience helpers for the free-tier upstream APIs (Gemini, Hugging Face),
// which intermittently return 429 (rate limit) / 503 (overloaded / model loading).

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Best-effort extraction of an HTTP status code from varied error shapes. */
function statusOf(err) {
    if (err?.response?.status) return err.response.status;       // axios
    if (typeof err?.status === 'number') return err.status;       // some SDKs
    const m = String(err?.message || '');
    const codeMatch = m.match(/"code"\s*:\s*(\d{3})/) || m.match(/\b(429|500|502|503|504)\b/);
    return codeMatch ? Number(codeMatch[1]) : 0;
}

/** Is this error worth retrying (transient upstream issue, not a real failure)? */
export function isTransient(err) {
    const s = statusOf(err);
    if ([429, 500, 502, 503, 504].includes(s)) return true;
    const m = String(err?.message || '').toLowerCase();
    return /overload|unavailable|temporarily|high demand|rate.?limit|resource_exhausted|model is loading|timeout|econnreset|etimedout|socket hang up/.test(m);
}

/**
 * Run `fn`, retrying transient failures with exponential backoff.
 * @param {Function} fn
 * @param {{retries?: number, baseDelayMs?: number, label?: string}} [opts]
 */
export async function withRetry(fn, { retries = 3, baseDelayMs = 1500, label = 'API call' } = {}) {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            return await fn();
        } catch (err) {
            attempt++;
            if (attempt > retries || !isTransient(err)) throw err;
            const delay = baseDelayMs * 2 ** (attempt - 1); // 1.5s, 3s, 6s …
            console.warn(`⏳ ${label} failed (attempt ${attempt}/${retries}); retrying in ${delay}ms — ${cleanErrorMessage(err)}`);
            await sleep(delay);
        }
    }
}

/** Turn a messy upstream/SDK error into a short, user-friendly sentence. */
export function cleanErrorMessage(err) {
    const raw = String(err?.message || err || '');

    // Pull a nested API message if the error is a JSON blob.
    let inner = raw;
    const msgMatch = raw.match(/"message"\s*:\s*"([^"]+)"/);
    if (msgMatch) inner = msgMatch[1];

    const s = statusOf(err);
    if (s === 503 || /overload|unavailable|high demand/i.test(raw)) {
        return 'The AI model is busy right now (high demand). Please try again in a moment.';
    }
    if (s === 429 || /rate.?limit|resource_exhausted/i.test(raw)) {
        return 'Free-tier rate limit reached. Please wait a minute and try again.';
    }
    if (/model is loading/i.test(raw)) {
        return 'The image model is warming up. Please try again shortly.';
    }
    if (/GEMINI_API_KEY|HF_TOKEN/.test(raw)) {
        return inner; // config errors — show as-is so the user knows to fix .env
    }
    return inner.length > 160 ? inner.slice(0, 157) + '…' : inner;
}
