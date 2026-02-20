#!/usr/bin/env node
/**
 * Instagram Login - Manual login to save session
 * Usage: node login.js
 * 
 * This will open a browser window. Login to Instagram manually,
 * then press ENTER in the terminal to save the session.
 */

import { chromium } from 'playwright';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🔐 Instagram Login');
console.log('='.repeat(50));
console.log('\n1. A browser window will open');
console.log('2. Login to Instagram manually');
console.log('3. Complete 2FA if required');
console.log('4. Wait until you see your feed');
console.log('5. Come back here and press ENTER');
console.log('\nPress ENTER to start...');

rl.question('', async () => {
  console.log('\n🚀 Opening browser...');
  
  const context = await chromium.launchPersistentContext('./user_data', {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await context.newPage();
  
  console.log('📱 Navigating to Instagram...');
  await page.goto('https://www.instagram.com/accounts/login/', {
    waitUntil: 'networkidle',
    timeout: 60000
  });
  
  console.log('\n✅ Browser opened!');
  console.log('📝 Please login to Instagram...');
  console.log('⏳ Waiting for you to complete login...\n');
  
  // Wait for login to complete (check for feed or profile link)
  let loggedIn = false;
  let attempts = 0;
  const maxAttempts = 300; // 5 minutes max
  
  while (!loggedIn && attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 1000));
    
    const url = page.url();
    if (!url.includes('/accounts/login/') && !url.includes('/login/')) {
      // Check if we're on feed or profile
      if (url.includes('instagram.com/')) {
        loggedIn = true;
        break;
      }
    }
    attempts++;
    
    if (attempts % 30 === 0) {
      console.log(`⏳ Still waiting... (${attempts}s)`);
    }
  }
  
  if (loggedIn) {
    console.log('\n✅ Login detected!');
    console.log(`📍 Current URL: ${page.url()}`);
    
    // Wait a bit more to ensure cookies are saved
    await new Promise(r => setTimeout(r, 3000));
    
    await context.close();
    
    console.log('\n🎉 Session saved!');
    console.log('📁 Session stored in: user_data/');
    console.log('\n👉 Send me confirmation that you logged in');
    console.log('   Then I can start scraping the profiles!');
    
  } else {
    console.log('\n⏱️  Timeout waiting for login');
    console.log('❌ Please try again');
    await context.close();
  }
  
  rl.close();
  process.exit(0);
});
