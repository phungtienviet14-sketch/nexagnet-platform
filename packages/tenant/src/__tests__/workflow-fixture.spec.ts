import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  loadTenantConfig,
  resetTenantCache,
  tenantDir,
  tenantWorkflowBinding,
  tenantWorkflowEngine,
} from '../tenant.config.js';

/**
 * GOI KHACH FIXTURE co BAT workflow engine — nen mong cua moi bang chung E2E ve sau.
 *
 * VI SAO PHAI CO MOT GOI RIENG, khong dung goi khach that:
 *
 *  1. Chua khach nao khai `integrations.workflowEngine` (kiem: `grep -rl workflowEngine tenants/`
 *     tra ve rong). Bat engine cho mot khach that la QUYET DINH VAN HANH, khong duoc xay ra nhu
 *     hieu ung phu cua mot bai test.
 *  2. E2E phai di qua BIEN PRODUCTION that — `AppModule.forRoot()` doc goi khach bang chinh
 *     loader nay. Mot object dung trong bo nho khong chung minh duoc dieu do. Do cung la khac
 *     biet giua file nay va `workflow-binding.spec.ts`: file kia kiem SCHEMA, file nay kiem
 *     ca duong tu DIA -> loader -> ham `tenantWorkflow*()` ma DI that se goi.
 *
 * VI SAO NAM NGOAI `tenants/`: `tenant-packs.spec.ts` liet ke thu muc `tenants/` va nap TUNG goi
 * bang loader that. Mot fixture nam trong do se bi dem la khach that — va tu do moi bao cao
 * "co bao nhieu khach" deu lech di mot.
 *
 * VI SAO nam canh `knowledge-only` chu khong o `tools/`: `tenant.config.spec.ts:33` va
 * `app.module.knowledge-only.boot.spec.ts:9` deu da tro sang thu muc nay. Mot thu muc fixture
 * thu hai o cho khac chi lam nguoi sau phai doan xem fixture nam o dau.
 */
const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const WORKFLOW_FIXTURE = resolve(fixturesDir, 'workflow-enabled');

afterEach(() => {
  delete process.env.TENANT;
  delete process.env.TENANT_DIR;
  resetTenantCache();
});

function loadFixture(): void {
  delete process.env.TENANT;
  process.env.TENANT_DIR = WORKFLOW_FIXTURE;
  resetTenantCache();
}

describe('goi khach fixture co bat workflow engine', () => {
  it('nap duoc bang LOADER THAT, khong nem', () => {
    loadFixture();

    // Nem o day nghia la fixture sai schema — va no phai lo ra ngay, khong phai luc E2E chay.
    expect(() => loadTenantConfig()).not.toThrow();
    expect(loadTenantConfig().slug).toBe('workflow-enabled');
  });

  it('khai bao adapter hatchet + credentialRef la TEN BIEN, khong phai gia tri', () => {
    loadFixture();
    const integration = tenantWorkflowEngine();

    expect(integration.adapter).toBe('hatchet');
    // `credentialRef` phai la TEN bien moi truong. Neu ai do dan mot token that vao day thi
    // schema da chan (`^[A-Z][A-Z0-9_]*$`), nhung khang dinh nay lam y dinh do hien ra trong test.
    expect(integration.credentialRef).toBe('WORKFLOW_ENGINE_TOKEN');
    expect(integration.credentialRef).toMatch(/^[A-Z][A-Z0-9_]*$/);
  });

  it('co rang buoc integration-handoff@v1 dang BAT, dich den la mot cai TEN', () => {
    loadFixture();
    const binding = tenantWorkflowBinding('integration-handoff');

    expect(binding).toBeDefined();
    expect(binding?.version).toBe('v1');
    expect(binding?.enabled).toBe(true);
    expect(binding?.idempotency).toBe('key');
    // Dich den la TEN LOGIC. URL that nam o cau hinh runtime (`WORKFLOW_DESTINATION_*`), khong
    // o goi khach — vi goi khach nam trong git.
    expect(binding?.destination).toBe('proof-endpoint');
    expect(binding?.destination).not.toMatch(/https?:\/\//);
  });

  it('KHONG nam trong `tenants/` — neu khong `tenant-packs.spec.ts` se dem no la khach that', () => {
    process.env.TENANT = 'de-lay-duong-dan';
    delete process.env.TENANT_DIR;
    resetTenantCache();
    const realTenantsDir = dirname(tenantDir());

    const realSlugs = readdirSync(realTenantsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    expect(realSlugs).not.toContain('workflow-enabled');
  });
});
