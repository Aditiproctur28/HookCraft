// Hunt for a cheerful young Indian-accent English MALE voice.
// Edge en-IN only has Prabhat (reads older/flat), so we try:
//   - Prabhat with pitch lifts to sound younger/brighter
//   - Hindi male voices (Madhur) reading English → natural Indian accent, livelier
// All at the normal -8% pace + 1.2x atempo (pitch-safe), matching the real render.
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

const PLAYBACK_RATE = 1.2;
const RATE = '-8%';

// tag, model, pitch — pitch lifts brighten/younger-ify the timbre.
const VARIANTS = [
    { tag: 'prabhat_p8',  model: 'en-IN-PrabhatNeural', pitch: '+8%'  },
    { tag: 'prabhat_p15', model: 'en-IN-PrabhatNeural', pitch: '+15%' },
    { tag: 'madhur_p0',   model: 'hi-IN-MadhurNeural',  pitch: '+0%'  },
    { tag: 'madhur_p8',   model: 'hi-IN-MadhurNeural',  pitch: '+8%'  },
];

async function synth(model, pitch, rawPath) {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(model, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(LINE, { pitch, rate: RATE });
    const w = fs.createWriteStream(rawPath);
    audioStream.pipe(w);
    await new Promise((res, rej) => { w.on('finish', res); w.on('error', rej); audioStream.on('error', rej); });
}

const ffmpeg = getFfmpegPath();
for (const { tag, model, pitch } of VARIANTS) {
    const raw = path.join(outDir, `inmale_${tag}_raw.mp3`);
    const final = path.join(outDir, `inmale_${tag}.mp3`);
    await synth(model, pitch, raw);
    await execFileP(ffmpeg, ['-y', '-i', raw, '-af', `atempo=${PLAYBACK_RATE}`, final]);
    fs.rmSync(raw, { force: true });
    console.log(`✅ ${tag} (${model}, pitch ${pitch}) → ${path.basename(final)}`);
}
console.log(`\nFiles in: ${outDir}`);
