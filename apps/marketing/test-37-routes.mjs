import { chromium } from 'playwright';

const ROUTES = [
  '/',
  // Platform
  '/platform',
  '/platform/control',
  '/platform/integrations',
  // Departments (7)
  '/departments',
  '/departments/executive',
  '/departments/sales',
  '/departments/marketing',
  '/departments/customer-service',
  '/departments/operations',
  '/departments/finance',
  '/departments/hr',
  // Products (3)
  '/products/order-automation',
  '/products/knowledge',
  '/products/campaigns',
  // Industries (12)
  '/industries/retail-distribution',
  '/industries/manufacturing',
  '/industries/logistics',
  '/industries/healthcare-clinic',
  '/industries/spa-beauty',
  '/industries/fnb-chains',
  '/industries/financial-services',
  '/industries/construction-interior',
  '/industries/real-estate',
  '/industries/professional-services',
  '/industries/education',
  '/industries/hospitality',
  // Resources & Legal
  '/resources/faq',
  '/resources/roadmap',
  '/privacy',
];

async function main() {
  console.log(`Starting Playwright test across ${ROUTES.length} routes on http://localhost:3001...`);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on('pageerror', (err) => {
    errors.push({ type: 'pageerror', message: err.message, stack: err.stack });
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push({ type: 'console.error', text: msg.text() });
    }
  });

  let passCount = 0;
  for (const route of ROUTES) {
    const url = `http://localhost:3001${route}`;
    const initialErrorCount = errors.length;
    try {
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      const status = response ? response.status() : 'NO_RESPONSE';
      const newErrors = errors.slice(initialErrorCount);

      if (status === 200 && newErrors.length === 0) {
        console.log(`✅ [200 OK] ${route}`);
        passCount++;
      } else {
        console.error(`❌ [${status}] ${route} - Errors:`, newErrors);
      }
    } catch (err) {
      console.error(`❌ [EXCEPTION] ${route}:`, err.message);
    }
  }

  console.log(`\n================================`);
  console.log(`Results: ${passCount}/${ROUTES.length} routes passed perfectly.`);
  console.log(`Total console/page errors: ${errors.length}`);
  console.log(`================================\n`);

  await browser.close();

  if (passCount !== ROUTES.length || errors.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
