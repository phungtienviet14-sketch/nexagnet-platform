import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto('http://localhost:3001', { waitUntil: 'networkidle' });

  // Click on "Giải pháp Ngành"
  const indBtn = page.locator('button:has-text("Giải pháp Ngành")');
  await indBtn.click();
  await page.waitForTimeout(400);

  const isMegaOpen = await page.locator('.nav-mega-dropdown').count();
  console.log('Industries mega dropdown count:', isMegaOpen);

  if (isMegaOpen > 0) {
    await page.screenshot({ path: 'tmp/screenshots/navbar-industries-open.png' });
    console.log('Saved tmp/screenshots/navbar-industries-open.png');
  }

  await browser.close();
}

main().catch(console.error);
