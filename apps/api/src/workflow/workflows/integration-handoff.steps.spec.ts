import { describe, expect, it, vi } from 'vitest';
import { buildOperationKey } from '../operation-key.js';
import {
  HandoffStepFailed,
  destinationEnvName,
  dispatchHandoff,
  recomputeOperationKey,
  resolveDestination,
} from './integration-handoff.steps.js';

/**
 * LOGIC BA BUOC cua `integration-handoff`, tach khoi Hatchet co chu dich.
 *
 * Buoc cua mot workflow la noi TAC DUNG PHU THAT xay ra — no goi mot he ngoai. Neu logic do chi
 * chay duoc ben trong mot callback cua SDK thi moi che do hong cua no (500, 429, treo, dich den
 * chua cau hinh) chi kiem duoc bang cach dung ca mot engine. Nen: ham thuan o day, adapter mong
 * o `hatchet/` chi noi day.
 *
 * Cung ly do voi `hatchet-workflow-engine.adapter.ts` — ten nha cung cap khong duoc lan ra ngoai
 * thu muc adapter.
 */

const INPUT = {
  tenant: 'workflow-enabled',
  entityType: 'work-item',
  entityId: 'WI-001',
  operation: 'sync',
  operationVersion: 1,
  destination: 'proof-endpoint',
} as const;

const METADATA = {
  traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
  'nexagnet.traceId': '4bf92f3577b34da6a3ce929d0e0e4736',
  'nexagnet.tenant': 'workflow-enabled',
  'nexagnet.environment': 'test',
  'nexagnet.workflowKey': 'integration-handoff',
  'nexagnet.workflowVersion': 'v1',
} as const;

// ------------------------------------------------------------------ 1. resolve

describe('resolveDestination', () => {
  it('doi TEN LOGIC thanh ten bien moi truong theo mot quy tac duy nhat', () => {
    // Quy tac phai o mot cho: neu doi ten bien o compose ma quen doi o code (hoac nguoc lai) thi
    // dich den bien mat im lang. Ham nay la cho duy nhat biet quy tac do.
    expect(destinationEnvName('proof-endpoint')).toBe('WORKFLOW_DESTINATION_PROOF_ENDPOINT');
    expect(destinationEnvName('erp-primary')).toBe('WORKFLOW_DESTINATION_ERP_PRIMARY');
  });

  it('NEM DESTINATION_NOT_CONFIGURED khi bien khong duoc dat', () => {
    // Day la che do hong hay gap nhat khi len khach moi: goi khach khai dich den, ha tang chua
    // cau hinh URL. No phai co MOT ma rieng, doc len la biet phai sua o dau.
    expect(() => resolveDestination('proof-endpoint', {})).toThrow(HandoffStepFailed);
    try {
      resolveDestination('proof-endpoint', {});
    } catch (error) {
      expect((error as HandoffStepFailed).reason).toBe('DESTINATION_NOT_CONFIGURED');
      // Thong diep phai goi ten bien phai dat, khong bat nguoi doc di do.
      expect((error as HandoffStepFailed).message).toContain('WORKFLOW_DESTINATION_PROOF_ENDPOINT');
    }
  });

  it('NEM khi gia tri khong phai URL http(s) — cau hinh sai chu khong phai loi he ngoai', () => {
    const bad = { WORKFLOW_DESTINATION_PROOF_ENDPOINT: 'khong-phai-url' };
    expect(() => resolveDestination('proof-endpoint', bad)).toThrow(/DESTINATION_NOT_CONFIGURED/);

    const wrongScheme = { WORKFLOW_DESTINATION_PROOF_ENDPOINT: 'file:///etc/passwd' };
    expect(() => resolveDestination('proof-endpoint', wrongScheme)).toThrow(
      /DESTINATION_NOT_CONFIGURED/,
    );
  });

  it('tra ve URL khi cau hinh dung', () => {
    const env = { WORKFLOW_DESTINATION_PROOF_ENDPOINT: 'http://localhost:8745/handoff' };
    expect(resolveDestination('proof-endpoint', env)).toBe('http://localhost:8745/handoff');
  });
});

// ------------------------------------------------- 2. dung lai khoa thao tac

describe('recomputeOperationKey', () => {
  it('dung lai DUNG khoa ma cau noi da sinh — day la bang chung khoa co tinh tat dinh', () => {
    // Khoa KHONG duoc mang di hai lan. Neu worker nhan khoa kem theo input thi ta chi chung minh
    // duoc "chuoi di duoc tu A sang B", chu khong chung minh duoc no TAT DINH. Dung lai duoc tu
    // cung mot bo chieu moi la bang chung that.
    const expected = buildOperationKey({
      tenant: INPUT.tenant,
      environment: 'test',
      workflowKey: 'integration-handoff',
      operationVersion: INPUT.operationVersion,
      entityType: INPUT.entityType,
      entityId: INPUT.entityId,
      operation: INPUT.operation,
      destination: INPUT.destination,
    });

    expect(recomputeOperationKey(INPUT, METADATA)).toBe(expected);
  });

  it('NEM khi thieu moi truong trong metadata — khong duoc doan mot chieu cua khoa', () => {
    // Doan `production` (hay bat ky mac dinh nao) o day nghia la gd1-test va pilot dung chung
    // khoa cho cung mot thuc the — tuc la mot moi truong co the lam moi truong kia bi bo qua vi
    // "da lam roi".
    const { 'nexagnet.environment': _omitted, ...withoutEnvironment } = METADATA;
    expect(() => recomputeOperationKey(INPUT, withoutEnvironment)).toThrow(/environment/i);
  });
});

// ----------------------------------------------------------------- 3. dispatch

/** Dung `Response` that de test khong tu dinh nghia lai hop dong cua fetch. */
const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const dispatchArgs = {
  url: 'http://localhost:8745/handoff',
  operationKey: 'workflow-enabled:test:integration-handoff:v1:work-item:WI-001:sync:proof-endpoint',
  traceparent: METADATA.traceparent,
  input: INPUT,
};

describe('dispatchHandoff', () => {
  it('gui Idempotency-Key va traceparent — hai soi day khong duoc dut o buoc nay', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { externalRef: 'EXT-1' }));

    await dispatchHandoff(dispatchArgs, { fetchImpl });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    // Khoa idempotency la cua NEXAGNET. Neu no khong roi khoi may thi he ngoai khong co cach
    // nao chan trung, va at-least-once cua engine tro thanh don trung.
    expect(headers.get('idempotency-key')).toBe(dispatchArgs.operationKey);
    expect(headers.get('traceparent')).toBe(METADATA.traceparent);
  });

  it('tra externalRef khi he ngoai chap nhan', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { externalRef: 'EXT-42' }));
    const result = await dispatchHandoff(dispatchArgs, { fetchImpl });
    expect(result.externalRef).toBe('EXT-42');
  });

  it('500 -> UPSTREAM_5XX (dang thu lai duoc)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(500, { error: 'boom' }));
    await expect(dispatchHandoff(dispatchArgs, { fetchImpl })).rejects.toMatchObject({
      reason: 'UPSTREAM_5XX',
      retryable: true,
    });
  });

  it('429 -> RATE_LIMITED, tach khoi 5xx vi cach xu ly khac han', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(429, { error: 'slow down' }));
    await expect(dispatchHandoff(dispatchArgs, { fetchImpl })).rejects.toMatchObject({
      reason: 'RATE_LIMITED',
      retryable: true,
    });
  });

  it('400 -> UPSTREAM_4XX va KHONG thu lai — thu lai mot payload sai la lang phi', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(400, { error: 'bad request' }));
    await expect(dispatchHandoff(dispatchArgs, { fetchImpl })).rejects.toMatchObject({
      reason: 'UPSTREAM_4XX',
      retryable: false,
    });
  });

  it('he ngoai treo -> UPSTREAM_TIMEOUT, khong phai mot loi mang chung chung', async () => {
    const abortError = Object.assign(new Error('The operation was aborted'), {
      name: 'AbortError',
    });
    const fetchImpl = vi.fn().mockRejectedValue(abortError);
    await expect(dispatchHandoff(dispatchArgs, { fetchImpl })).rejects.toMatchObject({
      reason: 'UPSTREAM_TIMEOUT',
      retryable: true,
    });
  });

  it('KHONG gui du lieu nghiep vu tho — chi tham chieu da qua bien gioi rieng tu', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { externalRef: 'EXT-1' }));
    await dispatchHandoff(dispatchArgs, { fetchImpl });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    // Than yeu cau chi duoc mang DUNG cac truong cua hop dong dau vao. Mot truong la o day
    // nghia la co ai do da nhet du lieu vao sau bien gioi rieng tu.
    expect(Object.keys(body).sort()).toEqual(
      ['destination', 'entityId', 'entityType', 'operation', 'operationVersion', 'tenant'].sort(),
    );
  });
});
