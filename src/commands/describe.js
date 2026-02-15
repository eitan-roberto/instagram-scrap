import fs from 'fs';
import path from 'path';
import { parseCSV } from '../core/csv.js';
import { ImageDescriptor } from '../core/gemini.js';

const DEFAULT_API_KEY = process.env.GEMINI_API_KEY;

export async function describeCommand(flags) {
  const inputFile = flags.input || flags.i;
  const outputDir = flags.output || flags.o || './descriptions';
  const apiKey = flags.apiKey || flags.key || DEFAULT_API_KEY;
  const model = flags.model || 'gemini-2.5-flash';
  const batch = flags.batch !== 'false'; // Default true

  if (!inputFile) {
    console.error('❌ Error: --input is required');
    console.log('Usage:');
    console.log('  ./cli.js describe -i ./data/posts.csv');
    console.log('  ./cli.js describe -i ./image.jpg');
    process.exit(1);
  }

  if (!apiKey) {
    console.error('❌ Error: Gemini API key required');
    console.log('Set GEMINI_API_KEY env var or use --apiKey flag');
    process.exit(1);
  }

  console.log(`\n🔍 Image Describer`);
  console.log(`📂 Input: ${inputFile}`);
  console.log(`💾 Output: ${outputDir}`);
  console.log(`🤖 Model: ${model}\n`);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const descriptor = new ImageDescriptor(apiKey, { model });

  // Check if input is a single image or CSV
  if (inputFile.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
    // Single image mode
    console.log('Mode: Single image\n');
    
    const description = await descriptor.describe(inputFile);
    
    const outputPath = path.join(outputDir, 'single_image_desc.json');
    fs.writeFileSync(outputPath, JSON.stringify(description, null, 2));
    
    console.log('\n📋 Description:');
    console.log(JSON.stringify(description, null, 2));
    console.log(`\n✅ Saved to: ${outputPath}`);
    return;
  }

  // CSV mode
  if (!fs.existsSync(inputFile)) {
    console.error(`❌ Input file not found: ${inputFile}`);
    process.exit(1);
  }

  const posts = parseCSV(inputFile);
  console.log(`Mode: CSV batch (${posts.length} posts)\n`);

  const allDescriptions = [];

  for (const post of posts) {
    const shortcode = post.shortcode || post.post_url?.split('/p/')?.[1]?.replace('/', '');
    if (!shortcode) continue;

    const imageUrls = post.image_urls?.split('|') || [];
    console.log(`\n📄 ${shortcode}: ${imageUrls.length} image(s)`);

    const postDescriptions = [];

    for (const [idx, url] of imageUrls.entries()) {
      console.log(`   [${idx + 1}] Analyzing...`);
      
      try {
        const description = await descriptor.describe(url);
        postDescriptions.push({
          url,
          index: idx,
          ...description
        });

        // Save individual description
        const safeShortcode = shortcode.replace(/[^a-zA-Z0-9]/g, '_');
        const descPath = path.join(outputDir, `${safeShortcode}_img${idx}.json`);
        fs.writeFileSync(descPath, JSON.stringify(description, null, 2));
        
        // Print summary
        const meta = description.meta || {};
        const subject = description.subject || {};
        console.log(`      ✅ Quality: ${meta.quality || 'N/A'}`);
        console.log(`         Scene: ${description.scene?.location || 'N/A'}`);
        console.log(`         Action: ${subject.action || 'N/A'}`);
        
      } catch (e) {
        console.log(`      ❌ Error: ${e.message}`);
        postDescriptions.push({ url, index: idx, error: e.message });
      }
    }

    allDescriptions.push({
      shortcode,
      postUrl: post.post_url,
      caption: post.caption,
      images: postDescriptions
    });

    // Save combined post descriptions
    const postDescPath = path.join(outputDir, `${shortcode}_all.json`);
    fs.writeFileSync(postDescPath, JSON.stringify({
      shortcode,
      postUrl: post.post_url,
      caption: post.caption,
      images: postDescriptions,
      timestamp: new Date().toISOString()
    }, null, 2));

    // Delay between posts
    if (posts.indexOf(post) < posts.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Save master file with all descriptions
  const masterPath = path.join(outputDir, 'all_descriptions.json');
  fs.writeFileSync(masterPath, JSON.stringify({
    totalPosts: allDescriptions.length,
    totalImages: allDescriptions.reduce((sum, p) => sum + p.images.length, 0),
    posts: allDescriptions,
    timestamp: new Date().toISOString()
  }, null, 2));

  console.log(`\n${'='.repeat(60)}`);
  console.log('✅ Batch Analysis Complete!');
  console.log(`${'='.repeat(60)}`);
  console.log(`Total posts: ${allDescriptions.length}`);
  console.log(`Total images: ${allDescriptions.reduce((sum, p) => sum + p.images.length, 0)}`);
  console.log(`\nOutput files:`);
  console.log(`  - ${masterPath}`);
  console.log(`  - Individual: ${outputDir}/*_img*.json`);
  console.log(`  - Per post: ${outputDir}/*_all.json\n`);
}
