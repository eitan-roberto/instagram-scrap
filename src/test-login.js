import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

// Docker-compatible browser args
const browserArgs = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--window-size=1920,1080'
];

async function testLogin() {
  console.log('🧪 Testing Instagram login...\n');
  
  const browser = await puppeteer.launch({
    headless: false, // Show browser for testing
    slowMo: 50,
    args: browserArgs
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    console.log('1️⃣ Opening Instagram login page...');
    await page.goto('https://www.instagram.com/accounts/login/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log('2️⃣ Waiting for login form...');
    await page.waitForSelector('input[name="username"]', { timeout: 10000 });
    console.log('   ✅ Login form found');

    const username = process.env.IG_USERNAME || 'TEST_USER';
    const password = process.env.IG_PASSWORD || 'TEST_PASS';

    console.log(`3️⃣ Typing credentials for: ${username}`);
    await page.type('input[name="username"]', username, { delay: 50 });
    await page.type('input[name="password"]', password, { delay: 50 });
    console.log('   ✅ Credentials entered');

    console.log('4️⃣ Clicking login button...');
    await page.click('button[type="submit"]');
    
    console.log('5️⃣ Waiting for navigation...');
    await page.waitForTimeout(5000);

    const currentUrl = page.url();
    console.log(`   Current URL: ${currentUrl}`);

    if (currentUrl.includes('instagram.com/accounts/login')) {
      console.log('   ⚠️ Still on login page - check credentials');
      
      // Check for error message
      const errorText = await page.evaluate(() => {
        const error = document.querySelector('[data-testid="login-error-message"]');
        return error ? error.textContent : null;
      });
      
      if (errorText) {
        console.log(`   ❌ Error: ${errorText}`);
      }
    } else {
      console.log('   ✅ Login successful!');
    }

    console.log('\n6️⃣ Taking screenshot...');
    await page.screenshot({ path: './logs/test-login.png', fullPage: true });
    console.log('   📸 Saved: ./logs/test-login.png');

    console.log('\n✅ Test complete. Browser will stay open for 10 seconds...');
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    await page.screenshot({ path: './logs/test-error.png', fullPage: true });
  } finally {
    await browser.close();
    console.log('🔒 Browser closed');
  }
}

testLogin();
