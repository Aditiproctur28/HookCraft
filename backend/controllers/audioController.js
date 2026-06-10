import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Helper to get directory path in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const generateAudio = async (req, res) => {
    try {
        const { scene_number, narration_text, voice_type } = req.body;

        if (scene_number === undefined || !narration_text) {
            return res.status(400).json({ success: false, error: "Missing scene_number or narration_text" });
        }

        // 1. Dynamic Voice Switching (Bulletproofed for Gemini's variations)
        let selectedVoiceModel = "en-US-GuyNeural"; // Default to male
        
        // Clean up the text just in case Gemini added spaces or uppercase letters
        const voiceLabel = voice_type ? voice_type.toLowerCase().trim() : "";

        // Catch anything that means "female" or "girl"
        if (voiceLabel === "female" || voiceLabel === "girl" || voiceLabel === "woman") {
            // JennyNeural is a great, clear female voice
            selectedVoiceModel = "en-US-JennyNeural"; 
        } 
        // Catch anything that means "male" or "boy"
        else if (voiceLabel === "male" || voiceLabel === "boy" || voiceLabel === "man") {
            // Guy is a clear male voice 
            selectedVoiceModel = "en-US-GuyNeural"; 
        }

        console.log(`Scene ${scene_number} -> Gemini sent: "${voice_type}". Assigned Voice: ${selectedVoiceModel}`);

        // 2. Setup the TTS Engine
        const tts = new MsEdgeTTS();
        await tts.setMetadata(selectedVoiceModel, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

        // 3. Prepare the output directory
        const rootDir = path.resolve(__dirname, '..'); 
        const outputDir = path.join(rootDir, 'temp_audio');
        
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const fileName = `scene_${scene_number}.mp3`;
        const filePath = path.join(outputDir, fileName);

        // 🚀 NEW: Wrap the text in SSML to speed up the pacing!
        // +20% rate gives it that snappy short-form video energy.
       // 4. Generate the audio stream and write it to our specific file path
const { audioStream } = tts.toStream(narration_text);
        const writableStream = fs.createWriteStream(filePath);

        // Pipe the TTS stream directly into the local file
        audioStream.pipe(writableStream);

        // Wait until the file is completely saved before responding
        await new Promise((resolve, reject) => {
            writableStream.on('finish', resolve);
            writableStream.on('error', reject);
            audioStream.on('error', reject);
        });

        // 5. Respond back to the frontend with the static URL path
        return res.status(200).json({
            success: true,
            file_path: `/temp_audio/${fileName}`,
            voice_used: selectedVoiceModel
        });

    } catch (error) {
        console.error(`Audio Generation Error for Scene ${req.body?.scene_number}:`, error);
        return res.status(500).json({ success: false, error: "Failed to generate audio track" });
    }
};