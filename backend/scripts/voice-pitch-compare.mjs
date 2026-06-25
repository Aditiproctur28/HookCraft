// ~10s cute-critter (en-US-AnaNeural) samples at pitch +6% vs +12% to compare.
// 1.2x resample applied so it matches the final video's playback pitch.
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

// ~28 words → ~10s after the 1.2x speedup.
const LINE = "Hey there, everyone! Welcome to a super fun little adventure. " +
    "Today we explore a magical sunny meadow and meet some silly new friends. Come on, let's go!";

const VOICE = 'en-US-AnaNeural';
const RATE = '+6%';
const PITCHES = ['+6%', '+12%'];

async function synth(pitch, rawPath) {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(LINE, { pitch, rate: RATE });
    const w = fs.createWriteStream(rawPath);
    audioStream.pipe(w);
    await new Promise((res, rej) => { w.on('finish', res); w.on('error', rej); audioStream.on('error', rej); });
}

const ffmpeg = getFfmpegPath();
for (const pitch of PITCHES) {
    const tag = pitch.replace(/[+%]/g, '');
    const raw = path.join(outDir, `pitch_${tag}_raw.mp3`);
    const final = path.join(outDir, `pitch_${tag}.mp3`);
    await synth(pitch, raw);
    await execFileP(ffmpeg, ['-y', '-i', raw, '-af', 'asetrate=24000*1.2,aresample=24000', final]);
    fs.rmSync(raw, { force: true });
    console.log(`✅ pitch ${pitch} → pitch_${tag}.mp3`);
}
console.log(`\nFiles in: ${outDir}`);
