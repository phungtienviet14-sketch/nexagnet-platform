import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('tmp/screenshots');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const pagesToCapture = [
  {
    name: '01-homepage',
    path: '/',
  },
  {
    name: '02-department-executive',
    path: '/departments/executive',
  },
  {
    name: '03-department-sales',
    path: '/departments/sales',
  },
  {
    name: '04-department-operations',
    path: '/departments/operations',
  },
  {
    name: '05-industry-retail-distribution',
    path: '/industries/retail-distribution',
  },
  {
    name: '06-industry-spa-beauty',
    path: '/industries/spa-beauty',
  },
];

async function capture() {
  console.log('Launching browser via Playwright for Visual QA Screenshots...');
  const browser = await chromium.launch();
  const baseUrl = 'http://localhost:3001';

  for (const pageItem of pagesToCapture) {
    // Desktop Capture 1440px
    const contextDesktop = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const pageDesktop = await contextDesktop.newPage();
    console.log(`Capturing ${pageItem.name} Desktop 1440px...`);
    await pageDesktop.goto(`${baseUrl}${pageItem.path}`, { waitUntil: 'networkidle' });
    await pageDesktop.waitForTimeout(800);

    const desktopPath = path.join(outDir, `${pageItem.name}-desktop-1440.png`);
    await pageDesktop.screenshot({ path: desktopPath, fullPage: true });
    console.log(`Saved: ${desktopPath}`);
    await contextDesktop.close();

    // Mobile Capture 390px
    const contextMobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
    });
    const pageMobile = await contextMobile.newPage();
    console.log(`Capturing ${pageItem.name} Mobile 390px...`);
    await pageMobile.goto(`${baseUrl}${pageItem.path}`, { waitUntil: 'networkidle' });
    await pageMobile.waitForTimeout(800);

    const mobilePath = path.join(outDir, `${pageItem.name}-mobile-390.png`);
    await pageMobile.screenshot({ path: mobilePath, fullPage: true });
    console.log(`Saved: ${mobilePath}`);
    await contextMobile.close();
  }

  await browser.close();
  console.log('All 6 required page screenshots (Desktop 1440px & Mobile 390px) captured successfully!');
}

capture().catch((err) => {
  console.error('Capture error:', err);
  process.exit(1);
});
