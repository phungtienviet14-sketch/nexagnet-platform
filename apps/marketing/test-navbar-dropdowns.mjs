import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto('http://localhost:3001', { waitUntil: 'networkidle' });

  // 1. Click on "Quản trị Phòng ban"
  const deptBtn = page.locator('button:has-text("Quản trị Phòng ban")');
  await deptBtn.click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'tmp/screenshots/navbar-departments-open.png' });
  console.log('Saved: tmp/screenshots/navbar-departments-open.png');

  // 2. Click on "Giải pháp Ngành"
  const indBtn = page.locator('button:has-text("Giải pháp Ngành")');
  await indBtn.click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'tmp/screenshots/navbar-industries-open.png' });
  console.log('Saved: tmp/screenshots/navbar-industries-open.png');

  await browser.close();
}

main().catch(console.error);
