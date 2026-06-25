// Indian-accent English voices (en-IN) at the normal -8% pace, with the 1.2x
// render speedup applied the SAME way the real video does (atempo = pitch-safe).
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

const LINE = "Did you know honey never spoils? Archaeologists have found pots of " +
    "honey in ancient tombs that are over three thousand years old, and it's still " +
    "perfectly good to eat. Pretty sweet, right?";

const PLAYBACK_RATE = 1.2;          // matches PLAYBACK_RATE in audioService.js
const RATE = '-8%';                 // matches the normal male/female pace
const VOICES = [
    { tag: 'in_male',        model: 'en-IN-PrabhatNeural'          },
    { tag: 'in_female',      model: 'en-IN-NeerjaNeural'           },
    { tag: 'in_female_expr', model: 'en-IN-NeerjaExpressiveNeural' },
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
    const raw = path.join(outDir, `indian_${tag}_raw.mp3`);
    const final = path.join(outDir, `indian_${tag}.mp3`);
    await synth(model, raw);
    await execFileP(ffmpeg, ['-y', '-i', raw, '-af', `atempo=${PLAYBACK_RATE}`, final]);
    fs.rmSync(raw, { force: true });
    console.log(`✅ ${tag} (${model}) → ${path.basename(final)}`);
}
console.log(`\nFiles in: ${outDir}`);
