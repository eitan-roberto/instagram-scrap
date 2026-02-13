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
    this.allPostLinks = [];
  }

  async init() {
    // Use environment variable or default to false (show browser for manual login)
    const headless = process.env.IG_HEADLESS === 'true';
    
    console.log('🚀 Launching browser with persistent context...');
    console.log(`   User data: ${path.resolve(USER_DATA_DIR)}`);
    console.log(`   Headless mode: ${headless ? 'YES' : 'NO (browser will be visible)'}`);
    
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
      locale: 'en-US',
      timezoneId: 'America/New_York',
    });

    this.page = await this.context.newPage();
    
    await this.page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });

    console.log('✅ Browser ready');
  }

  async checkLoginStatus() {
    console.log('\n🔍 Checking if already logged in...');
    
    try {
      // Try to load Instagram with shorter timeout
      await this.page.goto('https://www.instagram.com/', { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      
      // Wait a bit for page to settle
      await this.page.waitForTimeout(5000);
      
      const currentUrl = this.page.url();
      
      // If we're redirected to login page, not logged in
      if (currentUrl.includes('/accounts/login/')) {
        console.log('   ⚠️  Not logged in. Please login manually.');
        return false;
      }
      
      // Check for home feed indicators
      const isLoggedIn = await this.page.locator('svg[aria-label="Home"], nav a[href="/"], article').first().isVisible().catch(() => false);
      
      if (isLoggedIn) {
        console.log('   ✅ Already logged in!');
        return true;
      }
      
      // Check if we can see the main content
      const hasContent = await this.page.locator('main, article, [data-testid="user-avatar"]').count() > 0;
      if (hasContent && !currentUrl.includes('login')) {
        console.log('   ✅ Already logged in! (detected content)');
        return true;
      }
      
    } catch (error) {
      console.log(`   ⚠️  Timeout checking login, will try to proceed: ${error.message}`);
      // If we got here without being redirected to login, we might be logged in
      const currentUrl = this.page.url();
      if (!currentUrl.includes('/accounts/login/')) {
        console.log('   ✅ Assuming logged in (no redirect to login)');
        return true;
      }
    }
    
    console.log('   ⚠️  Login status unclear - manual login needed');
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
    
    await new Promise(resolve => {
      process.stdin.once('data', () => {
        resolve();
      });
    });
    
    await this.page.waitForTimeout(3000);
    const currentUrl = this.page.url();
    
    if (!currentUrl.includes('/accounts/login/')) {
      console.log('✅ Login detected! Saving session...');
      return true;
    } else {
      console.log('❌ Still on login page. Please try again.');
      return false;
    }
  }

  async collectPostLinks(profileUrl, scrollRounds = 5) {
    console.log(`\n🎯 Loading profile: ${profileUrl}`);
    console.log(`📜 Will scroll ${scrollRounds} times to load posts\n`);
    
    try {
      await this.page.goto(profileUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      
      // Wait for posts to load - Instagram specific selectors
      console.log('   ⏳ Waiting for posts to load...');
      await this.page.waitForTimeout(8000);
      
      // Try to wait for at least one post to appear
      try {
        await this.page.waitForSelector('a[href*="/p/"]', { timeout: 15000 });
      } catch (e) {
        console.log('   ⚠️  Could not find posts with standard selector, trying alternatives...');
      }
      
    } catch (error) {
      console.log(`   ⚠️  Timeout loading profile, trying to continue...`);
      await this.page.waitForTimeout(5000);
    }
    
    const postLinksSet = new Set();
    
    // Scroll multiple times to load all posts
    for (let i = 0; i < scrollRounds; i++) {
      console.log(`📜 Scroll round ${i + 1}/${scrollRounds}`);
      
      // Try multiple selectors to find posts
      let allLinks = [];
      
      // Method 1: Standard Instagram post links
      try {
        const links1 = await this.page.locator('a[href*="/p/"]').all();
        allLinks = [...allLinks, ...links1];
      } catch (e) {}
      
      // Method 2: Links within article elements
      try {
        const links2 = await this.page.locator('article a[href*="/p/"]').all();
        allLinks = [...allLinks, ...links2];
      } catch (e) {}
      
      // Method 3: Any link containing /p/ in href
      try {
        const links3 = await this.page.locator('a[href*="/p/"]').all();
        allLinks = [...allLinks, ...links3];
      } catch (e) {}
      
      // Debug: Show what we found
      if (i === 0) {
        console.log(`   🔍 Looking for posts... found ${allLinks.length} potential links`);
      }
      
      for (const link of allLinks) {
        try {
          const href = await link.getAttribute('href');
          if (href && href.includes('/p/')) {
            // Normalize the URL (remove query params)
            const cleanHref = href.split('?')[0];
            postLinksSet.add(cleanHref);
          }
        } catch (e) {
          // Link might be stale, ignore
        }
      }
      
      console.log(`   Found ${postLinksSet.size} unique posts so far`);
      
      // Scroll down
      await this.page.evaluate(() => {
        window.scrollBy(0, 1000);
      });
      
      // Wait for new content to load
      await this.randomDelay(4000, 6000);
    }
    
    this.allPostLinks = Array.from(postLinksSet);
    console.log(`\n✅ Total posts collected: ${this.allPostLinks.length}`);
    
    // Debug: Take screenshot if no posts found
    if (this.allPostLinks.length === 0) {
      console.log('   ⚠️  No posts found! Taking debug screenshot...');
      await this.page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'no-posts-debug.png'), fullPage: true });
      
      // Try to see what's on the page
      const pageContent = await this.page.content();
      const hasPosts = pageContent.includes('/p/');
      console.log(`   🔍 Page contains '/p/' links: ${hasPosts}`);
      
      // List all links on page for debugging
      const allPageLinks = await this.page.locator('a').all();
      console.log(`   🔍 Total links on page: ${allPageLinks.length}`);
      
      // Show first few links
      let shown = 0;
      for (const link of allPageLinks.slice(0, 10)) {
        try {
          const href = await link.getAttribute('href');
          if (href) {
            console.log(`      Link ${shown + 1}: ${href.substring(0, 80)}`);
            shown++;
          }
        } catch (e) {}
      }
    }
    
    // Scroll back to top
    await this.page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await this.randomDelay(2000, 3000);
  }

  async scrapeAllPosts(maxPosts = null) {
    const postsToScrape = maxPosts ? this.allPostLinks.slice(0, maxPosts) : this.allPostLinks;
    
    console.log(`\n🚀 Starting to scrape ${postsToScrape.length} posts one by one...\n`);
    
    for (let i = 0; i < postsToScrape.length; i++) {
      const postPath = postsToScrape[i];
      const postUrl = `https://www.instagram.com${postPath}`;
      
      console.log(`\n🔄 [${i + 1}/${postsToScrape.length}] Processing: ${postPath}`);
      
      try {
        await this.scrapeSinglePost(postUrl);
        
        // Save progress every 5 posts
        if ((i + 1) % 5 === 0) {
          this.saveCSV('partial');
          console.log(`   💾 Progress saved (${i + 1} posts)`);
        }
        
        // Delay between posts (human-like)
        if (i < postsToScrape.length - 1) {
          const delay = Math.floor(Math.random() * (8000 - 5000 + 1) + 5000);
          console.log(`   ⏱️  Waiting ${delay/1000}s before next post...`);
          await this.page.waitForTimeout(delay);
        }
        
      } catch (error) {
        console.error(`   ❌ Error scraping post: ${error.message}`);
      }
    }
    
    // Save final CSV
    this.saveCSV('instagram-complete');
    console.log(`\n✅ Scraping complete! Total posts: ${this.scrapedData.length}`);
  }

  async scrapeSinglePost(postUrl) {
    // Navigate to post directly
    try {
      await this.page.goto(postUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      
      await this.page.waitForTimeout(3000);
      
    } catch (error) {
      console.log(`   ⚠️  Timeout loading post, trying to continue...`);
      await this.page.waitForTimeout(3000);
    }
    
    await this.randomDelay(2000, 3000);
    
    const data = {
      postUrl: postUrl,
      timestamp: new Date().toISOString(),
      caption: '',
      likes: '',
      date: '',
      imageUrls: [],
    };
    
    // Get caption
    try {
      const captionEl = await this.page.locator('article h1, article span[class*="x1lliihq"]').first();
      data.caption = await captionEl.textContent({ timeout: 5000 }) || '';
      console.log(`   📝 ${data.caption.substring(0, 60)}...`);
    } catch (e) {
      console.log('   📝 (no caption)');
    }
    
    // Get likes
    try {
      const likesEl = await this.page.locator('section span:has-text("likes"), section span:has-text("like")').first();
      data.likes = await likesEl.textContent({ timeout: 3000 }) || '';
      console.log(`   ❤️  ${data.likes}`);
    } catch (e) {
      console.log('   ❤️  (likes hidden)');
    }
    
    // Get date
    try {
      const timeEl = await this.page.locator('time').first();
      data.date = await timeEl.getAttribute('datetime') || '';
      console.log(`   📅 ${data.date}`);
    } catch (e) {
      console.log('   📅 (no date)');
    }
    
    // Get all images - looking for .fna.fbcdn.net URLs ending in .jpg
    console.log('   🖼️  Finding images...');
    
    // Extract all image URLs from the page - filter out profile pictures
    const allImageUrls = await this.page.evaluate(() => {
      const images = [];
      const imgElements = document.querySelectorAll('img');
      imgElements.forEach(img => {
        const src = img.src;
        if (src && 
            src.includes('.fna.fbcdn.net/v/') && 
            src.includes('.jpg') &&
            // Exclude profile pictures (they have /t51.2885-19/ pattern which is smaller)
            !src.includes('/t51.2885-19/') &&
            // Exclude other small formats
            !src.includes('/t51.2885-15/') &&
            // Only include main post formats (large images)
            (src.includes('/t51.82787-') || src.includes('/t51.82785-') || src.includes('scontent'))
           ) {
          images.push(src);
        }
      });
      return images;
    });
    
    // Remove duplicates
    data.imageUrls = [...new Set(allImageUrls)];
    
    // Check if carousel and collect all images
    const hasCarousel = await this.page.locator('button[aria-label="Next"]').isVisible().catch(() => false);
    
    if (hasCarousel) {
      console.log('   🎠 Carousel detected - clicking through...');
      
      let carouselCount = 0;
      while (carouselCount < 10) { // Safety limit
        const nextBtn = this.page.locator('button[aria-label="Next"]').first();
        const isVisible = await nextBtn.isVisible().catch(() => false);
        
        if (!isVisible) break;
        
        // Click next
        await nextBtn.click();
        await this.randomDelay(2000, 3000);
        
        // Get new images - apply same filter
        const newImages = await this.page.evaluate(() => {
          const images = [];
          const imgElements = document.querySelectorAll('img');
          imgElements.forEach(img => {
            const src = img.src;
            if (src && 
                src.includes('.fna.fbcdn.net/v/') && 
                src.includes('.jpg') &&
                !src.includes('/t51.2885-19/') &&
                !src.includes('/t51.2885-15/') &&
                (src.includes('/t51.82787-') || src.includes('/t51.82785-') || src.includes('scontent'))
               ) {
              images.push(src);
            }
          });
          return images;
        });
        
        // Add new unique images
        newImages.forEach(url => {
          if (!data.imageUrls.includes(url)) {
            data.imageUrls.push(url);
          }
        });
        
        carouselCount++;
      }
    }
    
    console.log(`   ✅ ${data.imageUrls.length} image(s) found`);
    data.imageUrls.forEach((url, idx) => {
      console.log(`      ${idx + 1}. ${url.substring(0, 80)}...`);
    });
    
    // Store data
    this.scrapedData.push(data);
  }

  async randomDelay(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1) + min);
    await this.page.waitForTimeout(delay);
  }

  saveCSV(filename) {
    if (this.scrapedData.length === 0) return;
    
    const filepath = path.join(OUTPUT_DIR, `${filename}-${Date.now()}.csv`);
    
    // Create CSV with post URL and all image URLs
    const headers = ['Post_URL', 'Caption', 'Likes', 'Date', 'Image_Count', 'Image_URLs'];
    const rows = this.scrapedData.map(post => [
      post.postUrl,
      `"${post.caption.replace(/"/g, '""').replace(/\n/g, ' ').substring(0, 500)}"`,
      post.likes,
      post.date,
      post.imageUrls.length,
      post.imageUrls.join(' | ')
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    
    fs.writeFileSync(filepath, csv);
    console.log(`   💾 CSV saved: ${filepath}`);
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
    // Get settings from env
    const profileUrl = process.env.IG_TARGET || 'https://www.instagram.com/nasa/';
    const scrollRounds = parseInt(process.env.IG_SCROLL_ROUNDS) || 5;
    const maxPosts = process.env.IG_MAX_POSTS ? parseInt(process.env.IG_MAX_POSTS) : null;
    
    // Initialize (browser will be visible by default for manual login)
    await scraper.init();
    
    // Check/login
    const isLoggedIn = await scraper.checkLoginStatus();
    if (!isLoggedIn) {
      const loggedIn = await scraper.manualLogin();
      if (!loggedIn) {
        console.log('\n❌ Login failed. Exiting.');
        await scraper.close();
        process.exit(1);
      }
    }
    
    // Collect all post links by scrolling
    await scraper.collectPostLinks(profileUrl, scrollRounds);
    
    // Scrape each post one by one
    await scraper.scrapeAllPosts(maxPosts);
    
  } catch (error) {
    console.error('\n💥 Error:', error);
  } finally {
    await scraper.close();
    process.exit(0);
  }
}

main();
