import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

export class InstagramScraper {
  constructor(sessionDir = './user_data') {
    this.sessionDir = sessionDir;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.scrapedData = [];
  }

  async init(headless = true) {
    console.log('🚀 Launching browser...');
    
    this.context = await chromium.launchPersistentContext(this.sessionDir, {
      headless,
      viewport: { width: 1280, height: 720 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    this.page = await this.context.newPage();
    console.log('✅ Browser ready\n');
  }

  async scrapeProfile(profileUrl, maxPosts = null) {
    console.log(`🌐 Loading profile...`);
    
    try {
      await this.page.goto(profileUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      await this.page.waitForTimeout(3000);
      
      if (this.page.url().includes('/accounts/login/')) {
        console.log('❌ Not logged in! Session may have expired.');
        return false;
      }
    } catch (error) {
      console.log(`⚠️ Profile load warning: ${error.message}`);
    }

    // Collect post links
    console.log('📜 Finding posts...');
    const links = await this.page.locator('a[href*="/p/"]').all();
    const hrefs = await Promise.all(links.map(l => l.getAttribute('href')));
    let postLinks = [...new Set(
      hrefs
        .filter(h => h && h.includes('/p/'))
        .map(h => h.split('?')[0])
    )];

    if (maxPosts) {
      postLinks = postLinks.slice(0, maxPosts);
    }

    console.log(`✅ Found ${postLinks.length} posts\n`);

    if (postLinks.length === 0) {
      return false;
    }

    // Scrape each post
    for (let i = 0; i < postLinks.length; i++) {
      const postUrl = `https://www.instagram.com${postLinks[i]}`;
      console.log(`[${i + 1}/${postLinks.length}] ${postLinks[i]}`);
      
      try {
        await Promise.race([
          this.page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 20000))
        ]);
        
        await this.page.waitForTimeout(2000);
        const data = await this.extractPostData();
        
        if (data.imageUrls.length > 0) {
          data.postUrl = postUrl;
          data.shortcode = postLinks[i].split('/p/')[1]?.replace('/', '');
          this.scrapedData.push(data);
          console.log(`   ✅ ${data.imageUrls.length} image(s)`);
        } else {
          console.log('   ⚠️ No images');
        }
      } catch (e) {
        console.log(`   ❌ Error: ${e.message.substring(0, 50)}`);
      }
      
      if (i < postLinks.length - 1) {
        await this.page.waitForTimeout(3000);
      }
    }

    return this.scrapedData.length > 0;
  }

  async extractPostData() {
    const data = {
      caption: '',
      likes: '',
      date: '',
      imageUrls: [],
      isVideo: false
    };

    try {
      const captionEl = await this.page.locator('article h1, article span[class*="x1lliihq"]').first();
      data.caption = await captionEl.textContent({ timeout: 3000 }) || '';
    } catch (e) {}

    try {
      const likesEl = await this.page.locator('section span:has-text("likes"), section span:has-text("like")').first();
      data.likes = await likesEl.textContent({ timeout: 2000 }) || '';
    } catch (e) {}

    try {
      const timeEl = await this.page.locator('time').first();
      data.date = await timeEl.getAttribute('datetime') || '';
    } catch (e) {}

    try {
      const videoEl = await this.page.locator('video').first();
      data.isVideo = await videoEl.isVisible().catch(() => false);
    } catch (e) {}

    const images = await this.page.evaluate(() => {
      const urls = [];
      document.querySelectorAll('img').forEach(img => {
        const src = img.src;
        if (src && (src.includes('instagram.com') || src.includes('fbcdn.net'))) {
          if (!src.includes('/t51.2885-19/') && !src.includes('s150x150')) {
            urls.push(src);
          }
        }
      });
      return [...new Set(urls)];
    });

    data.imageUrls = images;
    return data;
  }

  saveCSV(outputPath) {
    const headers = ['post_url', 'shortcode', 'caption', 'date', 'likes', 'is_video', 'image_count', 'image_urls'];
    
    const rows = this.scrapedData.map(post => [
      post.postUrl,
      post.shortcode,
      `"${(post.caption || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
      post.date,
      post.likes,
      post.isVideo ? '1' : '0',
      post.imageUrls.length,
      post.imageUrls.join('|')
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    fs.writeFileSync(outputPath, csv);
    console.log(`💾 Saved to: ${outputPath}`);
  }

  async close() {
    if (this.context) {
      await this.context.close();
      console.log('\n🔒 Browser closed');
    }
  }
}
