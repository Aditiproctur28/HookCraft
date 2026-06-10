import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pulls from your .env and trims any accidental spaces
const HF_TOKEN = process.env.HF_TOKEN ? process.env.HF_TOKEN.trim() : ""; 

export const generateImage = async (req, res) => {
  try {
    const { visual_prompt, scene_number } = req.body;

    if (!visual_prompt || scene_number === undefined) {
      return res.status(400).json({ error: 'visual_prompt and scene_number are required.' });
    }

    const enhancedPrompt = `${visual_prompt}, professional digital art, cinematic lighting, highly detailed, vertical composition, 8k resolution`;
    console.log(`🚀 Sending Scene ${scene_number} to Hugging Face via FLUX.1-schnell...`);

    const response = await axios({
      url: "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
        // 🚀 THE FIX: Forces Axios to send the precise Accept header Hugging Face demands
        "Accept": "image/jpeg"
      },
      data: {
        inputs: enhancedPrompt,
        parameters: {
          width: 512,  
          height: 896, 
        }
      },
      responseType: 'arraybuffer' 
    });

    const buffer = Buffer.from(response.data);

    const outputDir = path.join(__dirname, '../temp_images');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const fileName = `scene_${scene_number}.jpeg`;
    const filePath = path.join(outputDir, fileName);
    
    fs.writeFileSync(filePath, buffer);
    console.log(`✅ Successfully saved from Hugging Face: ${fileName}`);

    return res.status(200).json({
      success: true,
      file_name: fileName,
      file_path: `/temp_images/${fileName}`
    });

  } catch (error) {
    console.error('\n❌ --- HUGGING FACE GENERATION ERROR --- ❌');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Message: ${error.response.data.toString()}`);
    } else {
      console.error(error.message);
    }
    return res.status(500).json({ error: 'Failed to generate image', details: error.message });
  }
};