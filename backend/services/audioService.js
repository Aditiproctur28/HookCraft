import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { parseFile } from "music-metadata";
import path from "path";
import fs from "fs";

const FPS = 30;
const PLAYBACK_RATE = 1.2;   // audio is sped up 20% at render time
// Small pad after each scene's audio so captions finish cleanly. Kept short on
// purpose: this is dead silence between lines, so a large value reads as a pause
// after every sentence. MUST stay in sync with the matching value in MasterVideo.jsx.
const TAIL_BUFFER_FRAMES = 3; // ~0.1s breath between lines (was 15 → 0.5s, too long)

/**
 * Generate a scene voiceover MP3 and measure its rendered duration in frames.
 * @param {object} opts
 * @param {number} opts.sceneNumber
 * @param {string} opts.narrationText
 * @param {string} opts.voiceType      - 'male' / 'female' (tolerant of variations).
 * @param {string} opts.language       - 'en' / 'hi' (defaults to 'en').
 * @param {string} opts.outDir         - Absolute directory to write the .mp3 into.
 * @returns {Promise<{fileName: string, filePath: string, durationInFrames: number, voiceUsed: string, wordTimings: Array}>}
 */
// Voice "casting" presets. Edge TTS only ships ADULT neural voices (plus one real
// child-girl voice, en-US-AnaNeural), so kid/cartoon voices are synthesized by
// shifting pitch/rate of a base voice via SSML prosody. `base` is per-language;
// `pitch` is per-language (Hindi has no child voice, so it needs more lift).
const VOICE_PRESETS = {
    // rate is an SSML speaking-rate bump (faster speech, SAME pitch — unlike
    // PLAYBACK_RATE, which resamples and would raise pitch). Per-language because
    // Hindi (Madhur/Swara) reads more slowly than the English voices, so it needs
    // a bigger push to match the same on-screen energy. Note: the final video also
    // applies PLAYBACK_RATE (1.2×) on top of these at render time.
    male:    { base: { en: "en-US-GuyNeural",   hi: "hi-IN-MadhurNeural" }, pitch: { en: "+0%",  hi: "+0%"  }, rate: { en: "-8%", hi: "+20%" } },
    female:  { base: { en: "en-IN-NeerjaExpressiveNeural", hi: "hi-IN-SwaraNeural"  }, pitch: { en: "+0%",  hi: "+0%"  }, rate: { en: "-8%", hi: "+20%" } },
    girl:    { base: { en: "en-US-AnaNeural",   hi: "hi-IN-SwaraNeural"  }, pitch: { en: "+0%",  hi: "+30%" }, rate: { en: "+10%", hi: "+20%" } },
    boy:     { base: { en: "en-US-AnaNeural",   hi: "hi-IN-MadhurNeural" }, pitch: { en: "-12%", hi: "+38%" }, rate: { en: "+10%", hi: "+20%" } },
    // Cartoon = a crisp ADULT voice (Jenny) with a moderate pitch lift: clear,
    // intelligible diction that still reads as a fun animated character. (The
    // child voice was cuter but mumbly, and the 1.2× playback raises pitch too.)
    cartoon: { base: { en: "en-US-JennyNeural", hi: "hi-IN-SwaraNeural"  }, pitch: { en: "+6%", hi: "+8%" }, rate: { en: "+5%", hi: "+12%" } },
};

// Map Gemini's (possibly loose) voice label onto a preset key. Order matters:
// child/cartoon checks run before the generic adult ones.
function resolvePreset(voiceType) {
    const v = String(voiceType || "").toLowerCase().trim();
    if (/cartoon|chipmunk|funny|comic|silly|mascot|monster|robot/.test(v)) return "cartoon";
    if (/girl/.test(v)) return "girl";   // "girl", "little girl", "young girl", "child girl"
    if (/boy/.test(v)) return "boy";     // "boy", "little boy", "young boy", "child boy"
    if (/female|woman|lady/.test(v)) return "female";
    return "male";                        // "male", "man", or anything unrecognized
}

// Edge TTS reports word offsets/durations in 100-nanosecond "ticks".
const TICKS_PER_SECOND = 10_000_000;

export async function generateSceneAudio({ sceneNumber, narrationText, voiceType, language, outDir }) {
    if (sceneNumber === undefined || !narrationText) {
        throw new Error("sceneNumber and narrationText are required.");
    }

    // Cast the voice: language picks the base voice, the preset adds pitch/rate.
    const langKey = ["en", "hi"].includes(String(language || "").toLowerCase()) ? String(language).toLowerCase() : "en";
    const preset = VOICE_PRESETS[resolvePreset(voiceType)];
    const selectedVoiceModel = preset.base[langKey] || preset.base.en;
    const prosody = { pitch: preset.pitch[langKey] ?? "+0%", rate: preset.rate[langKey] ?? "+0%" };

    const tts = new MsEdgeTTS();
    // wordBoundaryEnabled → Edge emits a per-word timestamp stream we use to sync captions.
    // 96kbit (up from 48kbit) for clearer speech — matters most for the
    // pitch-shifted cartoon voice, which muddies at low bitrate. Timing is
    // measured from the file afterwards, so this doesn't affect sync.
    await tts.setMetadata(selectedVoiceModel, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, { wordBoundaryEnabled: true });

    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const fileName = `scene_${sceneNumber}.mp3`;
    const filePath = path.join(outDir, fileName);

    const { audioStream, metadataStream } = tts.toStream(narrationText, prosody);
    const writableStream = fs.createWriteStream(filePath);
    audioStream.pipe(writableStream);

    // Collect per-word boundaries as they stream in (alongside the audio).
    const rawTimings = [];
    if (metadataStream) {
        metadataStream.on('data', (chunk) => {
            try {
                const { Metadata = [] } = JSON.parse(chunk.toString());
                for (const m of Metadata) {
                    if (m.Type === 'WordBoundary' && m.Data?.text?.Text) {
                        rawTimings.push({
                            text: m.Data.text.Text,
                            offset: m.Data.Offset,
                            duration: m.Data.Duration,
                        });
                    }
                }
            } catch { /* ignore malformed metadata frames */ }
        });
    }

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

    // Map word timings onto the RENDERED timeline: convert ticks→seconds, then
    // divide by PLAYBACK_RATE since the audio is sped up 1.2× at render time.
    const wordTimings = rawTimings.map((w) => ({
        text: w.text,
        start: w.offset / TICKS_PER_SECOND / PLAYBACK_RATE,
        end: (w.offset + w.duration) / TICKS_PER_SECOND / PLAYBACK_RATE,
    }));

    return { fileName, filePath, durationInFrames, voiceUsed: selectedVoiceModel, wordTimings };
}
