import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { parseFile } from "music-metadata";
import path from "path";
import fs from "fs";

const FPS = 30;
const PLAYBACK_RATE = 1.2;   // audio is sped up 20% at render time
const TAIL_BUFFER_FRAMES = 15; // safety pad so captions finish with the audio

/**
 * Generate a scene voiceover MP3 and measure its rendered duration in frames.
 * @param {object} opts
 * @param {number} opts.sceneNumber
 * @param {string} opts.narrationText
 * @param {string} opts.voiceType      - 'male' / 'female' (tolerant of variations).
 * @param {string} opts.outDir         - Absolute directory to write the .mp3 into.
 * @returns {Promise<{fileName: string, filePath: string, durationInFrames: number, voiceUsed: string}>}
 */
export async function generateSceneAudio({ sceneNumber, narrationText, voiceType, outDir }) {
    if (sceneNumber === undefined || !narrationText) {
        throw new Error("sceneNumber and narrationText are required.");
    }

    // Voice selection (tolerant of Gemini's casing/word variations).
    let selectedVoiceModel = "en-US-GuyNeural"; // default male
    const voiceLabel = voiceType ? voiceType.toLowerCase().trim() : "";
    if (["female", "girl", "woman"].includes(voiceLabel)) {
        selectedVoiceModel = "en-US-JennyNeural";
    } else if (["male", "boy", "man"].includes(voiceLabel)) {
        selectedVoiceModel = "en-US-GuyNeural";
    }

    const tts = new MsEdgeTTS();
    await tts.setMetadata(selectedVoiceModel, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const fileName = `scene_${sceneNumber}.mp3`;
    const filePath = path.join(outDir, fileName);

    const { audioStream } = tts.toStream(narrationText);
    const writableStream = fs.createWriteStream(filePath);
    audioStream.pipe(writableStream);

    await new Promise((resolve, reject) => {
        writableStream.on('finish', resolve);
        writableStream.on('error', reject);
        audioStream.on('error', reject);
    });

    // Measure the real audio length server-side, then apply the same timing
    // math the frontend used previously (sped up by PLAYBACK_RATE + tail pad).
    const metadata = await parseFile(filePath);
    const rawDuration = metadata.format.duration || 0;
    const fastDuration = rawDuration / PLAYBACK_RATE;
    const durationInFrames = Math.ceil(fastDuration * FPS) + TAIL_BUFFER_FRAMES;

    return { fileName, filePath, durationInFrames, voiceUsed: selectedVoiceModel };
}
