import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// Configuration
const USER_DATA_DIR = './user_data';
const SCREENSHOTS_DIR = './screenshots';
const OUTPUT_DIR = './data';

// Ensure directories exist
[USER_DATA_DIR, SCREENSHOTS_DIR, OUTPUT_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

class InstagramHumanScraper {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.scrapedData = [];
  }

  async init(headless = false) {
    console.log('🚀 Launching browser with persistent context...');
    console.log(`   User data: ${path.resolve(USER_DATA_DIR)}`);
    
    // Launch with persistent context - this saves cookies, localStorage, etc.
    this.context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless,
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1280,720'
      ],
      // Make it look more like a real browser
      locale: 'en-US',
      timezoneId: 'America/New_York',
      permissions: ['notifications'],
    });

    this.page = await this.context.newPage();
    
    // Set extra headers
    await this.page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });

    console.log('✅ Browser ready');
  }

  async checkLoginStatus() {
    console.log('\n🔍 Checking if already logged in...');
    
    await this.page.goto('https://www.instagram.com/', { 
      waitUntil: 'networkidle',
      timeout: 60000 
    });
    
    // Wait a bit for page to settle
    await this.randomDelay(3000, 5000);
    
    // Check if we're on the login page or home feed
    const currentUrl = this.page.url();
    
    if (currentUrl.includes('/accounts/login/')) {
      console.log('   ⚠️  Not logged in. Please login manually.');
      return false;
    }
    
    // Check for home feed indicators
    const isLoggedIn = await this.page.locator('svg[aria-label="Home"], nav a[href="/"]').first().isVisible().catch(() => false);
    
    if (isLoggedIn) {
      console.log('   ✅ Already logged in!');
      return true;
    }
    
    console.log('   ⚠️  Login status unclear. Taking screenshot...');
    await this.page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'login-status.png') });
    return false;
  }

  async manualLogin() {
    console.log('\n👤 MANUAL LOGIN REQUIRED');
    console.log('========================');
    console.log('1. A browser window will open');
    console.log('2. Login to Instagram manually');
    console.log('3. Once logged in, press ENTER in this terminal');
    console.log('4. Your session will be saved for future runs\n');
    
    await this.page.goto('https://www.instagram.com/accounts/login/', {
      waitUntil: 'networkidle',
      timeout: 60000
    });
    
    console.log('🌐 Browser opened. Please login now...\n');
    
    // Wait for user to press enter
    await new Promise(resolve => {
      process.stdin.once('data', () => {
        resolve();
      });
    });
    
    // Check if login was successful
    await this.page.waitForTimeout(3000);
    const currentUrl = this.page.url();
    
    if (!currentUrl.includes('/accounts/login/')) {
      console.log('✅ Login detected! Saving session...');
      await this.page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'logged-in.png') });
      return true;
    } else {
      console.log('❌ Still on login page. Please try again.');
      return false;
    }
  }

  async scrapeProfile(profileUrl, maxPhotos = 50) {
    console.log(`\n🎯 Scraping: ${profileUrl}`);
    console.log(`📸 Max photos: ${maxPhotos}`);
    
    // Navigate to profile
    await this.page.goto(profileUrl, { 
      waitUntil: 'networkidle',
      timeout: 60000 
    });
    
    await this.randomDelay(3000, 5000);
    
    // Check if profile loaded
    const postsCount = await this.page.locator('article a[href*="/p/"]').count();
    console.log(`   Found ${postsCount} posts on page`);
    
    if (postsCount === 0) {
      console.log('   ⚠️  No posts found. Taking screenshot...');
      await this.page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'no-posts.png') });
      return;
    }
    
    // Scroll to load more posts
    console.log('\n📜 Scrolling to load posts...');
    await this.naturalScroll();
    
    // Get all post links
    const postLinks = await this.page.locator('article a[href*="/p/"]').all();
    console.log(`   Total posts found: ${postLinks.length}`);
    
    // Limit to maxPhotos
    const postsToScrape = postLinks.slice(0, maxPhotos);
    
    // Scrape each post
    for (let i = 0; i < postsToScrape.length; i++) {
      console.log(`\n🔄 Processing photo ${i + 1}/${postsToScrape.length}`);
      
      try {
        await this.scrapePost(postsToScrape[i]);
        
        // Save progress every 5 posts
        if ((i + 1) % 5 === 0) {
          this.saveCSV('partial');
        }
        
        // Long delay between posts (human-like)
        if (i < postsToScrape.length - 1) {
          await this.randomDelay(5000, 10000);
        }
        
      } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
      }
    }
    
    // Save final CSV
    this.saveCSV('instagram-scraped');
    console.log('\n✅ Scraping complete!');
  }

  async scrapePost(postElement) {
    // Click on post (like a human would)
    console.log('   👆 Clicking post...');
    await postElement.click();
    
    // Wait for modal to open
    await this.randomDelay(3000, 5000);
    
    // Get post URL
    const postUrl = this.page.url();
    console.log(`   🔗 ${postUrl}`);
    
    // Extract data
    const data = {
      url: postUrl,
      timestamp: new Date().toISOString(),
      caption: '',
      likes: '',
      date: '',
      imageUrls: [],
    };
    
    // Get caption
    try {
      const captionEl = await this.page.locator('article[role="presentation"] h1, article[role="presentation"] span').first();
      data.caption = await captionEl.textContent({ timeout: 5000 }) || '';
      console.log(`   📝 ${data.caption.substring(0, 60)}...`);
    } catch (e) {
      console.log('   📝 (no caption)');
    }
    
    // Get likes
    try {
      const likesEl = await this.page.locator('article section span:has-text("likes")').first();
      data.likes = await likesEl.textContent({ timeout: 3000 }) || '';
      console.log(`   ❤️  ${data.likes}`);
    } catch (e) {
      console.log('   ❤️  (likes hidden)');
    }
    
    // Get date
    try {
      const timeEl = await this.page.locator('article time').first();
      data.date = await timeEl.getAttribute('datetime') || '';
      console.log(`   📅 ${data.date}`);
    } catch (e) {
      console.log('   📅 (no date)');
    }
    
    // Get all images (handle carousels)
    console.log('   🖼️  Finding images...');
    
    // Check if carousel (multiple images)
    const hasCarousel = await this.page.locator('button[aria-label="Next"]').isVisible().catch(() => false);
    
    if (hasCarousel) {
      console.log('   🎠 Carousel detected');
      
      // Get all carousel images
      while (true) {
        const imgUrl = await this.getCurrentImageUrl();
        if (imgUrl && !data.imageUrls.includes(imgUrl)) {
          data.imageUrls.push(imgUrl);
          console.log(`      Image ${data.imageUrls.length}: ${imgUrl.substring(0, 60)}...`);
        }
        
        // Check for next button
        const nextBtn = this.page.locator('button[aria-label="Next"]').first();
        const isVisible = await nextBtn.isVisible().catch(() => false);
        
        if (!isVisible) break;
        
        // Click next
        await nextBtn.click();
        await this.randomDelay(2000, 3000);
      }
    } else {
      // Single image
      const imgUrl = await this.getCurrentImageUrl();
      if (imgUrl) {
        data.imageUrls.push(imgUrl);
        console.log(`      ${imgUrl.substring(0, 60)}...`);
      }
    }
    
    console.log(`   ✅ ${data.imageUrls.length} image(s) found`);
    
    // Store data
    this.scrapedData.push(data);
    
    // Close modal (press Escape)
    await this.page.keyboard.press('Escape');
    await this.randomDelay(2000, 3000);
  }

  async getCurrentImageUrl() {
    try {
      // Try to get full-resolution image
      const img = await this.page.locator('article[role="presentation"] img[src*="instagram"]').first();
      const src = await img.getAttribute('src');
      return src;
    } catch (e) {
      return null;
    }
  }

  async naturalScroll() {
    // Scroll down slowly like a human
    for (let i = 0; i < 3; i++) {
      await this.page.evaluate(() => {
        window.scrollBy(0, 800);
      });
      await this.randomDelay(1500, 3000);
    }
    
    // Scroll back up a bit (humans do this)
    await this.page.evaluate(() => {
      window.scrollBy(0, -200);
    });
    await this.randomDelay(1000, 2000);
  }

  async randomDelay(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1) + min);
    await this.page.waitForTimeout(delay);
  }

  saveCSV(filename) {
    if (this.scrapedData.length === 0) return;
    
    const filepath = path.join(OUTPUT_DIR, `${filename}-${Date.now()}.csv`);
    
    // Create CSV content
    const headers = ['URL', 'Caption', 'Likes', 'Date', 'Image_URLs'];
    const rows = this.scrapedData.map(post => [
      post.url,
      `"${post.caption.replace(/"/g, '""').substring(0, 500)}"`,
      post.likes,
      post.date,
      post.imageUrls.join(', ')
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    
    fs.writeFileSync(filepath, csv);
    console.log(`\n💾 Saved ${this.scrapedData.length} posts to: ${filepath}`);
  }

  async close() {
    if (this.context) {
      await this.context.close();
      console.log('\n🔒 Browser closed');
      console.log(`📁 Session saved to: ${path.resolve(USER_DATA_DIR)}`);
    }
  }
}

// Main
async function main() {
  const scraper = new InstagramHumanScraper();
  
  try {
    // Get profile URL from env or use default
    const profileUrl = process.env.IG_TARGET || 'https://www.instagram.com/nasa/';
    const maxPhotos = parseInt(process.env.IG_MAX_PHOTOS) || 20;
    
    // Initialize (headed mode for first time)
    await scraper.init(false);
    
    // Check if logged in
    const isLoggedIn = await scraper.checkLoginStatus();
    
    if (!isLoggedIn) {
      const loggedIn = await scraper.manualLogin();
      if (!loggedIn) {
        console.log('\n❌ Login failed. Exiting.');
        await scraper.close();
        process.exit(1);
      }
    }
    
    // Scrape profile
    await scraper.scrapeProfile(profileUrl, maxPhotos);
    
  } catch (error) {
    console.error('\n💥 Error:', error);
  } finally {
    await scraper.close();
    process.exit(0);
  }
}

main();
