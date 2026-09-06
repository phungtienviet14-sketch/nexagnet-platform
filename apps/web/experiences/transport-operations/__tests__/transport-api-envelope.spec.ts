import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PHONG BI CUA DANH SACH — bo khoa chong lech giua may chu va man hinh.
 *
 * VI SAO BO NAY TON TAI. Tren ban dang chay `e4fbf95`, hai muc "Bảo dưỡng & giấy tờ" va "Lương"
 * TRANG MAN voi `N.map is not a function`. Nguyen nhan: may chu tra `{ plans }`, `{ due }`,
 * `{ workOrders }`, `{ documents }`, `{ alerts, gaps }`, `{ vehicles, conflicts }`, `{ periods }`,
 * `{ runs }`, `{ payslips }`, con `transport-api.ts` khai bao chin duong do la MANG TRAN.
 *
 * VI SAO KHONG BAI KIEM NAO BAT. Ca hai may chu gia cua bo e2e tra ve mang tran — tuc chung khang
 * dinh mot hop dong may chu KHONG CO THAT, roi bo e2e xanh tren chinh loi bia do. Bo test nay vi
 * the KHONG duoc phep tu dinh nghia hop dong: no doc `(duong, khoa)` tu ma nguon CUA CHINH
 * CONTROLLER, y nhu `transport-actions.spec.ts` doc bang phan quyen tu API.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT_FILE = resolve(HERE, '../transport-api.ts');
const API_DIR = resolve(HERE, '../../../../api/src/transport');

vi.mock('../../../lib/auth', () => ({
  authFetch: vi.fn(),
}));
vi.mock('../../../lib/api-base', () => ({
  publicApiBase: () => 'https://api.test',
}));

const { authFetch } = await import('../../../lib/auth');
const { transportApi } = await import('../transport-api');

const respond = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

interface EnvelopeCase {
  readonly label: string;
  readonly path: string;
  readonly key: string;
  readonly controller: string;
  readonly route: string;
  readonly call: () => Promise<readonly unknown[]>;
}

const CASES: readonly EnvelopeCase[] = [
  {
    label: 'maintenance plans',
    path: '/transport/maintenance/plans',
    key: 'plans',
    controller: 'asset-compliance/maintenance.controller.ts',
    route: "@Get('plans')",
    call: () => transportApi.assets.plans(),
  },
  {
    label: 'maintenance due',
    path: '/transport/maintenance/due',
    key: 'due',
    controller: 'asset-compliance/maintenance.controller.ts',
    route: "@Get('due')",
    call: () => transportApi.assets.due(),
  },
  {
    label: 'maintenance work orders',
    path: '/transport/maintenance/work-orders',
    key: 'workOrders',
    controller: 'asset-compliance/maintenance.controller.ts',
    route: "@Get('work-orders')",
    call: () => transportApi.assets.workOrders(),
  },
  {
    label: 'compliance documents',
    path: '/transport/compliance/documents',
    key: 'documents',
    controller: 'asset-compliance/compliance.controller.ts',
    route: "@Get('documents')",
    call: () => transportApi.assets.complianceDocuments(),
  },
  {
    label: 'compliance alerts',
    path: '/transport/compliance/alerts',
    key: 'alerts',
    controller: 'asset-compliance/compliance.controller.ts',
    route: "@Get('alerts')",
    call: () => transportApi.assets.complianceAlerts(),
  },
  {
    label: 'fleet status',
    path: '/transport/fleet-status',
    key: 'vehicles',
    controller: 'asset-compliance/fleet-status.controller.ts',
    route: '@Get()',
    call: () => transportApi.assets.fleetStatus(),
  },
  {
    label: 'payroll periods',
    path: '/transport/payroll/periods',
    key: 'periods',
    controller: 'workforce/payroll.controller.ts',
    route: "@Get('periods')",
    call: () => transportApi.payroll.periods(),
  },
  {
    label: 'payroll runs of a period',
    path: '/transport/payroll/periods/per-1/runs',
    key: 'runs',
    controller: 'workforce/payroll.controller.ts',
    route: "@Get('periods/:periodId/runs')",
    call: () => transportApi.payroll.runs('per-1'),
  },
  {
    label: 'payslips of a run',
    path: '/transport/payroll/runs/run-1/payslips',
    key: 'payslips',
    controller: 'workforce/payroll.controller.ts',
    route: "@Get('runs/:runId/payslips')",
    call: () => transportApi.payroll.payslipsOfRun('run-1'),
  },
];

describe('danh sach nam trong phong bi', () => {
  beforeEach(() => {
    vi.mocked(authFetch).mockReset();
  });

  it.each(CASES)('$label: boc phong bi ra mang', async ({ path, key, call }) => {
    // `payslips` la truong hop DAC BIET: moi hang la `{ payslip, components }`, khong phai mot
    // phieu tran. Dua dung dang do vao de phep boc hai lop cung duoc do.
    const row = key === 'payslips' ? { payslip: { id: 'x1' }, components: [] } : { id: 'x1' };
    vi.mocked(authFetch).mockResolvedValue(respond({ [key]: [row] }));

    const result = await call();

    expect(vi.mocked(authFetch).mock.calls[0]?.[0]).toBe(`https://api.test${path}`);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([{ id: 'x1' }]);
  });

  it.each(CASES)('$label: mang TRAN bi tu choi, khong am tham thanh rong', async ({ call }) => {
    // Day chinh la hinh dang cu — go phep boc ra thi bai nay do. Va no do bang mot LOI, khong phai
    // bang mot danh sach rong: mot man hinh "chua co du lieu" tren mot phan hoi sai dang la mot
    // cau noi doi, kho tim hon han mot thong bao loi.
    vi.mocked(authFetch).mockResolvedValue(respond([{ id: 'x1' }]));

    await expect(call()).rejects.toThrow(/không đúng dạng mong đợi/);
  });
});

describe('bang tren KHOP voi ma nguon, khong phai voi tri nho cua nguoi viet test', () => {
  const clientSource = readFileSync(CLIENT_FILE, 'utf8');

  it('moi cho goi getList() trong transport-api.ts deu co trong bang', () => {
    const callSites = [
      ...clientSource.matchAll(/getList[^(]*\(\s*[`'"]([^`'"]+)[`'"],\s*'([^']+)'/g),
    ];

    // NEO: neu phep quet doc ra rong thi cau "moi cho goi deu co trong bang" la mot cau noi that ve
    // mot danh sach rong. Chot so luong truoc khi so sanh noi dung.
    expect(callSites.length).toBe(CASES.length);

    for (const [, rawPath, key] of callSites) {
      const prefix = (rawPath ?? '').split('/${')[0] ?? '';
      const match = CASES.find((c) => c.key === key && c.path.startsWith(prefix));
      expect(match, `getList('${rawPath}', '${key}') chua co trong bang`).toBeDefined();
    }
  });

  it.each(CASES)(
    '$label: controller cua API thuc su tra ve khoa nay',
    ({ controller, route, key }) => {
      const source = readFileSync(resolve(API_DIR, controller), 'utf8');
      const at = source.indexOf(route);
      expect(at, `khong tim thay ${route} trong ${controller}`).toBeGreaterThan(-1);

      // Than cua mot handler o day luon ngan; 20 dong la du rong ma khong cham handler ke tiep.
      const block = source
        .slice(at, at + 1200)
        .split('\n')
        .slice(0, 20)
        .join('\n');
      expect(block).toMatch(new RegExp(`\\b${key}\\b\\s*[,:]`));
    },
  );
});
