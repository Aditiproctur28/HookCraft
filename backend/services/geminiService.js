import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { withRetry } from './retry.js';

dotenv.config();

// Strict structure we demand from the AI (unchanged from the original controller).
const scriptSchema = {
    type: "OBJECT",
    properties: {
        video_metrics: {
            type: "OBJECT",
            properties: {
                estimated_duration_seconds: {
                    type: "INTEGER",
                    description: "Estimate based on roughly 2.5 words spoken per second."
                }
            },
            required: ["estimated_duration_seconds"]
        },
        character_description: {
            type: "STRING",
            description: "The visual anchor: a concise, purely physical description of the main character (age, gender, hair, build, clothing, colors) with NO background, NO camera framing, NO action. Used to render a standalone character concept portrait."
        },
        scenes: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    scene_number: { type: "INTEGER" },
                    narration_text: {
                        type: "STRING",
                        description: "The exact words to be spoken by the active character. Keep it punchy."
                    },
                    voice_type: {
                        type: "STRING",
                        enum: ["male", "female", "boy", "girl", "cartoon"],
                        description: "The voice casting for whoever speaks THIS scene. One of: 'male' (adult man), 'female' (adult woman), 'boy' (a child/young boy), 'girl' (a child/young girl), 'cartoon' (an explicitly comedic, cartoonish, animal, robot, or non-human character). Default to 'male'/'female' for ordinary adults."
                    },
                    visual_prompt: {
                        type: "STRING",
                        description: "A highly detailed image generation prompt for the scene background and layout."
                    }
                },
                required: ["scene_number", "narration_text", "voice_type", "visual_prompt"]
            }
        }
    },
    required: ["video_metrics", "character_description", "scenes"]
};

const CHARACTER_SYSTEM_INSTRUCTION = `
    You are an expert AI video pipeline director.

    CRITICAL CHARACTER COUNT & ANTI-HALLUCINATION RULES:
    1. ANALYZE THE CHARACTER COUNT: Carefully evaluate the user's topic to determine the exact number of characters requested. If the user asks for a solo presenter, single person, or a monologue (e.g., "a single man"), EVERY single scene's visual_prompt must feature exactly ONE person.
    2. ABSOLUTE NEGATIVE CONSTRAINT: For solo monologues, do NOT introduce background actors, colleagues, partners, duos, or multiple genders. Completely ban the terms "two-shot", "group", "couple", "standing next to each other", or "collaborators".

    CRITICAL VISUAL PROMPT RULES FOR CHARACTER & BACKGROUND CONSISTENCY:
    1. DEFINE A VISUAL ANCHOR: Establish the precise physical appearance of the requested character(s) in Scene 1 (e.g., age, hair style, clothing type/color) and repeat that exact description word-for-word in every subsequent scene's visual_prompt to maintain image generation continuity.
    2. BACKGROUND LOCK (REQUIRED IN EVERY SCENE): Establish a highly descriptive, concrete environment drawn from the user's topic (e.g., "in a lush green garden with flower beds, trees and soft daylight") and repeat that environment description word-for-word in EVERY single scene's visual_prompt. The character is ALWAYS standing/sitting INSIDE this environment — never on a plain, empty, or studio backdrop. If the user names a location, that location MUST be clearly visible behind and around the character.
    3. SHOW THE CHARACTER INSIDE THE SCENE (NOT A HEADSHOT): The character must occupy only PART of the frame so the surrounding environment is clearly visible. Use medium-full to wide framing — full-body or three-quarter shots, establishing shots, over-the-shoulder shots that reveal the setting.
       - BANNED words/framings (they produce passport/ID-photo results): "close-up", "extreme close-up", "headshot", "passport", "portrait framing", "clean studio background", "plain background", "blank background", "centered" as a composition rule.
       - What changes between scenes is ONLY the camera distance/angle WITHIN the same locked location: e.g. "Wide establishing shot of the man standing in the lush garden...", "Medium-full three-quarter shot of the man among the flower beds...", "Low-angle shot of the man with the garden trees and sky behind him...".
       - For Multi-Character Dialogues: keep both characters inside the visible environment, e.g. "Wide two-shot of both characters standing in the garden...".
    4. STATIC IMAGES ONLY: The visual_prompt describes a STATIC, high-quality still for an image generator. Poses are fine (standing, sitting, holding something), but do NOT include motion/action verbs (e.g. NO 'winking', 'talking', 'running', 'waving').

    CRITICAL AUDIO / VOICE CASTING RULES:
    1. For every scene block, assign 'voice_type' based on WHO is speaking that line:
       - 'male' / 'female' for adult characters — this is the DEFAULT for normal presenters and narration.
       - 'boy' / 'girl' ONLY when the speaker is explicitly a child / kid / young character.
       - 'cartoon' ONLY for an explicitly comedic, cartoonish, animal, robot, or other non-human character.
    2. Do NOT use 'boy', 'girl', or 'cartoon' for ordinary adult presenters — keep those as 'male'/'female'.

    CHARACTER DESCRIPTION FIELD:
    1. Output a 'character_description' that is the EXACT same visual anchor you embed in the scenes, but stripped down to ONLY the physical appearance (age, gender, hair, build, clothing, colors). No environment, no camera framing, no actions. This is used to render a clean standalone portrait of the actor.
`;

const NARRATOR_SYSTEM_INSTRUCTION = `
    You are an expert short-form documentary director creating a VOICEOVER NARRATION video with NO on-screen presenter or character.

    NARRATION RULES:
    1. Convert the topic into engaging, fast-paced narration split into scenes. Keep each line punchy.
    2. SINGLE NARRATOR VOICE: choose ONE 'voice_type' — normally 'male' or 'female' (or 'cartoon' only if the user explicitly wants a fun/cartoonish narrator) — and use that SAME value for EVERY scene.

    VISUAL PROMPT RULES (B-ROLL, NO CHARACTER):
    1. Each 'visual_prompt' is a cinematic, richly detailed STATIC shot of the SUBJECT MATTER being narrated (the place, object, architecture, landscape, or a close-up detail) — NOT a person speaking to camera. Do NOT introduce a narrator, host, or presenter.
    2. SUBJECT/LOCATION LOCK: Establish the core subject and setting precisely and keep that description consistent across every scene; the ONLY thing that changes between scenes is the camera angle/framing (wide establishing shot, extreme close-up of a detail, low-angle, aerial, golden-hour, dramatic night lighting, etc.).
    3. STATIC IMAGES ONLY: describe a still, high-quality scene. No motion verbs (no 'walking', 'waving', 'flowing').
    4. People may appear ONLY if they are intrinsic to the subject (e.g., a crowd at a landmark), never as a narrating character.

    CHARACTER DESCRIPTION FIELD:
    1. Set 'character_description' to "N/A - voiceover narration, no character".
`;

// Appended when the user picks Hindi (auto-generate mode only — see generateScript).
const HINDI_CLAUSE = `
    LANGUAGE — HINDI NARRATION (APPLIES TO THE SPOKEN TEXT ONLY):
    1. Write every scene's 'narration_text' in natural, conversational Hindi using DEVANAGARI script (e.g. "आज हम बात करेंगे..."). Do NOT use romanized/transliterated Hindi.
    2. Translate the MEANING idiomatically and keep it punchy — do NOT do a stiff word-for-word translation. Common English brand/tech terms may stay in English where that is how Hindi speakers actually say them.
    3. Keep 'visual_prompt' and 'character_description' in ENGLISH — the image generator needs English prompts.
`;

// Appended on top of the base instruction when the user supplies a finished script.
const VERBATIM_CLAUSE = `
    VERBATIM SCRIPT MODE (HIGHEST PRIORITY — OVERRIDES ANY REPHRASING RULE):
    The user's input is the FINAL, EXACT narration — NOT a topic to expand.
    1. Use the user's wording WORD-FOR-WORD as 'narration_text'. Do NOT rephrase, shorten, summarize, "improve", add, or remove ANY words. Preserve their exact sentences and punctuation.
    2. You may ONLY split the text into scenes at natural sentence or line-break boundaries. Each scene's 'narration_text' must be an exact, contiguous slice of the user's text; concatenating all scenes' narration_text in order must reproduce the user's input exactly.
    3. Still produce 'visual_prompt', 'voice_type', and 'character_description' for each scene/video to drive the visuals — those are yours to write; the narration is not.
`;

/**
 * Generate a structured video script from a topic.
 * @param {string} topic - The user's topic / rough script.
 * @returns {Promise<{video_metrics: object, scenes: Array}>}
 * @throws {Error} if the API key is missing or generation fails.
 */
export async function generateScript(topic, { narrator = false, verbatim = false, language = 'en' } = {}) {
    if (!topic || !topic.trim()) {
        throw new Error("Please provide a topic or rough script.");
    }
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not defined in the .env file.");
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = verbatim
        ? `The text below is the FINAL narration script to use WORD-FOR-WORD. Split it into scenes and build the visuals around it, without changing any of the user's words.\n\nScript:\n"${topic}"`
        : `You are an expert short-form video producer.\nTake the following request/topic and convert it into a highly engaging, fast-paced vertical video script.\nMake sure the conversation flows exactly as requested by the user.\n\nTopic/Request: "${topic}"`;

    const baseInstruction = narrator ? NARRATOR_SYSTEM_INSTRUCTION : CHARACTER_SYSTEM_INSTRUCTION;
    // Verbatim keeps the user's exact words (so no translation); otherwise honor the language pick.
    let systemInstruction = baseInstruction;
    if (verbatim) systemInstruction = `${baseInstruction}\n${VERBATIM_CLAUSE}`;
    else if (language === 'hi') systemInstruction = `${baseInstruction}\n${HINDI_CLAUSE}`;

    const response = await withRetry(() => ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: scriptSchema,
        }
    }), { label: 'Gemini script generation' });

    return JSON.parse(response.text);
}
