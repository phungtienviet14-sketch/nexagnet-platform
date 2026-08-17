import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch();
  
  // Desktop
  const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await desktopPage.goto('http://localhost:3001', { waitUntil: 'networkidle' });
  await desktopPage.screenshot({ path: 'tmp/screenshots/home-desktop.png', fullPage: true });

  const targetRoutes = [
    'industries/healthcare-clinic',
    'industries/manufacturing',
    'industries/logistics',
    'industries/financial-services',
    'industries/construction-interior',
    'industries/fnb-chains',
    'industries/professional-services',
    'departments/executive',
  ];

  for (const r of targetRoutes) {
    await desktopPage.goto(`http://localhost:3001/${r}`, { waitUntil: 'networkidle' });
    const filename = r.replace('/', '-');
    await desktopPage.screenshot({ path: `tmp/screenshots/${filename}-desktop.png`, fullPage: true });
    console.log(`Saved: tmp/screenshots/${filename}-desktop.png`);
  }

  // Mobile
  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobilePage.goto('http://localhost:3001/departments/executive', { waitUntil: 'networkidle' });
  await mobilePage.screenshot({ path: 'tmp/screenshots/dept-executive-mobile.png', fullPage: true });
  console.log('Saved: tmp/screenshots/dept-executive-mobile.png');

  await browser.close();
}

main().catch(console.error);
