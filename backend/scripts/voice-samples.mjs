// Generate cartoon-voice candidates so we can pick by ear. Each sample is
// rendered THEN resampled by 1.2x to mimic the final video's playbackRate
// (which raises pitch) — so what you hear here is what lands in the video.
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

const LINE = "Hi friends! Come on, let's go on a super silly little adventure!";

// Candidate cartoon voices (base Edge voice + SSML pitch/rate).
const CANDIDATES = [
    { name: '1_cute_critter',  voice: 'en-US-AnaNeural',   pitch: '+12%', rate: '+6%'  }, // child voice, lightly lifted — natural & cute
    { name: '2_peppy_mascot',  voice: 'en-US-AriaNeural',  pitch: '+22%', rate: '+12%' }, // bright, energetic mascot
    { name: '3_zany_goofball', voice: 'en-US-DavisNeural', pitch: '+26%', rate: '+14%' }, // wacky comedic
    { name: '4_goofy_big_guy', voice: 'en-US-GuyNeural',   pitch: '-18%', rate: '-3%'  }, // deep, dopey monster/ogre
    { name: '5_squeaky',       voice: 'en-US-AnaNeural',   pitch: '+30%', rate: '+10%' }, // chipmunk-ish but on a child base
    { name: '0_current',       voice: 'en-US-JennyNeural', pitch: '+45%', rate: '+13%' }, // the existing one, for reference
];

async function synth(voice, pitch, rate, rawPath) {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(LINE, { pitch, rate });
    const w = fs.createWriteStream(rawPath);
    audioStream.pipe(w);
    await new Promise((res, rej) => { w.on('finish', res); w.on('error', rej); audioStream.on('error', rej); });
}

const ffmpeg = getFfmpegPath();
for (const c of CANDIDATES) {
    const raw = path.join(outDir, `${c.name}_raw.mp3`);
    const final = path.join(outDir, `${c.name}.mp3`);
    try {
        await synth(c.voice, c.pitch, c.rate, raw);
        // asetrate*1.2 then resample back = naive 1.2x resample (speed + pitch up),
        // matching Remotion <Audio playbackRate={1.2}>.
        await execFileP(ffmpeg, ['-y', '-i', raw, '-af', 'asetrate=24000*1.2,aresample=24000', final]);
        fs.rmSync(raw, { force: true });
        console.log(`✅ ${c.name}  (${c.voice} ${c.pitch}/${c.rate})`);
    } catch (e) {
        console.error(`❌ ${c.name}: ${e.message}`);
    }
}
console.log(`\nListen to the files in: ${outDir}`);
