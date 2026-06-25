// Jenny (en-US-JennyNeural) cartoon at pitch +12% vs +16%, ~10s, 96kbit,
// with the 1.2x video speedup applied so it matches the final render.
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

const LINE = "Hey there, everyone! Welcome to a super fun little adventure. " +
    "Today we explore a magical sunny meadow and meet some silly new friends. Come on, let's go!";

const VOICE = 'en-US-JennyNeural';
const RATE = '+5%';
const PITCHES = ['+6%', '+12%', '+16%'];

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
    const raw = path.join(outDir, `jenny_${tag}_raw.mp3`);
    const final = path.join(outDir, `jenny_${tag}.mp3`);
    await synth(pitch, raw);
    await execFileP(ffmpeg, ['-y', '-i', raw, '-af', 'asetrate=24000*1.2,aresample=24000', final]);
    fs.rmSync(raw, { force: true });
    console.log(`✅ Jenny pitch ${pitch} → jenny_${tag}.mp3`);
}
console.log(`\nFiles in: ${outDir}`);
