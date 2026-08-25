import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * DIA CHI REST cua engine phai KHAI DUOC RIENG, khong duoc suy tu token.
 *
 * ---------------------------------------------------------------------------
 * LOI DA XAY RA THAT (gd1-test, 25/08/2026 — do bang mot lan chay that):
 *
 * `HatchetClient.init()` nhan `host_port` (gRPC) nhung KHONG nhan `api_url`. Thieu `api_url`,
 * SDK lay goc REST tu claim `server_url` trong chinh token — va gia tri do la TEN MIEN CONG KHAI
 * cua dashboard, von nam sau basic-auth cua Caddy.
 *
 * Hau qua:
 *
 *     gRPC  (kich hoat run)   -> chay tot, co `engineRunId` that
 *     REST  (`describeRun`)   -> 401, LUON LUON
 *
 * Va vi `WorkflowRunLookup.statusOf()` fail-open, khong co gi do o dau ca: man hinh chan doan chi
 * lang le thieu mat `engineStatus` kem ghi chu "khong hoi duoc engine". Nguoi doc ket luan engine
 * dang hong, trong khi engine chay hoan hao — run `2b5daa93` da `COMPLETED` voi ca ba buoc
 * `COMPLETED`. Chan doan chi sai duong dung luc no phai dung nhat.
 *
 * ---------------------------------------------------------------------------
 * VI SAO PHAI LA MOT BAI KIEM chu khong phai mot dong cau hinh doc cho ky:
 *
 * Thieu `api_url` KHONG lam do bat cu bai kiem nao khac va KHONG chan boot. No chi bieu hien
 * thanh mot truong vang mat tren mot man hinh chan doan. Do la dung loai loi phai khoa bang bai
 * kiem, vi khong con thu gi khac bat duoc no.
 */

const init = vi.fn();

vi.mock('./hatchet-sdk.js', () => ({
  HatchetClient: {
    init: (...args: unknown[]) => {
      init(...args);
      return {
        // Chi can du de `describeRun` di toi duoc lan goi REST; noi dung khong phai thu dang kiem.
        runs: { get: () => Promise.resolve({ run: { status: 'COMPLETED' } }) },
      };
    },
  },
}));

const { HatchetWorkflowEngineAdapter } = await import('./hatchet-workflow-engine.adapter.js');

const RUN_ID = '2b5daa93-d07a-457b-a72e-17fc34dfe18f';
const TOKEN = 'test-token';

/** Doc cau hinh MA ADAPTER THUC SU dua cho SDK, sau khi da ep no khoi tao client. */
async function initConfigOf(
  config: ConstructorParameters<typeof HatchetWorkflowEngineAdapter>[0],
): Promise<Record<string, unknown>> {
  const adapter = new HatchetWorkflowEngineAdapter(config);
  // Client khoi tao TRE — phai goi mot duong that thi `init` moi chay.
  await adapter.describeRun(RUN_ID);
  expect(init).toHaveBeenCalledTimes(1);
  return init.mock.calls[0]![0] as Record<string, unknown>;
}

beforeEach(() => {
  init.mockClear();
});

describe('HatchetWorkflowEngineAdapter — dia chi REST cua engine', () => {
  it('dua `api_url` cho SDK khi ha tang khai dia chi REST noi bo', async () => {
    const passed = await initConfigOf({
      token: TOKEN,
      hostPort: 'hatchet-engine:7070',
      apiUrl: 'http://hatchet-dashboard',
      tlsStrategy: 'none',
    });

    // `api_url` — TEN CUA SDK (snake_case, theo `ClientConfigSchema`), khong phai ten cua ta.
    expect(passed.api_url).toBe('http://hatchet-dashboard');
    // gRPC va REST la HAI dia chi khac nhau; dat `api_url` khong duoc dong toi `host_port`.
    expect(passed.host_port).toBe('hatchet-engine:7070');
  });

  it('KHONG dat `api_url` khi ha tang chua khai — giu nguyen hanh vi suy tu token', async () => {
    const passed = await initConfigOf({
      token: TOKEN,
      hostPort: 'hatchet-engine:7070',
      tlsStrategy: 'none',
    });

    // Vang mat, KHONG phai chuoi rong: `api_url: ''` se de SDK lay goc rong thay vi rot ve duong
    // suy-tu-token, tuc bien mot ban trien khai dang chay binh thuong thanh hong.
    expect(passed).not.toHaveProperty('api_url');
  });

  it('`dashboardBaseUrl` va `apiUrl` la HAI thu khac nhau, khong duoc dung lan', async () => {
    const passed = await initConfigOf({
      token: TOKEN,
      apiUrl: 'http://hatchet-dashboard',
      // Duong CHO NGUOI BAM — cong khai, sau basic-auth. Dung no lam goc REST chinh la loi goc.
      dashboardBaseUrl: 'https://workflow-ultty-gd1-test.35-187-235-82.sslip.io',
    });

    expect(passed.api_url).toBe('http://hatchet-dashboard');
    expect(passed.api_url).not.toBe('https://workflow-ultty-gd1-test.35-187-235-82.sslip.io');
  });
});
