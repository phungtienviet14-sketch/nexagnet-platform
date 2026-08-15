#!/usr/bin/env node
/**
 * Script validate-tenants.mjs
 * Quét toàn bộ thư mục `tenants/*` và validate toàn bộ các file schema (tenant.json, knowledge.json,
 * demo-messages.json, content-manifest.json) bằng loader chính thức @netviet/tenant.
 *
 * Chạy:
 *   node tools/validate-tenants.mjs
 */

import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadDemoMessages,
  loadTenantConfig,
  loadTenantContentManifest,
  loadTenantKnowledge,
  resetTenantCache,
} from '../packages/tenant/dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = dirname(__dirname);
const tenantsDir = join(repoRoot, 'tenants');

console.log(`\n🔍 Bắt đầu kiểm tra tính hợp lệ của tất cả tenant packages trong: ${tenantsDir}`);

const entries = readdirSync(tenantsDir, { withFileTypes: true });
const tenantSlugs = entries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

if (tenantSlugs.length === 0) {
  console.error('❌ Lỗi: Không tìm thấy bất kỳ thư mục tenant nào trong tenants/!');
  process.exit(1);
}

let hasError = false;
let validatedCount = 0;

for (const slug of tenantSlugs) {
  process.env.TENANT = slug;
  delete process.env.TENANT_DIR;
  resetTenantCache();

  try {
    const config = loadTenantConfig();
    if (config.slug !== slug) {
      throw new Error(
        `Slug không khớp: thư mục là '${slug}', nhưng tenant.json khai báo slug='${config.slug}'`,
      );
    }

    const knowledge = loadTenantKnowledge();
    const demoMessages = loadDemoMessages();
    const manifest = loadTenantContentManifest();

    const skuCount = knowledge.products.length;
    const dealerCount = knowledge.dealers.length;
    const groupCount = knowledge.groups.length;
    const policyCount = config.policies.length;
    const demoMsgCount = demoMessages.length;
    const manifestStatus = manifest
      ? `Manifest: ${manifest.assets?.length ?? 0} assets, ${manifest.faqs?.length ?? 0} faqs, ${manifest.links?.length ?? 0} links`
      : 'Manifest: none';

    console.log(
      `  ✔ [${slug.padEnd(10)}] Hợp lệ | ` +
        `${skuCount} SKUs | ${dealerCount} dealers | ${groupCount} groups | ` +
        `${policyCount} policies | ${demoMsgCount} demo msgs | ${manifestStatus}`,
    );
    validatedCount += 1;
  } catch (error) {
    hasError = true;
    console.error(`  ✖ [${slug.padEnd(10)}] LỖI: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Dọn dẹp biến môi trường sau khi quét xong
delete process.env.TENANT;
delete process.env.TENANT_DIR;
resetTenantCache();

console.log('------------------------------------------------------------');
if (hasError) {
  console.error(`❌ Kiểm tra thất bại! Có lỗi trong cấu hình tenant package.`);
  process.exit(1);
} else {
  console.log(`✅ Thành công! Đã kiểm tra ${validatedCount}/${tenantSlugs.length} tenant packages đạt chuẩn 100%.\n`);
}
