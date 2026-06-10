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
                        description: "Must be exactly 'male' if a male character is speaking, or 'female' if a female character is speaking."
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
    2. BACKGROUND LOCK: Establish a highly descriptive environment based on the topic and repeat it exactly word-for-word in every single scene (e.g., "inside a brightly lit modern office with glass walls and minimalist green plants").
    3. CAMERA FRAMING LOGIC: The only element that changes between scenes is the camera composition, which must match your character count constraints:
       - For Single Presenter Monologues: Use solo-focused framing rules like: "Solo centered medium close-up shot of the single man...", "Waist-up profile composition of the single man...", "Solo portrait framing of the man looking directly into the lens...".
       - For Multi-Character Dialogues: Use multi-person framing rules like: "Two-shot medium composition of both characters...", "Wide angle tracking shot displaying both characters...".
    4. STATIC IMAGES ONLY: The visual_prompt describes a STATIC, high-quality scene for an image generator. Do NOT include active verbs or motion (e.g., NO 'winking', 'talking', 'running').

    CRITICAL AUDIO RULES:
    1. For every scene block, you must assign the 'voice_type' string based on which character is speaking that specific line ('male' or 'female').

    CHARACTER DESCRIPTION FIELD:
    1. Output a 'character_description' that is the EXACT same visual anchor you embed in the scenes, but stripped down to ONLY the physical appearance (age, gender, hair, build, clothing, colors). No environment, no camera framing, no actions. This is used to render a clean standalone portrait of the actor.
`;

const NARRATOR_SYSTEM_INSTRUCTION = `
    You are an expert short-form documentary director creating a VOICEOVER NARRATION video with NO on-screen presenter or character.

    NARRATION RULES:
    1. Convert the topic into engaging, fast-paced narration split into scenes. Keep each line punchy.
    2. SINGLE NARRATOR VOICE: set 'voice_type' to the SAME value ('male' or 'female') for EVERY scene.

    VISUAL PROMPT RULES (B-ROLL, NO CHARACTER):
    1. Each 'visual_prompt' is a cinematic, richly detailed STATIC shot of the SUBJECT MATTER being narrated (the place, object, architecture, landscape, or a close-up detail) — NOT a person speaking to camera. Do NOT introduce a narrator, host, or presenter.
    2. SUBJECT/LOCATION LOCK: Establish the core subject and setting precisely and keep that description consistent across every scene; the ONLY thing that changes between scenes is the camera angle/framing (wide establishing shot, extreme close-up of a detail, low-angle, aerial, golden-hour, dramatic night lighting, etc.).
    3. STATIC IMAGES ONLY: describe a still, high-quality scene. No motion verbs (no 'walking', 'waving', 'flowing').
    4. People may appear ONLY if they are intrinsic to the subject (e.g., a crowd at a landmark), never as a narrating character.

    CHARACTER DESCRIPTION FIELD:
    1. Set 'character_description' to "N/A - voiceover narration, no character".
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
export async function generateScript(topic, { narrator = false, verbatim = false } = {}) {
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
    const systemInstruction = verbatim ? `${baseInstruction}\n${VERBATIM_CLAUSE}` : baseInstruction;

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
