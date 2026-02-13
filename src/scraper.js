import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createObjectCsvWriter } from 'csv-writer';
import fs from 'fs';
import path from 'path';

// Add stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

// Configuration
const CONFIG = {
  // Docker-compatible Chromium args (REQUIRED for sandbox environments)
  browserArgs: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    '--window-size=1920,1080'
  ],
  headless: false, // Set to true for production
  slowMo: 50, // Slow down operations (ms) - helps with stability
  timeout: 30000, // 30 second timeout
};

// Instagram selectors (may need updating as IG changes)
const SELECTORS = {
  login: {
    username: 'input[name="username"]',
    password: 'input[name="password"]',
    submit: 'button[type="submit"]',
    notNowButton: 'button:has-text("Not Now")',
    saveInfoButton: 'button:has-text("Save Info")',
    turnOffNotifications: 'button:has-text("Turn Off")'
  },
  profile: {
    posts: 'article a[href*="/p/"]',
    postImage: 'img[style*="object-fit: cover"]',
    nextButton: 'button[aria-label="Next"]',
    closeButton: 'button[aria-label="Close"]',
    postCaption: 'div[role="dialog"] article span',
    postLikes: 'div[role="dialog"] article span:has-text(" likes")',
    postDate: 'time',
    postUrl: 'article a[href*="/p/"]'
  }
};

class InstagramScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.data = [];
    this.outputDir = './data';
    
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async init() {
    console.log('🚀 Launching browser with Docker-compatible settings...');
    
    this.browser = await puppeteer.launch({
      headless: CONFIG.headless,
      slowMo: CONFIG.slowMo,
      args: CONFIG.browserArgs,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
    });

    this.page = await this.browser.newPage();
    
    // Set viewport
    await this.page.setViewport({ width: 1920, height: 1080 });
    
    // Set user agent
    await this.page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    console.log('✅ Browser initialized');
  }

  async login(username, password) {
    console.log('🔐 Logging into Instagram...');
    
    try {
      // Navigate to login page
      await this.page.goto('https://www.instagram.com/accounts/login/', {
        waitUntil: 'networkidle2',
        timeout: CONFIG.timeout
      });

      // Wait for login form
      await this.page.waitForSelector(SELECTORS.login.username, { timeout: 10000 });
      
      // Type credentials
      await this.page.type(SELECTORS.login.username, username, { delay: 100 });
      await this.page.type(SELECTORS.login.password, password, { delay: 100 });
      
      // Click submit
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2' }),
        this.page.click(SELECTORS.login.submit)
      ]);

      // Handle "Save Info" popup
      try {
        await this.page.waitForSelector(SELECTORS.login.saveInfoButton, { timeout: 5000 });
        await this.page.click(SELECTORS.login.saveInfoButton);
        console.log('✅ Clicked "Save Info"');
      } catch (e) {
        console.log('ℹ️ No "Save Info" popup');
      }

      // Handle "Turn On Notifications" popup
      try {
        await this.page.waitForSelector(SELECTORS.login.turnOffNotifications, { timeout: 5000 });
        await this.page.click(SELECTORS.login.turnOffNotifications);
        console.log('✅ Turned off notifications');
      } catch (e) {
        console.log('ℹ️ No notifications popup');
      }

      console.log('✅ Successfully logged in');
      return true;

    } catch (error) {
      console.error('❌ Login failed:', error.message);
      await this.takeScreenshot('login-error.png');
      return false;
    }
  }

  async scrapeProfile(profileUrl, maxPosts = 50) {
    console.log(`🎯 Scraping profile: ${profileUrl}`);
    console.log(`📊 Max posts to scrape: ${maxPosts}`);
    
    try {
      // Navigate to profile
      await this.page.goto(profileUrl, {
        waitUntil: 'networkidle2',
        timeout: CONFIG.timeout
      });

      // Wait for posts to load
      await this.page.waitForSelector(SELECTORS.profile.posts, { timeout: 10000 });
      
      // Scroll to load more posts
      console.log('📜 Scrolling to load posts...');
      await this.autoScroll(3);

      // Get all post links
      const postLinks = await this.page.evaluate((selector) => {
        const links = document.querySelectorAll(selector);
        return Array.from(links).map(link => ({
          url: link.href,
          thumbnail: link.querySelector('img')?.src || null
        }));
      }, SELECTORS.profile.posts);

      console.log(`📸 Found ${postLinks.length} posts`);
      
      // Limit to maxPosts
      const postsToScrape = postLinks.slice(0, maxPosts);
      
      // Scrape each post
      for (let i = 0; i < postsToScrape.length; i++) {
        const post = postsToScrape[i];
        console.log(`\n🔄 Processing post ${i + 1}/${postsToScrape.length}`);
        
        try {
          const postData = await this.scrapePost(post.url);
          this.data.push(postData);
          
          // Save progress every 5 posts
          if ((i + 1) % 5 === 0) {
            await this.saveCsv('partial');
          }
          
        } catch (error) {
          console.error(`❌ Error scraping post ${i + 1}:`, error.message);
          // Continue with next post
        }
        
        // Random delay to avoid rate limiting
        await this.randomDelay(2000, 4000);
      }

      console.log(`\n✅ Scraped ${this.data.length} posts successfully`);
      return true;

    } catch (error) {
      console.error('❌ Profile scraping failed:', error.message);
      await this.takeScreenshot('profile-error.png');
      return false;
    }
  }

  async scrapePost(postUrl) {
    console.log(`  🔗 Opening: ${postUrl}`);
    
    // Click on post to open modal
    const postSelector = `a[href="${postUrl.replace('https://www.instagram.com', '')}"]`;
    
    try {
      await this.page.click(postSelector);
    } catch (e) {
      // If click fails, navigate directly
      await this.page.goto(postUrl, { waitUntil: 'networkidle2' });
    }

    // Wait for modal to open
    await this.page.waitForTimeout(2000);
    
    // Extract post data
    const postData = await this.page.evaluate(() => {
      const data = {
        url: window.location.href,
        caption: '',
        likes: '',
        date: '',
        images: [],
        videos: []
      };

      // Get caption
      const captionElement = document.querySelector('article div[role="presentation"] span');
      if (captionElement) {
        data.caption = captionElement.textContent || '';
      }

      // Get likes
      const likesElement = document.querySelector('article span:contains("likes")');
      if (likesElement) {
        data.likes = likesElement.textContent || '';
      }

      // Get date
      const timeElement = document.querySelector('time');
      if (timeElement) {
        data.date = timeElement.getAttribute('datetime') || timeElement.textContent || '';
      }

      // Get all images in post (carousel support)
      const images = document.querySelectorAll('article img[src*="instagram"]:not([alt*="profile"])');
      images.forEach(img => {
        if (img.src && !data.images.includes(img.src)) {
          data.images.push(img.src);
        }
      });

      // Get videos if any
      const videos = document.querySelectorAll('article video');
      videos.forEach(video => {
        if (video.src) {
          data.videos.push(video.src);
        }
      });

      return data;
    });

    postData.url = postUrl;
    
    console.log(`  📝 Caption: ${postData.caption.substring(0, 50)}...`);
    console.log(`  🖼️  Images: ${postData.images.length}`);
    
    // Close modal if open
    try {
      const closeButton = await this.page.$('button[aria-label="Close"]');
      if (closeButton) {
        await closeButton.click();
        await this.page.waitForTimeout(1000);
      }
    } catch (e) {
      // Modal might not be open
    }

    return postData;
  }

  async autoScroll(maxScrolls = 3) {
    await this.page.evaluate(async (maxScrolls) => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        let scrolls = 0;
        const distance = 300;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          scrolls++;

          if (totalHeight >= scrollHeight || scrolls >= maxScrolls) {
            clearInterval(timer);
            resolve(true);
          }
        }, 1000);
      });
    }, maxScrolls);
  }

  async randomDelay(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1) + min);
    await this.page.waitForTimeout(delay);
  }

  async saveCsv(prefix = 'instagram') {
    if (this.data.length === 0) {
      console.log('⚠️ No data to save');
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${prefix}-${timestamp}.csv`;
    const filepath = path.join(this.outputDir, filename);

    const csvWriter = createObjectCsvWriter({
      path: filepath,
      header: [
        { id: 'url', title: 'POST_URL' },
        { id: 'caption', title: 'CAPTION' },
        { id: 'likes', title: 'LIKES' },
        { id: 'date', title: 'DATE' },
        { id: 'images', title: 'IMAGE_URLS' },
        { id: 'videos', title: 'VIDEO_URLS' }
      ]
    });

    // Flatten data for CSV
    const records = this.data.map(post => ({
      url: post.url,
      caption: post.caption.replace(/\n/g, ' ').substring(0, 500),
      likes: post.likes,
      date: post.date,
      images: post.images.join(', '),
      videos: post.videos.join(', ')
    }));

    await csvWriter.writeRecords(records);
    console.log(`💾 Saved ${records.length} records to: ${filepath}`);
  }

  async takeScreenshot(filename) {
    const filepath = path.join('./logs', filename);
    if (!fs.existsSync('./logs')) {
      fs.mkdirSync('./logs', { recursive: true });
    }
    await this.page.screenshot({ path: filepath, fullPage: true });
    console.log(`📸 Screenshot saved: ${filepath}`);
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('🔒 Browser closed');
    }
  }
}

// Main execution
async function main() {
  const scraper = new InstagramScraper();
  
  try {
    // Get credentials from environment or prompt
    const username = process.env.IG_USERNAME || 'your_username';
    const password = process.env.IG_PASSWORD || 'your_password';
    const targetProfile = process.env.IG_TARGET || 'https://www.instagram.com/target_profile/';
    const maxPosts = parseInt(process.env.IG_MAX_POSTS) || 20;

    if (username === 'your_username' || password === 'your_password') {
      console.error('❌ Please set IG_USERNAME and IG_PASSWORD environment variables');
      console.log('   Example: IG_USERNAME=myuser IG_PASSWORD=mypass node src/scraper.js');
      process.exit(1);
    }

    // Initialize
    await scraper.init();
    
    // Login
    const loggedIn = await scraper.login(username, password);
    if (!loggedIn) {
      console.error('❌ Failed to login');
      process.exit(1);
    }

    // Scrape profile
    const scraped = await scraper.scrapeProfile(targetProfile, maxPosts);
    if (!scraped) {
      console.error('❌ Failed to scrape profile');
      process.exit(1);
    }

    // Save final CSV
    await scraper.saveCsv('instagram-full');
    
    console.log('\n✅ Scraping complete!');
    console.log(`📁 Data saved to: ${scraper.outputDir}/`);

  } catch (error) {
    console.error('💥 Fatal error:', error);
  } finally {
    await scraper.close();
  }
}

// Run if called directly
if (process.argv[1].includes('scraper.js')) {
  main();
}

export { InstagramScraper };
