// Normal English voices (male=Guy, female=Jenny) at the current SSML rate, with
// the 1.2x video speedup applied so it matches the final render exactly.
// Tweak RATE below and re-run to audition different paces.
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
const RATE = '-8%';                 // matches the new male/female rate.en
const VOICES = [
    { tag: 'male',   model: 'en-US-GuyNeural'   },
    { tag: 'female', model: 'en-US-JennyNeural' },
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
    const raw = path.join(outDir, `pace_${tag}_raw.mp3`);
    const final = path.join(outDir, `pace_${tag}_${RATE.replace(/[+%]/g, '')}.mp3`);
    await synth(model, raw);
    // Remotion's <Audio playbackRate> speeds up with atempo, which PRESERVES pitch
    // (asetrate would raise pitch → chipmunk). Match the real render here.
    await execFileP(ffmpeg, ['-y', '-i', raw, '-af', `atempo=${PLAYBACK_RATE}`, final]);
    fs.rmSync(raw, { force: true });
    console.log(`✅ ${tag} @ rate ${RATE} (x${PLAYBACK_RATE}) → ${path.basename(final)}`);
}
console.log(`\nFiles in: ${outDir}`);
