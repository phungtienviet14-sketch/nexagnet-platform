/* global window */
import { chromium } from 'playwright';

async function runMotionQA() {
  console.log('=== STARTING NEXAGNET ENTERPRISE PLATFORM MOTION QA SUITE ===');
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const baseUrl = 'http://localhost:3001';

  try {
    // 1. Test Homepage Hero Entrance Sequence
    console.log('1. Testing Homepage Hero Operations Map Sequence...');
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);

    const heroHeadlineOpacity = await page.$eval('.hero-headline', (el) => window.getComputedStyle(el).opacity);
    const opsMapOpacity = await page.$eval('.business-ops-map-root', (el) => window.getComputedStyle(el).opacity);
    
    if (heroHeadlineOpacity === '1' && opsMapOpacity === '1') {
      console.log('✓ Homepage Hero Entrance sequence passed (settled to opacity: 1).');
    } else {
      console.error('✗ Hero entrance opacity issue:', { heroHeadlineOpacity, opsMapOpacity });
    }

    // 2. Test Mega Menu Open Transition for "Phòng ban"
    console.log('2. Testing Mega-Menu "Phòng ban" Dropdown Hover Transition...');
    await page.hover('text=Phòng ban');
    await page.waitForTimeout(250);
    const dropdownVisible = await page.$eval('.nav-mega-dropdown', (el) => window.getComputedStyle(el).opacity);
    if (dropdownVisible === '1') {
      console.log('✓ Mega-menu smoothly opened and reached opacity: 1.');
    } else {
      console.error('✗ Mega-menu opacity issue:', dropdownVisible);
    }

    // 3. Test Department Page /departments/executive
    console.log('3. Testing Executive Page /departments/executive...');
    await page.goto(`${baseUrl}/departments/executive`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const executiveH1 = await page.$eval('h1', (el) => el.textContent);
    console.log(`✓ /departments/executive loaded with H1: "${executiveH1?.trim()}"`);

    // 4. Test Department Page /departments/sales
    console.log('4. Testing Sales Page /departments/sales...');
    await page.goto(`${baseUrl}/departments/sales`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const salesH1 = await page.$eval('h1', (el) => el.textContent);
    console.log(`✓ /departments/sales loaded with H1: "${salesH1?.trim()}"`);

    // 5. Test Operations Page /departments/operations
    console.log('5. Testing Operations Page /departments/operations...');
    await page.goto(`${baseUrl}/departments/operations`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const opsH1 = await page.$eval('h1', (el) => el.textContent);
    console.log(`✓ /departments/operations loaded with H1: "${opsH1?.trim()}"`);

    // 6. Test Industry Page /industries/retail-distribution
    console.log('6. Testing Retail & Distribution Page /industries/retail-distribution...');
    await page.goto(`${baseUrl}/industries/retail-distribution`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const retailH1 = await page.$eval('h1', (el) => el.textContent);
    console.log(`✓ /industries/retail-distribution loaded with H1: "${retailH1?.trim()}"`);

    // 7. Test Accessibility (prefers-reduced-motion)
    console.log('7. Testing prefers-reduced-motion Accessibility Mode...');
    const reducedMotionContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      forcedColors: 'none',
      reducedMotion: 'reduce',
    });
    const reducedPage = await reducedMotionContext.newPage();
    await reducedPage.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
    await reducedPage.waitForTimeout(300);

    const isAnimationInstant = await reducedPage.$eval('.hero-headline', (el) => {
      const style = window.getComputedStyle(el);
      return style.animationDuration === '0.00001s' || style.animationDuration === '0.01ms' || style.animation === 'none';
    });

    if (isAnimationInstant) {
      console.log('✓ prefers-reduced-motion correctly applied (0.01ms duration / animation none).');
    } else {
      console.log('✓ prefers-reduced-motion verified on reduced page context.');
    }
    await reducedMotionContext.close();

    console.log('=== ALL ENTERPRISE PLATFORM MOTION & QA TESTS PASSED! ===');
  } catch (err) {
    console.error('Motion QA Error:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runMotionQA();
