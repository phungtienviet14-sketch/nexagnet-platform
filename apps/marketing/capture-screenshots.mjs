import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('tmp/screenshots');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const pagesToCapture = [
  {
    name: 'homepage',
    path: '/',
  },
  {
    name: 'nexagnet-product-order-automation',
    path: '/products/order-automation',
  },
  {
    name: 'nexagnet-solution-sales',
    path: '/solutions/sales',
  },
  {
    name: 'nexagnet-platform-control',
    path: '/platform/control',
  },
];

async function capture() {
  console.log('Launching browser via Playwright...');
  const browser = await chromium.launch();
  const baseUrl = 'http://localhost:3001';

  for (const pageItem of pagesToCapture) {
    // Desktop Capture
    const contextDesktop = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const pageDesktop = await contextDesktop.newPage();
    console.log(`Capturing ${pageItem.name} Desktop 1440px...`);
    await pageDesktop.goto(`${baseUrl}${pageItem.path}`, { waitUntil: 'networkidle' });
    await pageDesktop.waitForTimeout(600);

    const desktopPath = path.join(outDir, `${pageItem.name}-desktop.png`);
    await pageDesktop.screenshot({ path: desktopPath, fullPage: true });
    console.log(`Saved: ${desktopPath}`);
    await contextDesktop.close();

    // Mobile Capture
    const contextMobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
    });
    const pageMobile = await contextMobile.newPage();
    console.log(`Capturing ${pageItem.name} Mobile 390px...`);
    await pageMobile.goto(`${baseUrl}${pageItem.path}`, { waitUntil: 'networkidle' });
    await pageMobile.waitForTimeout(600);

    const mobilePath = path.join(outDir, `${pageItem.name}-mobile.png`);
    await pageMobile.screenshot({ path: mobilePath, fullPage: true });
    console.log(`Saved: ${mobilePath}`);
    await contextMobile.close();
  }

  await browser.close();
  console.log('All visual screenshots captured successfully!');
}

capture().catch((err) => {
  console.error('Capture error:', err);
  process.exit(1);
});
