import fs from 'fs';
import path from 'path';
import { withRetry, cleanErrorMessage } from './retry.js';
import { resolveProviderChain } from './imageProviders.js';

/**
 * Generate a single scene image, trying each configured provider in order
 * (Cloudflare → Pollinations by default) and falling back on failure.
 * @param {object} opts
 * @param {string} opts.visualPrompt
 * @param {number} [opts.sceneNumber]
 * @param {string} opts.outDir       - Absolute directory to write the .jpeg into.
 * @param {number} [opts.width=512]
 * @param {number} [opts.height=896]
 * @param {number} [opts.seed]
 * @param {string} [opts.fileName]   - Override (defaults to scene_<n>.jpeg).
 * @returns {Promise<{fileName: string, filePath: string, provider: string}>}
 */
export async function generateSceneImage({ visualPrompt, sceneNumber, outDir, width = 512, height = 896, seed, fileName }) {
    if (!visualPrompt) {
        throw new Error('visualPrompt is required.');
    }

    const enhancedPrompt = `${visualPrompt}, professional digital art, cinematic lighting, highly detailed, 8k resolution`;
    const chain = resolveProviderChain();
    if (chain.length === 0) {
        throw new Error('No image providers configured. Set IMAGE_PROVIDERS in .env.');
    }

    const label = `scene ${sceneNumber ?? 'character'}`;
    const errors = [];
    let buffer = null;
    let usedProvider = null;

    for (const provider of chain) {
        if (provider.isAvailable && !provider.isAvailable()) {
            console.warn(`↪️  Skipping ${provider.providerName} for ${label} (not configured).`);
            continue;
        }
        try {
            buffer = await withRetry(
                () => provider({ prompt: enhancedPrompt, width, height, seed }),
                { label: `${provider.providerName} image (${label})`, retries: 2 },
            );
            usedProvider = provider.providerName;
            console.log(`✅ ${label} via ${usedProvider}`);
            break;
        } catch (err) {
            const msg = cleanErrorMessage(err);
            console.warn(`⚠️  ${provider.providerName} failed for ${label}: ${msg} — trying next provider.`);
            errors.push(`${provider.providerName}: ${msg}`);
        }
    }

    if (!buffer) {
        throw new Error(`All image providers failed for ${label}. ${errors.join(' | ')}`);
    }

    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }
    const outName = fileName || `scene_${sceneNumber}.jpeg`;
    const filePath = path.join(outDir, outName);
    fs.writeFileSync(filePath, buffer);

    return { fileName: outName, filePath, provider: usedProvider };
}
