import { describe, expect, it } from 'vitest';
import {
  engineDashboardTarget,
  resolveDashboardTarget,
  workflowRunDashboardUrl,
  WORKFLOW_ENGINE_DASHBOARD_URL_ENV,
  WORKFLOW_ENGINE_TOKEN_ENV,
} from './workflow-run-dashboard.js';

/**
 * DUONG BAM SANG DASHBOARD ENGINE — bai kiem hoi quy cua mot cai link 404 THAT.
 *
 * ---------------------------------------------------------------------------
 * SU CO (26/08/2026, `ultty-gd1-test`): nguoi van hanh bam "Mo trong engine" cho run
 * `4ea9cafd-5375-4501-af31-7d20019ec6a1`. Run TON TAI tren Hatchet (COMPLETED, 1m 26s), dashboard
 * TRUY CAP DUOC, `engineRunId` DUNG — nhung trang tra ve:
 *
 *     404 Page not found — requested path: /runs/4ea9cafd-5375-4501-af31-7d20019ec6a1
 *
 * Cong thuc URL sai, khong phai du lieu sai.
 *
 * ---------------------------------------------------------------------------
 * ROUTE CANONICAL — doc tu MA NGUON Hatchet tai dung the `v0.101.27`, khong doan tu breadcrumb:
 *
 *   `frontend/app/src/router.tsx`
 *     rootRoute
 *       └ authenticatedRoute   path: '/'
 *           └ tenantRoute      path: 'tenants/$tenant'
 *               └ tenantRunRoute  path: 'runs/$run'      <- MOT lan chay
 *
 * Nghia la duong dung la `/tenants/<tenantId>/runs/<runId>`, va `/runs/<runId>` KHONG PHAI mot
 * route nao ca — dashboard tra 404 la dung. (`tenants/$tenant` con co bien the `task-runs/$run`
 * va `workflow-runs/$run`, nhung ca hai chi REDIRECT; duong o tren la duong that.)
 *
 * `$tenant` la TENANT CUA HATCHET — mot UUID, va no KHONG lien quan gi toi khach cua Nexagnet
 * (`ultty`, `amico`). Ta lay no tu claim `sub` cua chinh token engine: token da duoc duc RIENG
 * cho tenant do, nen suy ra tu no thi khong the lech, va khong ha tang nao phai khai them bien.
 */

/** Token Hatchet GIA — ba manh, khong ky. Chi phan claim la co nghia voi phep suy tenant. */
function fakeEngineToken(claims: Record<string, unknown>): string {
  const part = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'none' })}.${part(claims)}.c2ln`;
}

const ENGINE_TENANT = '707d0855-80ab-4e1a-a102-870c528e60fb';
const TOKEN = fakeEngineToken({
  sub: ENGINE_TENANT,
  server_url: 'https://workflow.example',
  grpc_broadcast_address: 'engine:7070',
});
const RUN_ID = '4ea9cafd-5375-4501-af31-7d20019ec6a1';

describe('workflowRunDashboardUrl — route canonical cua Hatchet', () => {
  it('A. dung ROUTE THAT `/tenants/<tenant>/runs/<run>`, khong phai `/runs/<run>`', () => {
    const target = engineDashboardTarget('https://workflow.example', TOKEN);

    expect(workflowRunDashboardUrl(target, RUN_ID)).toBe(
      `https://workflow.example/tenants/${ENGINE_TENANT}/runs/${RUN_ID}`,
    );
  });

  it('A-bis. duong CU `/runs/<run>` khong con duoc sinh ra nua', () => {
    const target = engineDashboardTarget('https://workflow.example', TOKEN);

    // Khong khang dinh bang `toBe` mot chuoi khac: cai phai chet la CHINH cai hinh dang cu.
    expect(workflowRunDashboardUrl(target, RUN_ID)).not.toBe(
      `https://workflow.example/runs/${RUN_ID}`,
    );
  });

  it('B. moi lan chay ra mot URL rieng — khong dinh id cua fixture', () => {
    const target = engineDashboardTarget('https://workflow.example', TOKEN);
    const other = '11111111-2222-3333-4444-555555555555';

    const url = workflowRunDashboardUrl(target, other);

    expect(url).toContain(other);
    expect(url).not.toContain(RUN_ID);
  });

  it('C. goc co hay khong co dau `/` cuoi deu ra CUNG mot URL, khong sinh `//`', () => {
    const withSlash = engineDashboardTarget('https://workflow.example/', TOKEN);
    const without = engineDashboardTarget('https://workflow.example', TOKEN);
    const many = engineDashboardTarget('https://workflow.example///', TOKEN);

    const expected = `https://workflow.example/tenants/${ENGINE_TENANT}/runs/${RUN_ID}`;
    expect(workflowRunDashboardUrl(withSlash, RUN_ID)).toBe(expected);
    expect(workflowRunDashboardUrl(without, RUN_ID)).toBe(expected);
    expect(workflowRunDashboardUrl(many, RUN_ID)).toBe(expected);
    // `//` chi duoc phep xuat hien MOT lan, ngay sau `https:`.
    expect(workflowRunDashboardUrl(withSlash, RUN_ID)!.split('//')).toHaveLength(2);
  });

  it('D. thieu goc dashboard -> KHONG co link (khong dung mot nut dan toi hu vo)', () => {
    expect(engineDashboardTarget(undefined, TOKEN)).toBeUndefined();
    expect(engineDashboardTarget('   ', TOKEN)).toBeUndefined();
    expect(workflowRunDashboardUrl(undefined, RUN_ID)).toBeUndefined();
  });

  it('D-bis. co goc nhung KHONG suy duoc tenant -> van khong co link', () => {
    // Thieu token, token khong phai JWT, claim `sub` vang mat, hoac `sub` khong phai UUID.
    expect(engineDashboardTarget('https://workflow.example', undefined)).toBeUndefined();
    expect(engineDashboardTarget('https://workflow.example', 'khong-phai-jwt')).toBeUndefined();
    expect(
      engineDashboardTarget('https://workflow.example', fakeEngineToken({ server_url: 'x' })),
    ).toBeUndefined();
    expect(
      engineDashboardTarget('https://workflow.example', fakeEngineToken({ sub: 'default' })),
    ).toBeUndefined();
  });

  it('D-ter. thieu `engineRunId` -> khong co link', () => {
    const target = engineDashboardTarget('https://workflow.example', TOKEN);
    expect(workflowRunDashboardUrl(target, '')).toBeUndefined();
  });

  it('E. URL KHONG mang theo bat ky manh nao cua token', () => {
    const target = engineDashboardTarget('https://workflow.example', TOKEN);
    const url = workflowRunDashboardUrl(target, RUN_ID)!;

    for (const piece of TOKEN.split('.')) {
      expect(url).not.toContain(piece);
    }
    expect(url).not.toContain(TOKEN);
    expect(url.toLowerCase()).not.toMatch(/token|authorization|api[_-]?key|password|bearer/);
    // Khong co phan query/fragment nao de nhet bi mat vao.
    expect(url).not.toContain('?');
    expect(url).not.toContain('#');
  });

  it('E-bis. mot goc dashboard MANG THONG TIN DANG NHAP bi tu choi han', () => {
    // `https://user:pass@host` la mot URL hop le ve cu phap — va la mot cach ro ri mat khau
    // sang thanh dia chi cua trinh duyet, sang log proxy, sang lich su. Khong dung link con
    // hon dung mot link mang mat khau.
    expect(
      engineDashboardTarget('https://operator:s3cret@workflow.example', TOKEN),
    ).toBeUndefined();
  });

  it('F. `engineRunId` doc hai khong thoat ra khoi doan duong cua no', () => {
    const target = engineDashboardTarget('https://workflow.example', TOKEN);

    const traversal = workflowRunDashboardUrl(target, '../../../tenants/khac/runs/abc')!;
    const absolute = workflowRunDashboardUrl(target, '/evil')!;
    const host = workflowRunDashboardUrl(target, '//evil.example/x')!;
    const query = workflowRunDashboardUrl(target, 'abc?next=https://evil.example')!;

    const prefix = `https://workflow.example/tenants/${ENGINE_TENANT}/runs/`;
    for (const url of [traversal, absolute, host, query]) {
      // Van o dung tren mien cua ta, va van nam duoi dung tenant cua ta.
      expect(new URL(url).origin).toBe('https://workflow.example');
      expect(url.startsWith(prefix)).toBe(true);
      // Khong con dau phan cach nao de tao them mot doan duong.
      const runSegment = url.slice(prefix.length);
      expect(runSegment).not.toContain('/');
      expect(runSegment).not.toContain('?');
      expect(runSegment).not.toContain('#');
    }
    expect(new URL(host).host).toBe('workflow.example');
  });

  it('G. DA KHACH: hai stack co token rieng -> hai tenant rieng, khong dinh nhau', () => {
    const other = '9c2f1f2e-1111-4aaa-8bbb-0123456789ab';
    const a = engineDashboardTarget('https://workflow-a.example', TOKEN);
    const b = engineDashboardTarget('https://workflow-b.example', fakeEngineToken({ sub: other }));

    expect(workflowRunDashboardUrl(a, RUN_ID)).toBe(
      `https://workflow-a.example/tenants/${ENGINE_TENANT}/runs/${RUN_ID}`,
    );
    expect(workflowRunDashboardUrl(b, RUN_ID)).toBe(
      `https://workflow-b.example/tenants/${other}/runs/${RUN_ID}`,
    );
  });
});

describe('resolveDashboardTarget — doc tu bien moi truong', () => {
  it('lay CA HAI manh tu bien moi truong cua chinh stack do', () => {
    const target = resolveDashboardTarget({
      [WORKFLOW_ENGINE_DASHBOARD_URL_ENV]: 'https://workflow.example',
      [WORKFLOW_ENGINE_TOKEN_ENV]: TOKEN,
    } as NodeJS.ProcessEnv);

    expect(workflowRunDashboardUrl(target, RUN_ID)).toBe(
      `https://workflow.example/tenants/${ENGINE_TENANT}/runs/${RUN_ID}`,
    );
  });

  it('khong khai gi thi KHONG co dich — va khong nem', () => {
    expect(resolveDashboardTarget({} as NodeJS.ProcessEnv)).toBeUndefined();
  });
});
