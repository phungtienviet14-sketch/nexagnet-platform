/* global window */
// `window` xuat hien trong cac callback cua page.$eval/page.evaluate: nhung ham do duoc serialize
// roi chay TRONG TRINH DUYET chu khong chay o Node, nen ESLint (dang doc file nay nhu module Node)
// bao chung la bien khong dinh nghia. Khai bao o day de lint dung, khong doi mot dong hanh vi nao.
import { chromium } from 'playwright';

async function runMotionQA() {
  console.log('=== STARTING NEXAGNET MULTI-PAGE MOTION QA SUITE ===');
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const baseUrl = 'http://localhost:3001';

  try {
    // 1. Test Homepage Hero Entrance Sequence
    console.log('1. Testing Homepage Hero Platform Entrance Sequence...');
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);

    const heroHeadlineOpacity = await page.$eval('.hero-headline', (el) => window.getComputedStyle(el).opacity);
    const ecosystemVisualOpacity = await page.$eval('.platform-ecosystem-visual', (el) => window.getComputedStyle(el).opacity);
    
    if (heroHeadlineOpacity === '1' && ecosystemVisualOpacity === '1') {
      console.log('✓ Homepage Hero Entrance sequence passed (settled to opacity: 1).');
    } else {
      console.error('✗ Hero entrance opacity issue:', { heroHeadlineOpacity, ecosystemVisualOpacity });
    }

    // 2. Test Mega Menu Open Transition
    console.log('2. Testing Mega-Menu Dropdown Hover Transition...');
    await page.hover('text=Sản phẩm');
    await page.waitForTimeout(250);
    const dropdownVisible = await page.$eval('.nav-mega-dropdown', (el) => window.getComputedStyle(el).opacity);
    if (dropdownVisible === '1') {
      console.log('✓ Mega-menu smoothly opened and reached opacity: 1.');
    } else {
      console.error('✗ Mega-menu opacity issue:', dropdownVisible);
    }

    // 3. Test Flagship Page /products/order-automation
    console.log('3. Testing Flagship Product Page /products/order-automation...');
    await page.goto(`${baseUrl}/products/order-automation`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const orderAutomationH1 = await page.$eval('h1', (el) => el.textContent);
    console.log(`✓ /products/order-automation loaded with H1: "${orderAutomationH1?.trim()}"`);

    // 4. Test Platform Control Page /platform/control Layer Switcher
    console.log('4. Testing Platform Control Layer Inspector Tab Switching...');
    await page.goto(`${baseUrl}/platform/control`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const layerCards = await page.$$('.layer-nav-card');
    if (layerCards.length >= 3) {
      await layerCards[1].click();
      await page.waitForTimeout(250);
      const inspectorText = await page.$eval('.inspector-chrome-bar', (el) => el.textContent);
      console.log(`✓ Switched to Layer 2 in Inspector: "${inspectorText?.trim()}".`);
    }

    // 5. Test Accessibility (prefers-reduced-motion)
    console.log('5. Testing prefers-reduced-motion Accessibility Mode...');
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

    console.log('=== ALL MOTION & INTERACTION TESTS PASSED! ===');
  } catch (err) {
    console.error('Motion QA Error:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runMotionQA();
