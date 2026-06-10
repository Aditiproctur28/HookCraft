import fs from 'fs';
import path from 'path';
import axios from 'axios';

const HF_TOKEN = process.env.HF_TOKEN ? process.env.HF_TOKEN.trim() : "";

/**
 * Generate a single scene image via Hugging Face FLUX.1-schnell and write it to disk.
 * @param {object} opts
 * @param {string} opts.visualPrompt - The image generation prompt.
 * @param {number} opts.sceneNumber  - Scene index (used for the filename).
 * @param {string} opts.outDir       - Absolute directory to write the .jpeg into.
 * @param {number} [opts.width=512]   - Image width (threaded from aspect-ratio choice).
 * @param {number} [opts.height=896]  - Image height.
 * @returns {Promise<{fileName: string, filePath: string}>}
 */
export async function generateSceneImage({ visualPrompt, sceneNumber, outDir, width = 512, height = 896 }) {
    if (!visualPrompt || sceneNumber === undefined) {
        throw new Error("visualPrompt and sceneNumber are required.");
    }
    if (!HF_TOKEN) {
        throw new Error("HF_TOKEN is not defined in the .env file.");
    }

    const enhancedPrompt = `${visualPrompt}, professional digital art, cinematic lighting, highly detailed, 8k resolution`;

    const response = await axios({
        url: "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell",
        method: "POST",
        headers: {
            "Authorization": `Bearer ${HF_TOKEN}`,
            "Content-Type": "application/json",
            "Accept": "image/jpeg"
        },
        data: {
            inputs: enhancedPrompt,
            parameters: { width, height }
        },
        responseType: 'arraybuffer'
    });

    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const fileName = `scene_${sceneNumber}.jpeg`;
    const filePath = path.join(outDir, fileName);
    fs.writeFileSync(filePath, Buffer.from(response.data));

    return { fileName, filePath };
}
