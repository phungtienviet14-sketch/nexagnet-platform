import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('tmp/audit-screenshots');
fs.mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1280', width: 1280, height: 800 },
  { name: '768', width: 768, height: 1024 },
  { name: '390', width: 390, height: 844, isMobile: true }
];

async function capture() {
  const browser = await chromium.launch();
  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: !!vp.isMobile,
      deviceScaleFactor: vp.isMobile ? 2 : 1
    });
    const page = await context.newPage();
    await page.goto('http://localhost:3001/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    // First viewport
    await page.screenshot({ path: path.join(outDir, `hero-${vp.name}.png`) });
    // Full page
    await page.screenshot({ path: path.join(outDir, `full-${vp.name}.png`), fullPage: true });
    await context.close();
  }
  await browser.close();
  console.log('Screenshots captured to tmp/audit-screenshots');
}

capture().catch(console.error);
