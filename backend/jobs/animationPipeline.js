import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { generateScript } from '../services/geminiService.js';
import { generateSceneImage } from '../services/imageService.js';
import { generateSceneAudio } from '../services/audioService.js';
import { animateStill } from '../services/ltxService.js';
import { renderAnimatedVideo } from '../services/renderService.js';
import { resolveDimensions } from '../services/dimensions.js';
import { cleanErrorMessage } from '../services/retry.js';
import { updateJob } from './jobStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;
const PUBLIC_BASE = process.env.PUBLIC_BASE || `http://localhost:${PORT}`;

const jobDirFor = (id) => path.join(__dirname, '..', 'jobs', id);
const randomSeed = () => Math.floor(Math.random() * 2_147_483_647);

// Each scene costs one image-to-video call (minutes + free-tier GPU quota), so
// cap how many we animate to keep a run feasible.
const MAX_SCENES = Number(process.env.ANIMATION_MAX_SCENES || 5);
// In silent (no-voiceover) mode there's no narration to set the scene length,
// so each clip runs for this many seconds.
const SILENT_CLIP_SEC = Number(process.env.ANIMATION_SILENT_CLIP_SEC || 4);

/** Fallback motion when Gemini didn't supply one. */
function motionFor(scene) {
    return scene.motion_prompt
        || `${scene.visual_prompt}, subtle natural motion, gentle slow camera movement, smooth cinematic`;
}

/**
 * Full animation pipeline (fire-and-forget; never throws):
 *   script → per scene [ FLUX still → TTS audio → LTX clip ] → render MP4.
 */
export async function runAnimation(job, { topic, aspectRatio, captionStyle, scriptMode, language, narration }) {
    const jobDir = jobDirFor(job.id);
    const imagesDir = path.join(jobDir, 'images');
    const audioDir = path.join(jobDir, 'audio');
    const clipsDir = path.join(jobDir, 'clips');
    const resolvedAspect = aspectRatio === '16:9' ? '16:9' : '9:16';
    const { fluxWidth, fluxHeight, videoWidth, videoHeight } = resolveDimensions(resolvedAspect);
    const resolvedLanguage = language === 'hi' ? 'hi' : 'en';
    const verbatim = scriptMode === 'verbatim';
    const resolvedCaption = captionStyle === 'sentence' ? 'sentence' : 'word';
    // Silent mode: no voiceover and no captions — a purely visual animation.
    const narrate = narration !== 'off';

    try {
        updateJob(job.id, {
            status: 'running', stage: 'script', message: 'Writing the script…', pct: 8,
            captionStyle: resolvedCaption, width: videoWidth, height: videoHeight,
        });

        const script = await generateScript(topic, { animation: true, verbatim, language: resolvedLanguage });
        if (!script.scenes || script.scenes.length === 0) throw new Error('The script came back with no scenes.');

        // Cap scene count (free-tier GPU budget) and lock a seed for a consistent character.
        const allScenes = script.scenes;
        const scenes = allScenes.slice(0, MAX_SCENES);
        const trimmed = allScenes.length - scenes.length;
        if (trimmed > 0) {
            console.log(`ℹ️ Animation: trimmed ${trimmed} scene(s) beyond the ${MAX_SCENES}-scene cap.`);
        }
        const seed = randomSeed();
        const total = scenes.length;
        const enriched = [];

        for (let i = 0; i < total; i++) {
            const scene = scenes[i];
            const n = scene.scene_number ?? i + 1;
            const base = 12 + Math.round((i / total) * 70); // 12 → 82 across scenes

            // 1) Still for this scene (locked seed keeps the character consistent).
            updateJob(job.id, { stage: 'artwork', message: `Painting scene ${i + 1}/${total}…`, pct: base });
            const img = await generateSceneImage({
                visualPrompt: scene.visual_prompt,
                sceneNumber: n,
                outDir: imagesDir,
                width: fluxWidth,
                height: fluxHeight,
                seed,
            });
            const imageBuffer = fs.readFileSync(img.filePath);

            // 2) Narration (gives us the scene length + word timings) — skipped
            //    entirely in silent mode, where the clip length sets the scene.
            let aud = null;
            let targetSec = SILENT_CLIP_SEC;
            if (narrate) {
                updateJob(job.id, { stage: 'voiceover', message: `Voicing scene ${i + 1}/${total}…`, pct: base + 2 });
                aud = await generateSceneAudio({
                    sceneNumber: n,
                    narrationText: scene.narration_text,
                    voiceType: scene.voice_type,
                    language: resolvedLanguage,
                    outDir: audioDir,
                });
                targetSec = aud.durationInFrames / 30;
            }

            // 3) Animate the still into a clip (~ the narration length, clamped).
            updateJob(job.id, { stage: 'animate', message: `Animating scene ${i + 1}/${total} (this is the slow part)…`, pct: base + 4 });
            const clip = await animateStill({
                imageBuffer,
                motionPrompt: motionFor(scene),
                aspectRatio: resolvedAspect,
                durationSec: targetSec,
                seed,
                outDir: clipsDir,
                fileName: `clip_${n}.mp4`,
            });

            // Narrated → scene length follows the voiceover (clip stretched to fit).
            // Silent → scene length follows the actual clip (plays at natural speed).
            const durationInFrames = narrate ? aud.durationInFrames : Math.round(clip.durationSec * 30);

            enriched.push({
                scene_number: n,
                narrationText: narrate ? scene.narration_text : '',
                clipUrl: `${PUBLIC_BASE}/jobs/${job.id}/clips/${clip.fileName}`,
                audioUrl: narrate ? `${PUBLIC_BASE}/jobs/${job.id}/audio/${aud.fileName}` : null,
                durationInFrames,
                wordTimings: narrate ? aud.wordTimings : [],
                clipDurationSec: clip.durationSec,
            });
        }

        const totalDurationInFrames = enriched.reduce((s, sc) => s + sc.durationInFrames, 0);

        updateJob(job.id, {
            stage: 'render', message: 'Stitching the final video…', pct: 84,
            scenes: enriched, totalDurationInFrames, width: videoWidth, height: videoHeight,
        });

        const fileName = `hookcraft_anim_${job.id}.mp4`;
        const outputLocation = path.join(jobDir, fileName);
        await renderAnimatedVideo({
            scenes: enriched,
            totalDurationInFrames,
            width: videoWidth,
            height: videoHeight,
            captionStyle: resolvedCaption,
            outputLocation,
            onProgress: (p) => updateJob(job.id, { stage: 'render', message: `Rendering MP4… ${Math.round(p * 100)}%`, pct: 84 + Math.round(p * 15) }),
        });

        updateJob(job.id, {
            status: 'done', stage: 'done', message: 'Done!', pct: 100,
            downloadUrl: `${PUBLIC_BASE}/jobs/${job.id}/${fileName}`,
        });
    } catch (err) {
        console.error(`❌ Animation error (job ${job.id}):`, err);
        updateJob(job.id, { status: 'error', stage: 'error', message: cleanErrorMessage(err), error: err.message || String(err) });
    }
}
