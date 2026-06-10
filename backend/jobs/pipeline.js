import path from 'path';
import { fileURLToPath } from 'url';

import { generateScript } from '../services/geminiService.js';
import { generateSceneImage } from '../services/imageService.js';
import { generateSceneAudio } from '../services/audioService.js';
import { renderVideo } from '../services/renderService.js';
import { resolveDimensions } from '../services/dimensions.js';
import { getJob, updateJob } from './jobStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;
const PUBLIC_BASE = process.env.PUBLIC_BASE || `http://localhost:${PORT}`;

const jobDirFor = (id) => path.join(__dirname, '..', 'jobs', id);
// FLUX seeds are 32-bit; vary per render so "Regenerate" yields a new face.
const randomSeed = () => Math.floor(Math.random() * 2_147_483_647);

/** Build the standalone character-concept portrait prompt from the anchor. */
function characterPrompt(description) {
    return `${description}, character concept portrait, single person, looking at camera, clean studio background, centered`;
}

/**
 * Phase A — preparation: generate script + a character concept, then PAUSE
 * for user approval. Fire-and-forget; never throws.
 */
export async function runPreparation(job, { topic, aspectRatio, imageMode, captionStyle }) {
    const imagesDir = path.join(jobDirFor(job.id), 'images');
    const { fluxWidth, fluxHeight } = resolveDimensions(aspectRatio);
    const resolvedImageMode = ['static', 'narrator'].includes(imageMode) ? imageMode : 'dynamic';
    const isNarrator = resolvedImageMode === 'narrator';

    try {
        // Stash inputs for the production phase.
        updateJob(job.id, {
            status: 'running', stage: 'script', message: 'Generating script…', pct: 15,
            _topic: topic,
            _aspectRatio: aspectRatio,
            imageMode: resolvedImageMode,
            captionStyle: captionStyle === 'sentence' ? 'sentence' : 'word',
        });

        const script = await generateScript(topic, { narrator: isNarrator });
        if (!script.scenes || script.scenes.length === 0) throw new Error('The script came back with no scenes.');

        updateJob(job.id, { _scriptData: script });

        // Narrator mode has no on-screen character — skip approval, go straight to production.
        if (isNarrator) {
            return runProduction(job);
        }

        updateJob(job.id, { stage: 'character', message: 'Creating character concept…', pct: 55 });

        const seed = randomSeed();
        const img = await generateSceneImage({
            visualPrompt: characterPrompt(script.character_description || script.scenes[0].visual_prompt),
            outDir: imagesDir,
            width: fluxWidth,
            height: fluxHeight,
            seed,
            fileName: 'character.jpeg',
        });

        updateJob(job.id, {
            status: 'awaiting_approval',
            stage: 'character',
            message: 'Approve your character to continue.',
            pct: 60,
            character: { imageUrl: `${PUBLIC_BASE}/jobs/${job.id}/images/character.jpeg?seed=${seed}`, seed },
        });
    } catch (err) {
        console.error(`❌ Preparation error (job ${job.id}):`, err);
        updateJob(job.id, { status: 'error', stage: 'error', message: err.message || 'Preparation failed.', error: err.message || String(err) });
    }
}

/** Regenerate the character concept with a fresh seed (same description). */
export async function regenerateCharacter(job) {
    if (job.status !== 'awaiting_approval' || !job._scriptData) return;
    const imagesDir = path.join(jobDirFor(job.id), 'images');
    const { fluxWidth, fluxHeight } = resolveDimensions(job._aspectRatio);
    const script = job._scriptData;

    updateJob(job.id, { regenerating: true, message: 'Regenerating character…' });
    try {
        const seed = randomSeed();
        await generateSceneImage({
            visualPrompt: characterPrompt(script.character_description || script.scenes[0].visual_prompt),
            outDir: imagesDir,
            width: fluxWidth,
            height: fluxHeight,
            seed,
            fileName: 'character.jpeg',
        });
        updateJob(job.id, {
            regenerating: false,
            message: 'Approve your character to continue.',
            character: { imageUrl: `${PUBLIC_BASE}/jobs/${job.id}/images/character.jpeg?seed=${seed}`, seed },
        });
    } catch (err) {
        console.error(`❌ Regenerate error (job ${job.id}):`, err);
        updateJob(job.id, { regenerating: false, message: `Regenerate failed: ${err.message}` });
    }
}

/**
 * Phase B — production: with the character approved, build per-scene assets
 * (static reuses the locked image; dynamic generates each scene with the
 * locked seed) → audio → render. Fire-and-forget; never throws.
 */
export async function runProduction(job) {
    const isNarrator = job.imageMode === 'narrator';
    if (!job._scriptData || (!isNarrator && !job.character)) return;
    const jobDir = jobDirFor(job.id);
    const imagesDir = path.join(jobDir, 'images');
    const audioDir = path.join(jobDir, 'audio');
    const { fluxWidth, fluxHeight, videoWidth, videoHeight } = resolveDimensions(job._aspectRatio);
    const seed = job.character?.seed; // undefined in narrator mode
    const isStatic = job.imageMode === 'static';
    const scenes = job._scriptData.scenes;
    const total = scenes.length;
    const characterUrl = `${PUBLIC_BASE}/jobs/${job.id}/images/character.jpeg`;

    try {
        updateJob(job.id, { status: 'running', stage: 'artwork', message: 'Preparing scenes…', pct: 62 });
        const enriched = [];

        for (let i = 0; i < total; i++) {
            const scene = scenes[i];
            const n = scene.scene_number;
            let imageUrl;

            if (isStatic) {
                // One locked character image as the continuous backdrop.
                updateJob(job.id, { stage: 'artwork', message: `Applying character (${i + 1}/${total})…`, pct: 62 + Math.round((i / total) * 8) });
                imageUrl = characterUrl;
            } else {
                // Distinct scene art, kept consistent via the locked seed + anchor.
                updateJob(job.id, { stage: 'artwork', message: `Creating AI artwork (${i + 1}/${total})…`, pct: 62 + Math.round((i / total) * 23) });
                const img = await generateSceneImage({
                    visualPrompt: scene.visual_prompt,
                    sceneNumber: n,
                    outDir: imagesDir,
                    width: fluxWidth,
                    height: fluxHeight,
                    seed,
                });
                imageUrl = `${PUBLIC_BASE}/jobs/${job.id}/images/${img.fileName}`;
            }

            updateJob(job.id, { stage: 'voiceover', message: `Generating voiceover (${i + 1}/${total})…`, pct: 70 + Math.round(((i + 0.5) / total) * 15) });
            const aud = await generateSceneAudio({
                sceneNumber: n,
                narrationText: scene.narration_text,
                voiceType: scene.voice_type,
                outDir: audioDir,
            });

            enriched.push({
                ...scene,
                imageUrl,
                audioUrl: `${PUBLIC_BASE}/jobs/${job.id}/audio/${aud.fileName}`,
                narrationText: scene.narration_text,
                durationInFrames: aud.durationInFrames,
            });
        }

        const totalDurationInFrames = enriched.reduce((s, sc) => s + sc.durationInFrames, 0);

        updateJob(job.id, {
            stage: 'render', message: 'Rendering final MP4…', pct: 85,
            scenes: enriched, totalDurationInFrames, width: videoWidth, height: videoHeight,
        });

        const fileName = `hookcraft_${job.id}.mp4`;
        const outputLocation = path.join(jobDir, fileName);
        await renderVideo({
            scenes: enriched,
            totalDurationInFrames,
            width: videoWidth,
            height: videoHeight,
            captionStyle: job.captionStyle,
            outputLocation,
            onProgress: (p) => updateJob(job.id, { stage: 'render', message: `Rendering final MP4… ${Math.round(p * 100)}%`, pct: 85 + Math.round(p * 14) }),
        });

        updateJob(job.id, { status: 'done', stage: 'done', message: 'Done!', pct: 100, downloadUrl: `${PUBLIC_BASE}/jobs/${job.id}/${fileName}` });
    } catch (err) {
        console.error(`❌ Production error (job ${job.id}):`, err);
        updateJob(job.id, { status: 'error', stage: 'error', message: err.message || 'Production failed.', error: err.message || String(err) });
    }
}
