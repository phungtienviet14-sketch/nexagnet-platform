import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const playwrightPath = require.resolve('@playwright/test', { paths: [path.resolve('apps/web')] });
const { chromium } = require(playwrightPath);

async function capture() {
  const outDir = path.resolve('tmp/screenshots');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log('Launching browser via Playwright...');
  const browser = await chromium.launch({ headless: true });

  // 1. Desktop 1440px
  console.log('Capturing Desktop 1440px...');
  const pageDesktop = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 2,
  });
  await pageDesktop.goto('http://localhost:3001', { waitUntil: 'networkidle' });
  await pageDesktop.waitForTimeout(1000);
  const desktopPath = path.join(outDir, 'nexagnet-desktop-1440px.png');
  await pageDesktop.screenshot({ path: desktopPath, fullPage: true });
  console.log('Saved:', desktopPath);

  // 2. Laptop 1280px
  console.log('Capturing Laptop 1280px...');
  const pageLaptop = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });
  await pageLaptop.goto('http://localhost:3001', { waitUntil: 'networkidle' });
  await pageLaptop.waitForTimeout(1000);
  const laptopPath = path.join(outDir, 'nexagnet-laptop-1280px.png');
  await pageLaptop.screenshot({ path: laptopPath, fullPage: true });
  console.log('Saved:', laptopPath);

  // 3. Tablet 768px
  console.log('Capturing Tablet 768px...');
  const pageTablet = await browser.newPage({
    viewport: { width: 768, height: 1024 },
    deviceScaleFactor: 2,
  });
  await pageTablet.goto('http://localhost:3001', { waitUntil: 'networkidle' });
  await pageTablet.waitForTimeout(1000);
  const tabletPath = path.join(outDir, 'nexagnet-tablet-768px.png');
  await pageTablet.screenshot({ path: tabletPath, fullPage: true });
  console.log('Saved:', tabletPath);

  // 4. Mobile 390px
  console.log('Capturing Mobile 390px...');
  const pageMobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  await pageMobile.goto('http://localhost:3001', { waitUntil: 'networkidle' });
  await pageMobile.waitForTimeout(1000);
  const mobilePath = path.join(outDir, 'nexagnet-mobile-390px.png');
  await pageMobile.screenshot({ path: mobilePath, fullPage: true });
  console.log('Saved:', mobilePath);

  // 5. Privacy Page 1440px
  console.log('Capturing Privacy Page 1440px...');
  const pagePrivacy = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 2,
  });
  await pagePrivacy.goto('http://localhost:3001/privacy', { waitUntil: 'networkidle' });
  await pagePrivacy.waitForTimeout(1000);
  const privacyPath = path.join(outDir, 'nexagnet-privacy-1440px.png');
  await pagePrivacy.screenshot({ path: privacyPath, fullPage: true });
  console.log('Saved:', privacyPath);

  await browser.close();
  console.log('All screenshots captured successfully!');
}

capture().catch((err) => {
  console.error('Capture error:', err);
  process.exit(1);
});
