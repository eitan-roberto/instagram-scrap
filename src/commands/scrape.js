import { InstagramScraper } from '../core/scraper.js';
import path from 'path';
import fs from 'fs';

export async function scrapeCommand(flags) {
  const target = flags.target || flags.t;
  const limit = flags.limit ? parseInt(flags.limit) : null;
  const outputDir = flags.output || flags.o || './data';
  const sessionDir = flags.session || flags.s || './user_data';

  if (!target) {
    console.error('❌ Error: --target is required');
    console.log('Usage: ./cli.js scrape -t <username>');
    process.exit(1);
  }

  // Normalize target URL
  let profileUrl = target;
  if (!target.startsWith('http')) {
    profileUrl = `https://www.instagram.com/${target.replace('@', '')}/`;
  }

  const username = new URL(profileUrl).pathname.replace(/\//g, '');

  console.log(`\n🎯 Scraping: ${username}`);
  if (limit) console.log(`📊 Limit: ${limit} posts`);
  console.log(`💾 Output: ${outputDir}`);
  console.log(`🔑 Session: ${sessionDir}\n`);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const scraper = new InstagramScraper(sessionDir);

  try {
    await scraper.init();
    const success = await scraper.scrapeProfile(profileUrl, limit);
    
    if (success && scraper.scrapedData.length > 0) {
      const outputFile = path.join(outputDir, `${username}-scraped.csv`);
      scraper.saveCSV(outputFile);
      console.log(`\n✅ Scraped ${scraper.scrapedData.length} posts to ${outputFile}`);
    } else {
      console.log('\n⚠️ No posts scraped');
    }
  } finally {
    await scraper.close();
  }
}
