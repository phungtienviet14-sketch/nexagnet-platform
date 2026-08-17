import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('console', (msg) => console.log('BROWSER CONSOLE:', msg.text()));

  await page.goto('http://localhost:3001', { waitUntil: 'networkidle' });

  const navHtml = await page.locator('.desktop-nav').innerHTML();
  console.log('Nav HTML length:', navHtml.length);
  console.log('Contains "Quản trị Phòng ban":', navHtml.includes('Quản trị Phòng ban'));

  // Click on "Quản trị Phòng ban"
  const btn = page.locator('button:has-text("Quản trị Phòng ban")');
  await btn.click();
  await page.waitForTimeout(500);

  const isMegaOpen = await page.locator('.nav-mega-dropdown').count();
  console.log('Mega dropdown count after click:', isMegaOpen);

  if (isMegaOpen > 0) {
    await page.screenshot({ path: 'tmp/screenshots/dropdown-clicked.png' });
    console.log('Saved tmp/screenshots/dropdown-clicked.png');
  }

  await browser.close();
}

main().catch(console.error);
