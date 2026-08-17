import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto('http://localhost:3001', { waitUntil: 'networkidle' });

  const btn = page.locator('button:has-text("Quản trị Phòng ban")');
  console.log('Button found:', await btn.count());
  
  // Hover
  await btn.hover();
  await page.waitForTimeout(200);
  
  const dropdownVisible = await page.locator('.nav-mega-dropdown').isVisible();
  console.log('Dropdown visible on hover:', dropdownVisible);

  if (dropdownVisible) {
    const box = await page.locator('.nav-mega-dropdown').boundingBox();
    console.log('Dropdown bounding box:', box);
  }

  await page.screenshot({ path: 'tmp/screenshots/test-hover.png' });
  console.log('Saved tmp/screenshots/test-hover.png');

  await browser.close();
}

main().catch(console.error);
