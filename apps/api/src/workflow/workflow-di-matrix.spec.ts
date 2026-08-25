import { NestFactory } from '@nestjs/core';
import { resetTenantCache } from '@netviet/tenant';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DisabledWorkflowEngineAdapter } from './disabled-workflow-engine.adapter.js';
import { WorkflowDispatcher } from './workflow-dispatcher.js';
import { WORKFLOW_ENGINE_SWITCH_ENV } from './workflow-engine-switch.js';
import { WorkflowEnginePort } from './workflow-engine.port.js';
import { WorkflowHandoffService } from './workflow-handoff.service.js';
import { WorkflowScheduler } from './workflow.module.js';

/**
 * W9 — MA TRAN DI TREN DO THI NEST THAT.
 *
 * ---------------------------------------------------------------------------
 * HAI CHIEU DOC LAP, va tach chung ra la toan bo y nghia cua bai nay:
 *
 *   goi khach         "khach NAY dung khuon nao"     -> CHINH SACH, nam trong git, giong moi noi
 *   `WORKFLOW_ENGINE` "BAN TRIEN KHAI NAY co bat"    -> VAN HANH, khac nhau tung stack
 *
 * `deploy-remote.sh:108` rsync CUNG MOT `tenant-pack` cho ca `zalo-ultty` (production) lan
 * `zalo-ultty-gd1-test`. Nen neu chi co MOT chieu — goi khach — thi bat engine cho gd1-test se
 * dong thoi vu trang dispatcher tren production. Cong tac van hanh la chieu thu hai, va bai nay
 * do CA HAI, khong phai mot.
 *
 *   goi khach \ cong tac      off (mac dinh)              on
 *   ------------------------  --------------------------  --------------------------------
 *   GOI THAT cua Ultty        A  none + ban giao `skipped` (= cau hinh PRODUCTION)
 *   chua khai workflow                                    A2 VAN none — cong tac khong de ra engine
 *   khai hatchet, du token    B1 none  <- KHANG DINH Q1-A  B2 adapter that, dispatcher co mat
 *   khai hatchet, thieu       C1 boot BINH THUONG          C2 boot NEM ngay
 *
 * Ca A dung GOI KHACH THAT, khong phai fixture: tu 23/08/2026 `tenants/ultty/tenant.json` DA khai
 * `integrations.workflowEngine`, nen A chinh la thu ma `zalo-ultty` (production) se chay. Neu A
 * doi mau, production doi hanh vi.
 *
 * B1 la o quan trong nhat ca bang: no la thu duy nhat dung giua "bat engine cho gd1-test" va
 * "vu trang production". Neu no doi thanh `hatchet`, mot lan deploy production se khoi dong
 * dispatcher ma khong ai quyet dinh gi.
 *
 * KHONG can ha tang: khong Postgres, khong engine. Cong Hatchet khoi tao TRE, nen boot khong mo
 * ket noi nao. Neu mai bai nay treo hoac doi mang, do la dau hieu boot da bat dau noi ra ngoai —
 * va do se la mot hoi quy that su.
 */

const FIXTURES = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/tenant/src/__tests__/fixtures',
);
const WORKFLOW_FIXTURE = resolve(FIXTURES, 'workflow-enabled');

interface Ctx {
  get: (token: never, options?: object) => unknown;
  close: () => Promise<void>;
}

/**
 * KET CUC CUA MOT LAN BOOT — mot chuoi, khong bao gio la mot do thi doi tuong.
 *
 * ⚠️ DAY LA MOT CAI BAY DA NO MOT LAN (23/08/2026), ghi ro de khong no lan hai:
 *
 * `await expect(boot()).rejects.toThrow(/RE/)` doc rat xuoi, nhung khi `boot()` KHONG nem —
 * dung truong hop mot thay doi HOP LE lam boot thanh cong — thi vitest dung mot `AssertionError`
 * mang theo `showDiff: true` va `actual` = CHINH `NestApplicationContext` vua boot. Doi tuong do
 * giu `container`: moi module, moi provider, ca do thi DI, PrismaClient, SDK Hatchet. Vitest
 * tuan tu hoa `actual` de ve diff va gui qua IPC ve tien trinh bao cao, roi di bo qua mot do thi
 * khong lo va co chu trinh:
 *
 *     FATAL ERROR: Ineffective mark-compacts near heap limit  — 4 GB, ~2,5 phut
 *
 * Da do: ban than `message` chi 71 KY TU. Cai no ra khong phai `message` ma la `actual`.
 * Hau qua that: mot khang dinh sai (dang le mot dong) hien thanh mot cu OOM ba phut khong doc
 * duoc — va nguoi doc se di do MOI TRUONG thay vi doc khang dinh.
 *
 * Nen: boot o day luon tra ve ket cuc DA THU GON, va `expect` chi bao gio nhin thay chuoi.
 * `nest-context-assertion.contract.spec.ts` giu dung luat nay cho ca thu muc.
 */
type BootOutcome =
  | { readonly kind: 'booted' }
  | { readonly kind: 'threw'; readonly message: string };

describe('W9 — ma tran DI: goi khach × cong tac van hanh, tren do thi Nest that', () => {
  const saved = { ...process.env };
  let context: Ctx | undefined;

  beforeEach(() => {
    process.env.PERSISTENCE = 'memory';
    process.env.CHANNEL_MODE = 'mock';
    // Moi bai TU NOI RA cong tac cua minh. Khong bai nao duoc dua vao gia tri con sot lai.
    delete process.env[WORKFLOW_ENGINE_SWITCH_ENV];
    resetTenantCache();
  });

  afterEach(async () => {
    await context?.close();
    context = undefined;
    process.env = { ...saved };
    resetTenantCache();
  });

  /**
   * `abortOnError: false` la BAT BUOC: mac dinh cua Nest khi do thi DI hong la `process.abort()`,
   * no giet luon worker cua vitest nen mot bai boot-nem se lam sap ca file thay vi do mot
   * khang dinh.
   */
  async function boot(): Promise<Ctx> {
    const { AppModule } = await import('../app.module.js');
    return (await NestFactory.createApplicationContext(await AppModule.forRoot(), {
      logger: ['error'],
      abortOnError: false,
    })) as never as Ctx;
  }

  /**
   * Boot, roi tra ve ket cuc DOC DUOC. Context boot duoc thi giu vao `context` de `afterEach`
   * dong no — mot bai that bai khong duoc de lai mot ung dung Nest con song trong tien trinh test.
   */
  async function bootOutcome(): Promise<BootOutcome> {
    try {
      context = await boot();
      return { kind: 'booted' };
    } catch (error) {
      return { kind: 'threw', message: (error as Error).message };
    }
  }

  const engineOf = (ctx: Ctx): string =>
    (ctx.get(WorkflowEnginePort as never, { strict: false }) as object).constructor.name;

  const resolvable = (ctx: Ctx, token: unknown): boolean => {
    try {
      ctx.get(token as never, { strict: false });
      return true;
    } catch {
      return false;
    }
  };

  /**
   * Goi khach THAT cua Ultty — tu 23/08/2026 no DA khai `integrations.workflowEngine`, va
   * `deploy-remote.sh:108` rsync dung goi nay sang CA `zalo-ultty` (production) lan
   * `zalo-ultty-gd1-test`. Nen day khong phai mot fixture: day la CAU HINH PRODUCTION.
   */
  const useRealUlttyPack = (): void => {
    delete process.env.TENANT_DIR;
    process.env.TENANT = 'ultty';
    resetTenantCache();
  };

  /** Khach CHUA khai workflow. Phai la fixture rieng — `ultty` khong con dong vai nay duoc. */
  const useTenantWithoutWorkflow = (): void => {
    delete process.env.TENANT;
    process.env.TENANT_DIR = resolve(FIXTURES, 'knowledge-only');
    resetTenantCache();
  };

  const useTenantWithWorkflow = (): void => {
    delete process.env.TENANT;
    process.env.TENANT_DIR = WORKFLOW_FIXTURE;
    resetTenantCache();
  };

  // ------------------------------------------------- A · khach khong khai workflow

  it('A — GOI KHACH THAT cua Ultty + cong tac off = cau hinh PRODUCTION: khong doi token, ban giao bao dung ly do', async () => {
    useRealUlttyPack();
    // Va KHONG co token. Day la mot nua cua khang dinh: khach khong dung engine thi khong phai
    // cau hinh gi ca — nguoc lai thi moi khach deu phai mang mot bien ma ho khong dung toi.
    delete process.env.WORKFLOW_ENGINE_TOKEN;

    context = await boot();

    const port = context.get(WorkflowEnginePort as never, { strict: false });
    expect(port).toBeInstanceOf(DisabledWorkflowEngineAdapter);

    // Ban giao tra ve MA LY DO dung, khong phai chi "khong no". Phan biet duoc "khach nay khong
    // chay khuon nay" voi "co gi do hong" la ca diem cua `HandoffReason`.
    const handoff = context.get(WorkflowHandoffService as never, {
      strict: false,
    }) as WorkflowHandoffService;
    const result = await handoff.handoff({
      workflowKey: 'integration-handoff',
      operation: 'sync',
      entityType: 'work-item',
      entityId: 'WI-di-a',
    });
    expect(result.outcome).toBe('skipped');
    expect(result.reason).toBe('NO_TENANT_BINDING');
  }, 90_000);

  it('A2 — khach CHUA khai workflow nhung cong tac ON: VAN none, va boot khong nem', async () => {
    // Hai cong doc lap. Bat cong tac o mot khach chua khai workflow khong duoc de ra mot engine
    // tu hu khong, va cung khong duoc lam sap tien trinh — do la mot cau hinh HOP LE (mot stack
    // dung chung mot bo bien moi truong cho nhieu khach).
    useTenantWithoutWorkflow();
    process.env[WORKFLOW_ENGINE_SWITCH_ENV] = 'on';
    delete process.env.WORKFLOW_ENGINE_TOKEN;

    const outcome = await bootOutcome();

    expect(outcome.kind).toBe('booted');
    expect(engineOf(context as Ctx)).toBe('DisabledWorkflowEngineAdapter');
  }, 90_000);

  // ------------------------------------------------- B · khach khai hatchet, DU token

  it('B1 — khach KHAI hatchet va DU token nhung cong tac OFF (mac dinh): cong VAN la ban vo hieu hoa', async () => {
    // ⇐ KHANG DINH CUA Q1-A, va la o quan trong nhat ca bang.
    //
    // `tenants/ultty/tenant.json` duoc rsync sang CA HAI stack. Neu bai nay doi thanh
    // `HatchetWorkflowEngineAdapter` thi lan deploy production ke tiep se vu trang dispatcher
    // tren `zalo-ultty` — noi khong co engine nao de goi — va `WorkflowScheduler` se that bai
    // moi 5 giay, lam day log cua khach vi mot tinh nang khong ai bat.
    useTenantWithWorkflow();
    process.env.WORKFLOW_ENGINE_TOKEN = 'token-gia-khong-bao-gio-duoc-dung';
    // KHONG dat cong tac — day chinh la trang thai cua production.

    context = await boot();

    expect(engineOf(context)).toBe('DisabledWorkflowEngineAdapter');
  }, 90_000);

  it('B2 — khach KHAI hatchet, DU token, cong tac ON: cong la adapter that, dispatcher va bo dem co mat', async () => {
    useTenantWithWorkflow();
    process.env.WORKFLOW_ENGINE_TOKEN = 'token-gia-khong-bao-gio-duoc-dung';
    process.env[WORKFLOW_ENGINE_SWITCH_ENV] = 'on';

    context = await boot();

    const port = context.get(WorkflowEnginePort as never, { strict: false });
    // KHONG phai ban vo hieu hoa — do la toan bo khac biet giua B1 va B2.
    expect(port).not.toBeInstanceOf(DisabledWorkflowEngineAdapter);
    expect(engineOf(context)).toBe('HatchetWorkflowEngineAdapter');

    // Duong ban giao co du ca ba mat xich phia Nexagnet.
    expect(resolvable(context, WorkflowHandoffService)).toBe(true);
    expect(resolvable(context, WorkflowDispatcher)).toBe(true);
    expect(resolvable(context, WorkflowScheduler)).toBe(true);
  }, 90_000);

  it('B3 — khoa thao tac mang SLUG THAT cua goi khach, khong phai `unknown`', async () => {
    /*
     * DUONG DAY DAY DU cua ban vá 25/08/2026, do tren do thi Nest THAT.
     *
     * `useTenantWithWorkflow()` dung dung bo bien ma container that mang: co `TENANT_DIR`, KHONG
     * co `TENANT`, va khong `release.json` nao duoc mount. Truoc khi sua,
     * `WORKFLOW_RUNTIME_IDENTITY` duoc dung tu mot `resolveReleaseIdentity()` khong doc goi
     * khach, nen ca ba nguon deu rong va `tenant` ra `unknown`.
     *
     * `tenant` la CHIEU DAU TIEN cua khoa thao tac. Moi khach cung ghi `unknown` nghia la hai
     * khach sinh ra CUNG mot khoa cho cung mot ma don — tuc cong chong trung cua khach nay nuot
     * mat viec cua khach kia. Do la loi CACH LY DU LIEU, cung ho voi §26.
     */
    useTenantWithWorkflow();
    process.env.WORKFLOW_ENGINE_TOKEN = 'token-gia-khong-bao-gio-duoc-dung';
    process.env[WORKFLOW_ENGINE_SWITCH_ENV] = 'on';

    context = await boot();

    const handoff = context.get(WorkflowHandoffService as never, {
      strict: false,
    }) as WorkflowHandoffService;
    const result = await handoff.handoff({
      workflowKey: 'integration-handoff',
      operation: 'sync',
      entityType: 'work-item',
      entityId: 'WI-danh-tinh',
    });

    expect(result.outcome).toBe('queued');
    // Khang dinh CHINH XAC, khong chi "khac unknown": khoa phai mo dau bang slug cua goi khach
    // dang mount. `workflow-enabled` la slug cua fixture, doc tu `tenant.json` cua chinh no.
    expect(result.operationKey).toMatch(/^workflow-enabled:/);
    expect(result.operationKey).not.toContain('unknown');
  }, 90_000);

  // ------------------------------------------------- C · khach khai hatchet, THIEU token

  it('C1 — THIEU token nhung cong tac OFF: boot BINH THUONG — cong tac tat thi khong doi token', async () => {
    // Day la dieu kien de bat duoc cong tac o gd1-test ma KHONG phai dua token vao moi stack:
    // mot stack da tat cong tac khong duoc phep doi mot bi mat ma no khong dung toi.
    useTenantWithWorkflow();
    delete process.env.WORKFLOW_ENGINE_TOKEN;

    const outcome = await bootOutcome();

    expect(outcome.kind).toBe('booted');
    expect(engineOf(context as Ctx)).toBe('DisabledWorkflowEngineAdapter');
  }, 90_000);

  it('C2 — cong tac ON nhung THIEU token: boot NEM ngay, khong am tham roi ve `none`', async () => {
    useTenantWithWorkflow();
    process.env[WORKFLOW_ENGINE_SWITCH_ENV] = 'on';
    // `credentialRef` cua goi khach tro toi bien nay. Khong dat no = ha tang chua cau hinh xong.
    delete process.env.WORKFLOW_ENGINE_TOKEN;

    // Fail-fast, va thong bao phai NOI RA phai lam gi. Mot he thong roi ve `none` o day se boot
    // xanh roi lang le khong ban giao gi — hong mot cach im lang la hong te nhat.
    const outcome = await bootOutcome();

    expect(outcome.kind).toBe('threw');
    expect(outcome.kind === 'threw' ? outcome.message : '').toMatch(
      /WORKFLOW_ENGINE_TOKEN_MISSING/,
    );
  }, 90_000);
});
