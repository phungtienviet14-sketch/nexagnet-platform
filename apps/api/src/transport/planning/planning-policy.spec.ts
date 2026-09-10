import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetTenantCache } from '@netviet/tenant';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_RUN_CLOSURE_IDLE_HOURS,
  DEFAULT_RUN_CLOSURE_SWEEP_BATCH_SIZE,
  DEFAULT_RUN_CLOSURE_SWEEP_INTERVAL_SECONDS,
  RUN_CLOSURE_EVENT_BACKSTOP_MS,
  tenantTransportPlanningPolicy,
} from './planning-policy.js';

/**
 * CHINH SACH LAP KE HOACH DOC TU GOI KHACH (`#276` L1, `#293` R3).
 *
 * Bai kiem o day khong hoi "khach nao khai gi" — khong bai nao trong repo nay duoc biet mot khach
 * cu the ton tai. No hoi dung mot cau: **mot goi khach khong khai gi thi he thong lam gi**, va do
 * la cau hoi quan trong nhat cua mot thay doi chinh sach, vi cau tra loi cho no ap dung cho MOI
 * khach dang chay.
 */

const tmpDirs: string[] = [];

/**
 * Mot goi khach TOI THIEU chi de `loadTenantConfig()` doc duoc.
 *
 * Hinh dang bam theo goi `transport-core` trong `packages/tenant/.../fixtures` — cung experience,
 * cung capability — de bai kiem nay khong vo tinh kiem luon ca nhung rang buoc khac cua schema.
 */
const usePack = (transportPlanning?: unknown): void => {
  const dir = mkdtempSync(join(tmpdir(), 'lane-r-policy-'));
  tmpDirs.push(dir);
  writeFileSync(
    join(dir, 'tenant.json'),
    JSON.stringify({
      schemaVersion: 2,
      slug: 'lane-r-fixture',
      identity: { displayName: 'Lane R Fixture', shortName: 'R' },
      branding: {
        productName: 'Lane R',
        installName: 'Lane R',
        pageTitle: 'Lane R',
        pageDescription: 'Fixture.',
        themeColor: '#123a5f',
        backgroundColor: '#f4f6f9',
        monogram: 'R',
        composerPlaceholder: 'x',
      },
      experience: 'transport-operations',
      capabilities: ['transport-core'],
      policies: {
        transportCore: { timeZone: 'Asia/Ho_Chi_Minh' },
        readiness: { blockedCapabilities: [] },
        ...(transportPlanning === undefined ? {} : { transportPlanning }),
      },
      integrations: {},
      bootstrap: {},
    }),
    'utf8',
  );
  process.env.TENANT_DIR = dir;
  delete process.env.TENANT;
  resetTenantCache();
};

afterEach(() => {
  delete process.env.TENANT_DIR;
  delete process.env.TENANT;
  resetTenantCache();
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('chinh sach lap ke hoach — mac dinh cho mot goi khach KHONG khai gi', () => {
  it('giu nguyen hanh vi cu, va luot quet van co nhip', () => {
    usePack();

    const policy = tenantTransportPlanningPolicy();

    expect(policy.grouping).toBe('ONE_ORDER_PER_RUN');
    expect(policy.depots).toEqual([]);
    // Nguong nghi KHONG co mac dinh — khong nguon nao noi mot chiec xe nghi bao lau thi het vong
    // chay, va mot con so bia ra se dong vong chay cua moi khach chua doc tai lieu nay.
    expect(policy.closure.idleHours).toBe(DEFAULT_RUN_CLOSURE_IDLE_HOURS);
    expect(policy.closure.idleHours).toBeNull();

    // Nhung NHIP QUET thi phai co: khac han nguong nghi, day la hai so VAN HANH, va "khong cau
    // hinh" khong duoc dong nghia voi "khong co co che".
    expect(policy.sweep.intervalSeconds).toBe(DEFAULT_RUN_CLOSURE_SWEEP_INTERVAL_SECONDS);
    expect(policy.sweep.batchSize).toBe(DEFAULT_RUN_CLOSURE_SWEEP_BATCH_SIZE);
  });
});

describe('chinh sach lap ke hoach — goi khach CO khai', () => {
  it('doc dung ca ba khoi, ke ca nhip quet', () => {
    usePack({
      runGrouping: 'MULTI_ORDER_RUN',
      depots: [{ code: 'DEPOT-HN', label: 'Bai xe Ha Noi' }],
      closure: { idleHours: 12 },
      sweep: { intervalSeconds: 30, batchSize: 10 },
    });

    const policy = tenantTransportPlanningPolicy();

    expect(policy.grouping).toBe('MULTI_ORDER_RUN');
    expect(policy.depots).toEqual([{ code: 'DEPOT-HN', label: 'Bai xe Ha Noi' }]);
    expect(policy.closure.idleHours).toBe(12);
    expect(policy.sweep).toEqual({ intervalSeconds: 30, batchSize: 10 });
  });

  it('khai nguong nghi ma khong khai nhip quet: nguong duoc doc, nhip lay mac dinh', () => {
    usePack({ closure: { idleHours: 6 } });

    const policy = tenantTransportPlanningPolicy();

    expect(policy.closure.idleHours).toBe(6);
    expect(policy.sweep.intervalSeconds).toBe(DEFAULT_RUN_CLOSURE_SWEEP_INTERVAL_SECONDS);
  });

  it('nhip quet vo ly bi TU CHOI luc nap goi khach, khong bi nuot thanh mac dinh', () => {
    // Mot luot quet moi 1 giay khong phai mot nhu cau van hanh. Nuot no thanh mac dinh se lam mot
    // loi cau hinh tro thanh mot hanh vi khac — im lang.
    expect(() => {
      usePack({ sweep: { intervalSeconds: 1 } });
      tenantTransportPlanningPolicy();
    }).toThrowError();
  });

  it('truong la trong khoi `sweep` cung bi tu choi — schema la `.strict()`', () => {
    expect(() => {
      usePack({ sweep: { intervalSeconds: 60, batchSize: 50, tickSeconds: 5 } });
      tenantTransportPlanningPolicy();
    }).toThrowError();
  });
});

describe('duong bao hiem cho nhanh VE BAI', () => {
  it('ngan hon moi nguong nghi hop le — neu khong no khong con la duong bao hiem', () => {
    // Nguong nghi nho nhat ma schema cho phep la 1 gio. Cua so bao hiem phai nho hon the, neu
    // khong mot vong chay ve bai se doi HET nguong nghi moi duoc nhin lai.
    expect(RUN_CLOSURE_EVENT_BACKSTOP_MS).toBeLessThan(3_600_000);
  });
});
