import { SocksProxyAgent } from 'socks-proxy-agent';
import https from 'https';
import fs from 'fs';
import path from 'path';

const PROXY_URL = process.env.NORDVPN_PROXY || 'socks5://oH2XZer6WzFTaY299bVr9NwL:QrYkpu4itrGTyXnxXAQK4U11@us.socks.nordhold.net:1080';
const agent = new SocksProxyAgent(PROXY_URL);

export class GeminiImageGenerator {
  constructor(apiKey, options = {}) {
    this.apiKey = apiKey;
    this.model = options.model || 'gemini-2.5-flash';
    this.agent = agent;
  }

  async callGemini(payload, model = null) {
    const useModel = model || this.model;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent?key=${this.apiKey}`;
    
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${useModel}:generateContent?key=${this.apiKey}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        agent: this.agent
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.write(JSON.stringify(payload));
      req.end();
    });
  }

  async downloadImage(url) {
    return new Promise((resolve, reject) => {
      https.get(url, { agent: this.agent }, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
      }).on('error', reject);
    });
  }

  imageToBase64(imagePath) {
    return fs.readFileSync(imagePath).toString('base64');
  }

  extractImages(apiResponse, outputDir, baseFilename) {
    const saved = [];
    if (!apiResponse?.candidates) return saved;

    for (let i = 0; i < apiResponse.candidates.length; i++) {
      const candidate = apiResponse.candidates[i];
      const parts = candidate?.content?.parts || [];
      
      for (let j = 0; j < parts.length; j++) {
        if (parts[j].inlineData) {
          const imgData = Buffer.from(parts[j].inlineData.data, 'base64');
          const filename = `${baseFilename}_c${i}_p${j}.jpg`;
          const filepath = path.join(outputDir, filename);
          fs.writeFileSync(filepath, imgData);
          saved.push(filepath);
        }
      }
    }
    return saved;
  }

  // Face swap with multiple prompt attempts
  async faceSwap(structureImage, identityImage, options = {}) {
    const promptVariations = [
      "Create a fashion photo using the outfit, pose and setting from the first image. Use the face features and hair from the second image. Keep the exact outfit and background from the first image.",
      "Fashion lookbook: Combine the clothing and pose from the first reference with the facial features from the second reference. Maintain the original outfit exactly.",
      "Create a portrait wearing the outfit from the first image, with the face characteristics from the second image."
    ];

    const structureB64 = typeof structureImage === 'string' && structureImage.startsWith('http') 
      ? await this.downloadImage(structureImage)
      : this.imageToBase64(structureImage);
    
    const identityB64 = typeof identityImage === 'string' && identityImage.startsWith('http')
      ? await this.downloadImage(identityImage)
      : this.imageToBase64(identityImage);

    const results = [];

    for (let i = 0; i < promptVariations.length; i++) {
      console.log(`   Trying prompt variation ${i + 1}/${promptVariations.length}...`);
      
      const payload = {
        contents: [{
          parts: [
            { text: promptVariations[i] },
            { inline_data: { mime_type: "image/jpeg", data: structureB64 } },
            { inline_data: { mime_type: "image/png", data: identityB64 } }
          ]
        }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio: options.aspectRatio || "9:16" }
        }
      };

      try {
        const response = await this.callGemini(payload, options.model || 'gemini-2.5-flash');
        
        const candidate = response.candidates?.[0];
        if (candidate?.finishReason === 'STOP' && candidate?.content?.parts?.some(p => p.inlineData)) {
          console.log('   ✅ Success!');
          return { success: true, response, promptIndex: i };
        } else if (candidate?.finishReason === 'IMAGE_SAFETY') {
          console.log('   ⚠️ Blocked by safety filter');
          results.push({ success: false, reason: 'safety', promptIndex: i });
        } else {
          results.push({ success: false, reason: 'no_image', promptIndex: i });
        }
      } catch (error) {
        console.log('   ❌ Error:', error.message);
        results.push({ success: false, reason: 'error', error: error.message });
      }
    }

    return { success: false, results };
  }

  // Single image generation
  async generate(prompt, options = {}) {
    const parts = [{ text: prompt }];

    if (options.referenceImage) {
      const imageB64 = typeof options.referenceImage === 'string' && options.referenceImage.startsWith('http')
        ? await this.downloadImage(options.referenceImage)
        : this.imageToBase64(options.referenceImage);
      
      parts.push({
        inline_data: {
          mime_type: options.mimeType || "image/jpeg",
          data: imageB64
        }
      });
    }

    const payload = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: { 
          aspectRatio: options.aspectRatio || "1:1"
        }
      }
    };

    return this.callGemini(payload, options.model);
  }
}

export class ImageDescriptor {
  constructor(apiKey, options = {}) {
    this.apiKey = apiKey;
    this.model = options.model || 'gemini-2.5-flash';
    this.agent = agent;
  }

  async describe(imagePathOrUrl, customPrompt) {
    const defaultPrompt = `Analyze this image and provide a detailed description in JSON format with the following structure:

{
  "meta": {
    "quality": "photo quality description",
    "resolution": "estimated resolution",
    "camera": "camera type if detectable",
    "lens": "lens info if detectable",
    "aspect_ratio": "aspect ratio",
    "style": "visual style description"
  },
  "character_lock": {
    "age": "estimated age range",
    "ethnicity": "ethnicity",
    "hair": { "color": "hair color", "style": "hair style description" },
    "eyes": "eye color",
    "body": { "type": "body type", "chest": "chest description", "waist": "waist description", "hips": "hips description" }
  },
  "scene": { "location": "location/setting", "time": "time of day", "atmosphere": "mood/atmosphere" },
  "camera_perspective": { "pov": "point of view", "angle": "camera angle", "framing": "framing/composition", "phone_visibility": "is phone visible" },
  "subject": { "action": "what the subject is doing", "pose": { "hips": "hip position", "upper_body": "upper body posture", "expression": "facial expression" }, "outfit": { "top": { "type": "top type", "color": "top color", "fit": "fit description", "details": "fabric details" }, "bottom": { "type": "bottom type", "color": "bottom color", "fit": "fit description" } } },
  "lighting": { "type": "lighting type", "effect": "lighting effect on scene" },
  "negative_prompt": ["list of things to avoid"]
}

Return ONLY valid JSON.`;

    const prompt = customPrompt || defaultPrompt;
    
    let imageB64;
    if (typeof imagePathOrUrl === 'string' && imagePathOrUrl.startsWith('http')) {
      imageB64 = await new Promise((resolve, reject) => {
        https.get(imagePathOrUrl, { agent }, (res) => {
          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
        }).on('error', reject);
      });
    } else {
      imageB64 = fs.readFileSync(imagePathOrUrl).toString('base64');
    }

    const payload = {
      contents: [{
        parts: [
          { inline_data: { mime_type: "image/jpeg", data: imageB64 } },
          { text: prompt }
        ]
      }]
    };

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        agent
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
            
            try {
              const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || [null, text];
              resolve(JSON.parse(jsonMatch[1].trim()));
            } catch (e) {
              resolve({ raw_description: text });
            }
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.write(JSON.stringify(payload));
      req.end();
    });
  }
}

export default { GeminiImageGenerator, ImageDescriptor };
