#!/usr/bin/env node

import { InstagramScraper } from './scraper.js';
import fs from 'fs';

// Simple CLI
const args = process.argv.slice(2);

function showHelp() {
  console.log(`
Instagram Scraper

Usage:
  node index.js [command] [options]

Commands:
  scrape              Scrape a profile (requires env vars)
  test                Test login only
  help                Show this help

Environment Variables:
  IG_USERNAME         Instagram username
  IG_PASSWORD         Instagram password
  IG_TARGET           Target profile URL
  IG_MAX_POSTS        Max posts to scrape (default: 20)

Examples:
  IG_USERNAME=user IG_PASSWORD=pass IG_TARGET=https://instagram.com/nasa node index.js scrape
  node index.js test
`);
}

async function main() {
  const command = args[0] || 'scrape';

  switch (command) {
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;

    case 'test':
      // Import and run test
      await import('./test-login.js');
      break;

    case 'scrape':
    default:
      // Run main scraper
      const scraper = new InstagramScraper();
      
      try {
        const username = process.env.IG_USERNAME;
        const password = process.env.IG_PASSWORD;
        const targetProfile = process.env.IG_TARGET;
        const maxPosts = parseInt(process.env.IG_MAX_POSTS) || 20;

        if (!username || !password) {
          console.error('❌ Error: IG_USERNAME and IG_PASSWORD required');
          console.log('   Set them as environment variables or use:');
          console.log('   IG_USERNAME=user IG_PASSWORD=pass node index.js scrape\n');
          showHelp();
          process.exit(1);
        }

        if (!targetProfile) {
          console.error('❌ Error: IG_TARGET required');
          console.log('   Example: IG_TARGET=https://www.instagram.com/nasa/\n');
          process.exit(1);
        }

        console.log('🚀 Instagram Scraper');
        console.log('===================\n');
        
        await scraper.init();
        
        const loggedIn = await scraper.login(username, password);
        if (!loggedIn) {
          console.error('❌ Login failed');
          process.exit(1);
        }

        const scraped = await scraper.scrapeProfile(targetProfile, maxPosts);
        if (!scraped) {
          console.error('❌ Scraping failed');
          process.exit(1);
        }

        await scraper.saveCsv('instagram-full');
        
        console.log('\n✅ Complete!');

      } catch (error) {
        console.error('💥 Error:', error);
      } finally {
        await scraper.close();
      }
      break;
  }
}

main();
