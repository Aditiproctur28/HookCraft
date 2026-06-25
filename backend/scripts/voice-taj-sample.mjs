// Taj Mahal paragraph in the three voices, all at -8% pace + pitch-safe 1.2x render.
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getFfmpegPath } from '../services/ffmpeg.js';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'out', 'voices');
fs.mkdirSync(outDir, { recursive: true });

const LINE = "What if I told you that the Taj Mahal changes color throughout the day? " +
    "Most people think it's simply made of white marble, but the monument appears pink at sunrise, " +
    "bright white during the day, and golden or silver under the moonlight. This magical transformation " +
    "happens because the marble reflects sunlight and moonlight differently throughout the day. " +
    "Built over 370 years ago, the Taj Mahal is not just a symbol of love. It's a masterpiece of " +
    "architecture that seems to come alive with changing colors. Did you know this before? " +
    "If this amazed you, like and share it with your friends. " +
    "Follow Factora World for your daily dose of wonder.";

const PLAYBACK_RATE = 1.2;
const RATE = '-8%';

const VOICES = [
    { tag: 'guy_male',        model: 'en-US-GuyNeural'             },
    { tag: 'neerja_female',   model: 'en-IN-NeerjaExpressiveNeural' },
    { tag: 'jenny_female',    model: 'en-US-JennyNeural'           },
];

async function synth(model, rawPath) {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(model, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(LINE, { pitch: '+0%', rate: RATE });
    const w = fs.createWriteStream(rawPath);
    audioStream.pipe(w);
    await new Promise((res, rej) => { w.on('finish', res); w.on('error', rej); audioStream.on('error', rej); });
}

const ffmpeg = getFfmpegPath();
for (const { tag, model } of VOICES) {
    const raw = path.join(outDir, `taj_${tag}_raw.mp3`);
    const final = path.join(outDir, `taj_${tag}.mp3`);
    await synth(model, raw);
    await execFileP(ffmpeg, ['-y', '-i', raw, '-af', `atempo=${PLAYBACK_RATE}`, final]);
    fs.rmSync(raw, { force: true });
    console.log(`✅ ${tag} (${model}) → ${path.basename(final)}`);
}
console.log(`\nFiles in: ${outDir}`);
