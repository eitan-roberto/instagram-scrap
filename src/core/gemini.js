import fs from 'fs';
import path from 'path';
import https from 'https';

/**
 * Generic Gemini Image Generator
 * Supports multiple generation modes:
 * - face-swap: Swap faces between two images
 * - generate: Generate from text + image prompt
 * - describe: Analyze image and return structured description
 */

export class GeminiImageGenerator {
  constructor(apiKey, options = {}) {
    this.apiKey = apiKey;
    this.model = options.model || 'gemini-2.5-flash';
    this.timeout = options.timeout || 120000;
  }

  /**
   * Convert image file to base64
   */
  imageToBase64(imagePath) {
    const data = fs.readFileSync(imagePath);
    return data.toString('base64');
  }

  /**
   * Download image from URL and convert to base64
   */
  async downloadImage(url) {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve(buffer.toString('base64'));
        });
      }).on('error', reject);
    });
  }

  /**
   * Call Gemini API
   */
  async callGemini(parts, generationConfig = {}) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    
    const payload = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        ...generationConfig
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(endpoint, {
        method: 'POST',
        headers: {
          'x-goog-api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        timeout: this.timeout
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) {
              reject(new Error(json.error.message));
            } else {
              resolve(json);
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

  /**
   * Face swap: Keep outfit/body from structure image, face/skin from identity image
   */
  async faceSwap(identityImagePath, structureImagePath, options = {}) {
    const prompt = options.prompt || "Recreate the first image but with the model of the second image, keeping the outfit and body shape from the first image but with the skin type and tone of the second image.";
    
    const identityB64 = this.imageToBase64(identityImagePath);
    const structureB64 = this.imageToBase64(structureImagePath);

    const parts = [
      { text: prompt },
      { inline_data: { mime_type: "image/jpeg", data: structureB64 } },
      { inline_data: { mime_type: "image/jpeg", data: identityB64 } }
    ];

    return this.callGemini(parts, {
      imageConfig: { aspectRatio: options.aspectRatio || "9:16" }
    });
  }

  /**
   * Generate image from text prompt + optional reference image
   */
  async generate(prompt, options = {}) {
    const parts = [{ text: prompt }];

    if (options.referenceImage) {
      const imageB64 = this.imageToBase64(options.referenceImage);
      parts.push({
        inline_data: {
          mime_type: options.mimeType || "image/jpeg",
          data: imageB64
        }
      });
    }

    return this.callGemini(parts, {
      imageConfig: { 
        aspectRatio: options.aspectRatio || "1:1",
        ...options.imageConfig
      }
    });
  }

  /**
   * Extract images from API response and save to disk
   */
  extractImages(apiResponse, outputDir, baseFilename) {
    const saved = [];
    
    if (!apiResponse?.candidates) return saved;

    for (let i = 0; i < apiResponse.candidates.length; i++) {
      const candidate = apiResponse.candidates[i];
      const parts = candidate?.content?.parts || [];
      
      for (let j = 0; j < parts.length; j++) {
        const part = parts[j];
        if (part.inlineData) {
          const imgData = Buffer.from(part.inlineData.data, 'base64');
          const filename = `${baseFilename}_c${i}_p${j}.jpg`;
          const filepath = path.join(outputDir, filename);
          
          fs.writeFileSync(filepath, imgData);
          saved.push(filepath);
        }
      }
    }
    
    return saved;
  }
}

/**
 * Image Descriptor - Analyze images and return structured descriptions
 */
export class ImageDescriptor {
  constructor(apiKey, options = {}) {
    this.apiKey = apiKey;
    this.model = options.model || 'gemini-2.5-flash';
  }

  /**
   * Describe an image with structured output
   */
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
    "hair": {
      "color": "hair color",
      "style": "hair style description"
    },
    "eyes": "eye color",
    "body": {
      "type": "body type",
      "chest": "chest description",
      "waist": "waist description",
      "hips": "hips description"
    }
  },
  "scene": {
    "location": "location/setting",
    "time": "time of day",
    "atmosphere": "mood/atmosphere"
  },
  "camera_perspective": {
    "pov": "point of view",
    "angle": "camera angle",
    "framing": "framing/composition",
    "phone_visibility": "is phone visible"
  },
  "subject": {
    "action": "what the subject is doing",
    "pose": {
      "hips": "hip position",
      "upper_body": "upper body posture",
      "expression": "facial expression"
    },
    "outfit": {
      "top": {
        "type": "top type",
        "color": "top color",
        "fit": "fit description",
        "details": "fabric details"
      },
      "bottom": {
        "type": "bottom type",
        "color": "bottom color",
        "fit": "fit description"
      }
    }
  },
  "lighting": {
    "type": "lighting type",
    "effect": "lighting effect on scene"
  },
  "negative_prompt": ["list", "of", "things", "to", "avoid"]
}

Be precise and detailed. Return ONLY valid JSON.`;

    const prompt = customPrompt || defaultPrompt;
    
    // Get image base64
    let imageB64;
    if (imagePathOrUrl.startsWith('http')) {
      const response = await fetch(imagePathOrUrl);
      const buffer = await response.arrayBuffer();
      imageB64 = Buffer.from(buffer).toString('base64');
    } else {
      imageB64 = fs.readFileSync(imagePathOrUrl).toString('base64');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    
    const payload = {
      contents: [{
        parts: [
          { inline_data: { mime_type: "image/jpeg", data: imageB64 } },
          { text: prompt }
        ]
      }],
      generationConfig: {
        responseModalities: ["TEXT"]
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-goog-api-key': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    
    // Extract text response
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Try to parse JSON from the response
    try {
      // Find JSON in the response (it might be wrapped in markdown)
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || 
                        text.match(/```\s*([\s\S]*?)\s*```/) ||
                        [null, text];
      
      const jsonStr = jsonMatch[1].trim();
      return JSON.parse(jsonStr);
    } catch (e) {
      // Return raw text if JSON parsing fails
      return { raw_description: text, parse_error: e.message };
    }
  }

  /**
   * Batch describe multiple images
   */
  async describeBatch(imagePaths, options = {}) {
    const results = [];
    
    for (const [index, imagePath] of imagePaths.entries()) {
      console.log(`[${index + 1}/${imagePaths.length}] Describing: ${imagePath}`);
      try {
        const description = await this.describe(imagePath, options.prompt);
        results.push({
          image: imagePath,
          description,
          success: true
        });
      } catch (error) {
        results.push({
          image: imagePath,
          error: error.message,
          success: false
        });
      }
      
      // Small delay between requests
      if (index < imagePaths.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    
    return results;
  }
}

export default { GeminiImageGenerator, ImageDescriptor };
