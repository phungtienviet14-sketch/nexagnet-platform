import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  
  const depts = ['sales', 'operations', 'executive', 'finance', 'customer-service', 'hr', 'marketing'];
  for (const dept of depts) {
    await page.goto(`http://localhost:3001/departments/${dept}`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: `tmp/screenshots/dept-${dept}-current.png`, fullPage: true });
    console.log(`Saved: tmp/screenshots/dept-${dept}-current.png`);
  }
  
  await browser.close();
}

main().catch(console.error);
