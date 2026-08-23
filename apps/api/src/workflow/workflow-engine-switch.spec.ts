import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetTenantCache } from '@netviet/tenant';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WORKFLOW_ENGINE_SWITCH_ENV,
  activeWorkflowEngine,
  workflowEngineEnabled,
} from './workflow-engine-switch.js';

/**
 * CONG TAC VAN HANH `WORKFLOW_ENGINE` — quyet dinh Q1-A.
 *
 * ---------------------------------------------------------------------------
 * VAN DE CO THAT MA CONG TAC NAY GIAI:
 *
 * `deploy-remote.sh:108` rsync CUNG MOT `tenant-pack` cho ca hai stack:
 *
 *     tenants/ultty/tenant.json  ->  zalo-ultty            (production)
 *                                ->  zalo-ultty-gd1-test   (moi truong ky thuat)
 *
 * Nen khai `integrations.workflowEngine` de bat engine cho gd1-test cung dong thoi VU TRANG
 * dispatcher tren production o lan deploy ke tiep — noi khong co engine nao de goi. Hau qua:
 * `WorkflowScheduler` chay moi 5 giay, moi lan deu that bai, va log cua khach day loi cho mot
 * tinh nang khong ai bat.
 *
 * ---------------------------------------------------------------------------
 * VI SAO LA BIEN MOI TRUONG chu khong phai mot truong trong `tenant.json`:
 *
 * Goi khach tra loi "khach NAY dung khuon nao, phien ban nao" — do la CHINH SACH, va no giong
 * nhau o moi moi truong. Bien moi truong tra loi "BAN TRIEN KHAI NAY co bat khong" — do la VAN
 * HANH. Cung khuon `AUTO_SEND` da co (CLAUDE.md QD#4: kill switch van hanh ≠ policy tenant).
 *
 * MAC DINH `off` LA CA DIEM CUA NO. Mot cong tac mac dinh `on` khong bao ve duoc gi: production
 * se bat len ngay lan deploy dau tien ma khong ai go them mot dong nao.
 */

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(here, '../../../../packages/tenant/src/__tests__/fixtures');

let saved: NodeJS.ProcessEnv;

beforeEach(() => {
  saved = { ...process.env };
  // Goi khach CO khai engine — moi bai duoi day chay tren dung goi ma production se nhan.
  process.env.TENANT_DIR = resolve(FIXTURES, 'workflow-enabled');
  delete process.env.TENANT;
  resetTenantCache();
});

afterEach(() => {
  process.env = saved;
  resetTenantCache();
});

describe('workflowEngineEnabled', () => {
  it('MAC DINH TAT khi bien khong duoc dat — production khong bi vu trang', () => {
    delete process.env[WORKFLOW_ENGINE_SWITCH_ENV];
    // Day la khang dinh quan trong nhat ca file. Neu no doi thanh `true`, mot lan deploy
    // production se bat dispatcher len ma khong ai quyet dinh gi.
    expect(workflowEngineEnabled(process.env)).toBe(false);
  });

  it("chi 'on' moi bat — moi chuoi khac deu la TAT", () => {
    for (const value of ['off', '', '  ', 'true', '1', 'yes', 'ON', 'On', 'enabled']) {
      process.env[WORKFLOW_ENGINE_SWITCH_ENV] = value;
      expect(workflowEngineEnabled(process.env)).toBe(false);
    }
  });

  it("'on' bat, ke ca khi co khoang trang thua tu render-secrets", () => {
    for (const value of ['on', ' on', 'on ']) {
      process.env[WORKFLOW_ENGINE_SWITCH_ENV] = value;
      expect(workflowEngineEnabled(process.env)).toBe(true);
    }
  });
});

describe('activeWorkflowEngine', () => {
  it('cong tac TAT -> tra ve `none` DU goi khach da khai hatchet', () => {
    delete process.env[WORKFLOW_ENGINE_SWITCH_ENV];

    const integration = activeWorkflowEngine(process.env);
    // `none` chinh la thu `WorkflowScheduler` va `createWorkflowEngineAdapter` da biet xu ly:
    // dispatcher khong khoi dong, cong la `DisabledWorkflowEngineAdapter`, he boot BINH THUONG.
    // Nghia la cong tac nay khong them mot duong ma nao — no dung lai duong SAN CO.
    expect(integration.adapter).toBe('none');
  });

  it('cong tac BAT -> tra ve dung rang buoc cua goi khach', () => {
    process.env[WORKFLOW_ENGINE_SWITCH_ENV] = 'on';

    const integration = activeWorkflowEngine(process.env);
    expect(integration.adapter).toBe('hatchet');
    expect(
      integration.adapter === 'hatchet' &&
        integration.bindings.some((binding) => binding.key === 'integration-handoff'),
    ).toBe(true);
  });

  it('cong tac BAT nhung goi khach KHONG khai -> van `none`, khong nem', () => {
    // Hai cong doc lap: van hanh (bien) va chinh sach (goi khach). Bat cong tac o mot khach chua
    // san sang KHONG duoc lam sap tien trinh — do la khach khong dung workflow, mot cau hinh
    // hop le.
    process.env[WORKFLOW_ENGINE_SWITCH_ENV] = 'on';
    process.env.TENANT_DIR = resolve(FIXTURES, 'knowledge-only');
    resetTenantCache();

    expect(() => activeWorkflowEngine(process.env)).not.toThrow();
    expect(activeWorkflowEngine(process.env).adapter).toBe('none');
  });
});
