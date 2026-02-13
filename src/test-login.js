import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import dotenv from 'dotenv';
import fs from 'fs';

// Load .env
dotenv.config();

// Use stealth plugin with advanced evasion
const stealth = StealthPlugin();
stealth.enabledEvasions.delete('chrome.runtime'); // Better for Instagram
puppeteer.use(stealth);

// Docker-compatible browser args
const browserArgs = [
  '--no-sandbox',
  '--disable-setuid-sandbox', 
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-web-security',
  '--disable-features=IsolateOrigins,site-per-process',
  '--window-size=1920,1080',
  '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

async function testLogin() {
  console.log('🧪 Testing Instagram login with enhanced stealth...\n');
  
  // Ensure logs directory exists
  if (!fs.existsSync('./logs')) {
    fs.mkdirSync('./logs', { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    slowMo: 100,
    args: browserArgs
  });

  const page = await browser.newPage();
  
  // Set extra headers to appear more like a real browser
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Referer': 'https://www.google.com/'
  });

  await page.setViewport({ width: 1920, height: 1080 });

  try {
    console.log('1️⃣ Opening Instagram (with delay)...');
    
    // First, visit a neutral site to set cookies
    await page.goto('https://www.google.com', { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Now visit Instagram
    await page.goto('https://www.instagram.com/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log('2️⃣ Checking page status...');
    await page.waitForTimeout(3000);
    
    // Check if we got rate limited
    const currentUrl = page.url();
    const pageContent = await page.content();
    
    if (pageContent.includes('429') || pageContent.includes('error') || pageContent.includes('working')) {
      console.log('   ⚠️ Rate limited or blocked');
      console.log('   URL:', currentUrl);
      await page.screenshot({ path: './logs/blocked.png', fullPage: true });
      console.log('   📸 Saved: logs/blocked.png');
      console.log('\n💡 Instagram detected automation. Try:');
      console.log('   - Waiting a few minutes');
      console.log('   - Using a different IP/proxy');
      console.log('   - Using an existing logged-in session');
      await browser.close();
      return;
    }

    console.log('   ✅ Page loaded successfully');
    await page.screenshot({ path: './logs/page-loaded.png' });

    // Look for login link/button
    console.log('3️⃣ Looking for login link...');
    
    const loginLink = await page.$('a[href="/accounts/login/"]');
    if (loginLink) {
      console.log('   ✅ Found login link, clicking...');
      await loginLink.click();
      await page.waitForTimeout(3000);
    }

    // Wait for login form
    console.log('4️⃣ Waiting for login form...');
    await page.waitForSelector('input[name="username"]', { timeout: 15000 });
    console.log('   ✅ Login form found');

    const username = process.env.IG_USERNAME;
    const password = process.env.IG_PASSWORD;

    if (!username || !password) {
      console.error('❌ Missing credentials');
      await browser.close();
      return;
    }

    console.log(`5️⃣ Typing credentials...`);
    await page.type('input[name="username"]', username, { delay: 150 });
    await page.type('input[name="password"]', password, { delay: 150 });
    console.log('   ✅ Credentials entered');

    console.log('6️⃣ Submitting login...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
      page.click('button[type="submit"]')
    ]);
    
    console.log('7️⃣ Waiting for result...');
    await page.waitForTimeout(8000);

    const finalUrl = page.url();
    console.log(`   Final URL: ${finalUrl}`);

    // Check for various outcomes
    const content = await page.content();
    
    if (content.includes('suspicious') || content.includes('unusual')) {
      console.log('   ⚠️ Suspicious login detected');
      await page.screenshot({ path: './logs/suspicious.png', fullPage: true });
    } else if (content.includes('two-factor') || content.includes('2FA') || content.includes('security code')) {
      console.log('   🔐 Two-factor authentication required');
      await page.screenshot({ path: './logs/2fa-required.png', fullPage: true });
    } else if (finalUrl.includes('instagram.com') && !finalUrl.includes('login')) {
      console.log('   ✅ Login successful!');
    } else {
      console.log('   ❌ Login may have failed');
    }

    await page.screenshot({ path: './logs/final-result.png', fullPage: true });
    console.log('   📸 Saved: logs/final-result.png');

    console.log('\n✅ Test complete');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    await page.screenshot({ path: './logs/test-error.png', fullPage: true });
  } finally {
    await browser.close();
    console.log('🔒 Browser closed');
  }
}

testLogin();
