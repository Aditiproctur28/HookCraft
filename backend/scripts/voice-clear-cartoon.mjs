// Clearer cartoon candidates: crisp ADULT voices with a moderate pitch lift
// (clear diction, still characterful) vs the mushy child voice. ~10s, 96kbit,
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

// Crisp adult voices, modest pitch so it stays intelligible after the 1.2x lift.
const CANDIDATES = [
    { name: 'A_aria',     voice: 'en-US-AriaNeural',     pitch: '+16%', rate: '+5%' },
    { name: 'B_jenny',    voice: 'en-US-JennyNeural',    pitch: '+16%', rate: '+5%' },
    { name: 'C_michelle', voice: 'en-US-MichelleNeural', pitch: '+18%', rate: '+5%' },
    { name: 'D_sara',     voice: 'en-US-SaraNeural',     pitch: '+20%', rate: '+8%' },
];

async function synth(voice, pitch, rate, rawPath) {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(LINE, { pitch, rate });
    const w = fs.createWriteStream(rawPath);
    audioStream.pipe(w);
    await new Promise((res, rej) => { w.on('finish', res); w.on('error', rej); audioStream.on('error', rej); });
}

const ffmpeg = getFfmpegPath();
for (const c of CANDIDATES) {
    const raw = path.join(outDir, `clear_${c.name}_raw.mp3`);
    const final = path.join(outDir, `clear_${c.name}.mp3`);
    try {
        await synth(c.voice, c.pitch, c.rate, raw);
        await execFileP(ffmpeg, ['-y', '-i', raw, '-af', 'asetrate=24000*1.2,aresample=24000', final]);
        fs.rmSync(raw, { force: true });
        console.log(`✅ clear_${c.name}  (${c.voice} ${c.pitch}/${c.rate})`);
    } catch (e) {
        console.error(`❌ clear_${c.name}: ${e.message}`);
    }
}
console.log(`\nFiles in: ${outDir}`);
