import { describe, expect, it } from 'vitest';
import { RecentTracesSink, type StoredTrace } from '../observability/recent-traces.sink.js';
import { TelemetryService } from '../observability/telemetry.service.js';
import { SALES_ORDER_DECISIONS } from '../orders/sales-order-decisions.js';
import type { WorkflowRunFacts } from '../workflow/workflow-run-lookup.service.js';
import { buildOrderDebugView } from './order-debug.builder.js';

/**
 * MAN HINH "LUONG XU LY" — phep GHEP, khong phai phep thu thap.
 *
 * Moi thu o day da ton tai o cho khac: luot nam trong `RecentTracesSink`, ban giao nam trong
 * bang outbox, nhan tieng Viet nam trong `workflow-catalog`. Bai kiem nay giu ba dieu ma phep
 * ghep rat de lam hong:
 *
 *   ① KHONG BIA. So muc hien ra phai bang so bang chung co that. Mot man hinh chan doan noi doi
 *      te hon mot man hinh trong, vi no lam nguoi ta ngung tim.
 *   ② KHONG NUOT. Thieu du lieu phai HIEN RA la thieu, khong duoc im lang bo qua.
 *   ③ THOI GIAN DUNG NGHIA. Mot lan cho ben vung 96 giay khong duoc bao cao thanh 96 mili giay.
 */

const TENANT = 'khach-test';
const ENVIRONMENT = 'moi-truong-test';
const ORDER_ID = 'don-7';

function telemetryWith(sink: RecentTracesSink): TelemetryService {
  const telemetry = new TelemetryService();
  telemetry.configure({
    release: { tenant: TENANT, environment: ENVIRONMENT, gitSha: 'a'.repeat(40), source: 'manifest' },
    privacy: 'full',
    sinks: [sink],
  });
  return telemetry;
}

/** Luot GOC: tin vao, quyet dinh, bam duyet. Khong co `causationTraceId`. */
async function rootTurn(telemetry: TelemetryService): Promise<void> {
  await telemetry.runTurn({ chatId: 'nhom-1', channel: 'zca_listener' }, async () => {
    telemetry.enrich({ orderId: ORDER_ID });
    await telemetry.step('order.approve', async () => {
      telemetry.decision({
        vocabulary: SALES_ORDER_DECISIONS,
        point: 'order.manual_approve',
        outcome: 'allowed',
        reason: 'ROUTED_TO_CONFIRMATION',
      });
    });
  });
}

/** Luot DAN XUAT: worker workflow goi nguoc ve, mang `causationTraceId` cua luot goc. */
async function workerTurn(telemetry: TelemetryService, causationTraceId: string): Promise<void> {
  await telemetry.runTurn(
    { orderId: ORDER_ID, channel: 'workflow_worker', causationTraceId },
    async () => {
      await telemetry.step('order.handoff_followup', async () => {
        telemetry.decision({
          vocabulary: SALES_ORDER_DECISIONS,
          point: 'order.handoff_followup_mark',
          outcome: 'allowed',
          reason: 'FOLLOWUP_MARKED',
        });
      });
    },
  );
}

function workflowRun(overrides: Partial<WorkflowRunFacts> = {}): WorkflowRunFacts {
  return {
    key: 'sales-handoff-followup',
    version: 'v1',
    operationKey: `${TENANT}:${ENVIRONMENT}:sales-handoff-followup:v1:sales-handoff:${ORDER_ID}:followup-reminder:nexagnet-api`,
    handoffStatus: 'dispatched',
    attempts: 1,
    queuedAt: new Date('2026-08-25T10:00:02.000Z'),
    dispatchedAt: new Date('2026-08-25T10:00:06.000Z'),
    engineRunId: 'run-abc-123',
    lastError: null,
    ...overrides,
  };
}

/** Dat lai moc thoi gian cua luot de bai kiem khong phu thuoc dong ho that. */
function withStartedAt(stored: StoredTrace, at: string): StoredTrace {
  return {
    ...stored,
    startedAt: at,
    records: stored.records.map((record) => ({ ...record, at })),
  };
}

async function twoTurns(): Promise<readonly StoredTrace[]> {
  const sink = new RecentTracesSink();
  const telemetry = telemetryWith(sink);
  await rootTurn(telemetry);
  const root = sink.findAllByOrderId(ORDER_ID)[0]!;
  await workerTurn(telemetry, root.traceId);
  const [first, second] = sink.findAllByOrderId(ORDER_ID);
  return [
    withStartedAt(first!, '2026-08-25T10:00:02.000Z'),
    withStartedAt(second!, '2026-08-25T10:01:38.000Z'),
  ];
}

/**
 * Hai luot CACH NHAU 2 GIAY — dung hinh dang cua mot luot that co workflow ben duoi.
 *
 * Callback cua worker duoc noi vao mach hoi thoai dang co chu khong sinh mot luot moi sau lan
 * cho, nen khoang giua cac luot con giu duoc la VAI GIAY trong khi workflow chay hang PHUT. Do
 * la ly do khong duoc suy thoi gian workflow tu timestamp cua luot.
 */
async function shortTurns(): Promise<readonly StoredTrace[]> {
  const sink = new RecentTracesSink();
  const telemetry = telemetryWith(sink);
  await rootTurn(telemetry);
  const root = sink.findAllByOrderId(ORDER_ID)[0]!;
  await workerTurn(telemetry, root.traceId);
  const [first, second] = sink.findAllByOrderId(ORDER_ID);
  return [
    withStartedAt(first!, '2026-08-25T10:00:00.000Z'),
    withStartedAt(second!, '2026-08-25T10:00:02.000Z'),
  ];
}

describe('luong xu ly — khong bia su kien', () => {
  it('so luot hien ra bang so luot CO THAT trong vong dem', async () => {
    const view = buildOrderDebugView({
      orderId: ORDER_ID,
      traces: await twoTurns(),
      workflowRuns: [],
    });

    expect(view.turns).toHaveLength(2);
    expect(view.durations.turnCount).toBe(2);
  });

  it('khong co ban giao nao thi khong ve ra workflow nao', async () => {
    const view = buildOrderDebugView({
      orderId: ORDER_ID,
      traces: await twoTurns(),
      workflowRuns: [],
    });

    expect(view.workflows).toEqual([]);
  });

  it('luot xep theo thoi gian THAT, cu nhat truoc', async () => {
    const view = buildOrderDebugView({
      orderId: ORDER_ID,
      traces: await twoTurns(),
      workflowRuns: [],
    });

    expect(view.turns.map((turn) => turn.startedAt)).toEqual([
      '2026-08-25T10:00:02.000Z',
      '2026-08-25T10:01:38.000Z',
    ]);
    expect(view.turns[0]!.derived).toBe(false);
    expect(view.turns[1]!.derived).toBe(true);
  });

  it('kenh cua tung luot duoc dich sang tieng Viet, giu ma goc ben canh', async () => {
    const view = buildOrderDebugView({
      orderId: ORDER_ID,
      traces: await twoTurns(),
      workflowRuns: [],
    });

    expect(view.turns[0]!.channelLabel).toBe('Tin nhắn Zalo');
    expect(view.turns[0]!.channel).toBe('zca_listener');
    expect(view.turns[1]!.channelLabel).toBe('Worker workflow');
    expect(view.turns[1]!.channel).toBe('workflow_worker');
  });
});

describe('luong xu ly — thieu du lieu thi NOI RA', () => {
  it('khong con luot nao thi tra ve rong kem ghi chu, khong nem', () => {
    const view = buildOrderDebugView({ orderId: ORDER_ID, traces: [], workflowRuns: [] });

    expect(view.turns).toEqual([]);
    expect(view.notes.join(' ')).toContain('bộ đệm');
  });

  it('luot dau tien la luot DAN XUAT thi bao rang luot goc da mat', async () => {
    const sink = new RecentTracesSink();
    const telemetry = telemetryWith(sink);
    // Chi co luot worker — mo phong API restart giua luc duyet va luc callback.
    await workerTurn(telemetry, 'a'.repeat(32));

    const view = buildOrderDebugView({
      orderId: ORDER_ID,
      traces: sink.findAllByOrderId(ORDER_ID),
      workflowRuns: [],
    });

    expect(view.turns[0]!.derived).toBe(true);
    expect(view.notes.join(' ')).toContain('lượt gốc');
  });

  it('khong biet tenant/moi truong thi noi "chua xac dinh", khong doan', () => {
    const view = buildOrderDebugView({ orderId: ORDER_ID, traces: [], workflowRuns: [] });

    expect(view.tenant).toBe('chưa xác định');
    expect(view.environment).toBe('chưa xác định');
    expect(view.release).toBeUndefined();
  });

  it('ghi chu cua noi goi (vi du khong hoi duoc engine) duoc giu nguyen', async () => {
    const view = buildOrderDebugView({
      orderId: ORDER_ID,
      traces: await twoTurns(),
      workflowRuns: [workflowRun()],
      notes: ['Không hỏi được engine lúc này.'],
    });

    expect(view.notes).toContain('Không hỏi được engine lúc này.');
  });
});

describe('luong xu ly — nghia cua thoi gian', () => {
  /*
   * BA CON SO, BA CAU HOI KHAC NHAU. Ban truoc gop hai trong so do lam mot va noi doi:
   * no lay hieu timestamp cua cac LUOT roi dan nhan "co bao gom ca lan cho ben vung".
   *
   * Voi mot workflow that (`sales-handoff-followup.v1`, `remindAfterSeconds = 90`) thi lan cho
   * ben vung KHONG sinh them mot luot sau khi cho: callback cua worker duoc noi vao dung mach
   * hoi thoai dang co. Nen hieu timestamp giua cac luot ra ~2 giay trong khi workflow that su
   * chay ~95 giay — va man hinh bao cao 2 giay do la "thoi gian co ca lan cho".
   *
   * Ba con so tu day tro di:
   *   `synchronousMs`            may lam viec trong mot luot. KHONG BAO GIO gom lan cho.
   *   `engineDurationMs`         cua CHINH engine: startedAt -> finishedAt. CO gom lan cho.
   *   `turnIntervalMs`           khoang giua cac luot CON GIU DUOC. Khong phai thoi gian workflow.
   */

  it('thoi gian DONG BO lay tu luot goc, khong bao trum lan cho ben vung', async () => {
    const view = buildOrderDebugView({
      orderId: ORDER_ID,
      traces: await twoTurns(),
      workflowRuns: [workflowRun()],
    });

    // Luot goc chay xong trong vai mili giay — con so nay phai nho, va no do MAY LAM VIEC.
    expect(view.durations.synchronousMs).toBeLessThan(5_000);
  });

  it('thoi gian WORKFLOW lay tu moc cua ENGINE, khong suy tu cac luot', async () => {
    const view = buildOrderDebugView({
      orderId: ORDER_ID,
      traces: await twoTurns(),
      workflowRuns: [
        workflowRun({
          engineStatus: 'COMPLETED',
          engineStartedAt: '2026-08-25T10:00:02.000Z',
          engineFinishedAt: '2026-08-25T10:01:37.000Z',
        }),
      ],
    });

    const run = view.workflows[0]!;
    // 10:00:02 -> 10:01:37 = 95 giay. Day la con so THAT cua mot lan cho ben vung 90 giay
    // cong phan xu ly hai dau — va no chi ra duoc tu moc cua engine.
    expect(run.engineDurationMs).toBe(95_000);
    expect(run.engineStartedAt).toBe('2026-08-25T10:00:02.000Z');
    expect(run.engineFinishedAt).toBe('2026-08-25T10:01:37.000Z');
  });

  it('thoi gian WORKFLOW khac han khoang giua cac luot — khong duoc lay cai nay thay cai kia', async () => {
    const view = buildOrderDebugView({
      orderId: ORDER_ID,
      traces: await shortTurns(),
      workflowRuns: [
        workflowRun({
          engineStatus: 'COMPLETED',
          engineStartedAt: '2026-08-25T10:00:02.000Z',
          engineFinishedAt: '2026-08-25T10:01:37.000Z',
        }),
      ],
    });

    // Hai luot cach nhau 2 giay; workflow chay 95 giay. Neu hai con so nay bang nhau thi mot
    // trong hai dang duoc suy ra tu cai kia — dung cai loi ban nay di sua.
    expect(view.durations.turnIntervalMs).toBe(2_000);
    expect(view.workflows[0]!.engineDurationMs).toBe(95_000);
  });

  it('workflow DANG CHAY thi khong co thoi luong — khong lay dong ho luc mo man hinh', async () => {
    const view = buildOrderDebugView({
      orderId: ORDER_ID,
      traces: await twoTurns(),
      workflowRuns: [
        workflowRun({
          engineStatus: 'RUNNING',
          engineStartedAt: '2026-08-25T10:00:02.000Z',
        }),
      ],
    });

    const run = view.workflows[0]!;
    expect(run.engineStartedAt).toBe('2026-08-25T10:00:02.000Z');
    expect(run.engineFinishedAt).toBeUndefined();
    // Do bang `Date.now()` se cho ra mot con so LON DAN moi lan bam F5 — mot phep do gia.
    expect(run.engineDurationMs).toBeUndefined();
  });

  it('engine khong cho moc thoi gian thi KHONG bia thoi luong', async () => {
    const view = buildOrderDebugView({
      orderId: ORDER_ID,
      traces: await twoTurns(),
      // Khong hoi duoc engine: khong `engineStatus`, khong moc nao ca.
      workflowRuns: [workflowRun()],
    });

    const run = view.workflows[0]!;
    expect(run.engineStartedAt).toBeUndefined();
    expect(run.engineFinishedAt).toBeUndefined();
    expect(run.engineDurationMs).toBeUndefined();
  });

  it('moc thoi gian HONG cua engine bi bo qua, khong lam sap man hinh', async () => {
    const view = buildOrderDebugView({
      orderId: ORDER_ID,
      traces: await twoTurns(),
      workflowRuns: [
        workflowRun({
          engineStatus: 'COMPLETED',
          engineStartedAt: 'khong-phai-ngay',
          engineFinishedAt: '2026-08-25T10:01:37.000Z',
        }),
      ],
    });

    // Man hinh chan doan phai chiu duoc du lieu xau: mot `NaN` roi xuong giao dien te hon
    // nhieu so voi mot o "chua xac dinh".
    expect(view.workflows[0]!.engineDurationMs).toBeUndefined();
  });

  it('moc ket thuc TRUOC moc bat dau la du lieu xau — khong bao thoi luong am', async () => {
    const view = buildOrderDebugView({
      orderId: ORDER_ID,
      traces: await twoTurns(),
      workflowRuns: [
        workflowRun({
          engineStatus: 'COMPLETED',
          engineStartedAt: '2026-08-25T10:01:37.000Z',
          engineFinishedAt: '2026-08-25T10:00:02.000Z',
        }),
      ],
    });

    expect(view.workflows[0]!.engineDurationMs).toBeUndefined();
  });

  it('nhieu lan ban giao thi moi lan mang thoi luong CUA CHINH NO', async () => {
    const view = buildOrderDebugView({
      orderId: ORDER_ID,
      traces: await twoTurns(),
      workflowRuns: [
        workflowRun({
          operationKey: 'op-1',
          engineStatus: 'COMPLETED',
          engineStartedAt: '2026-08-25T10:00:02.000Z',
          engineFinishedAt: '2026-08-25T10:01:37.000Z',
        }),
        workflowRun({
          operationKey: 'op-2',
          engineStatus: 'RUNNING',
          engineStartedAt: '2026-08-25T10:05:00.000Z',
        }),
      ],
    });

    expect(view.workflows.map((run) => run.engineDurationMs)).toEqual([95_000, undefined]);
  });

  it('don khong co workflow nao thi khong co thoi luong workflow nao', async () => {
    const view = buildOrderDebugView({
      orderId: ORDER_ID,
      traces: await twoTurns(),
      workflowRuns: [],
    });

    expect(view.workflows).toEqual([]);
    expect(view.durations.synchronousMs).toBeDefined();
  });

  it('khoang giua cac LUOT do dung cai no noi la do — moc dau toi moc cuoi', async () => {
    const view = buildOrderDebugView({
      orderId: ORDER_ID,
      traces: await twoTurns(),
      workflowRuns: [workflowRun()],
    });

    // 10:00:02 -> 10:01:38 = 96 giay. Con so nay VAN dung; cai sai la cau noi kem theo no.
    expect(view.durations.turnIntervalMs).toBe(96_000);
    expect(view.durations.turnIntervalMs!).toBeGreaterThan(view.durations.synchronousMs!);
  });

  it('chi mot luot thi KHONG bao khoang giua cac luot — 0 se bi doc thanh "xong ngay"', async () => {
    const sink = new RecentTracesSink();
    const telemetry = telemetryWith(sink);
    await rootTurn(telemetry);

    const view = buildOrderDebugView({
      orderId: ORDER_ID,
      traces: sink.findAllByOrderId(ORDER_ID),
      workflowRuns: [],
    });

    expect(view.durations.turnIntervalMs).toBeUndefined();
  });
});

describe('luong xu ly — workflow noi bang tieng Viet, tra cuu bang khoa may', () => {
  it('hien ten nghiep vu tieng Viet VA khoa may, khong chon mot trong hai', async () => {
    const view = buildOrderDebugView({
      orderId: ORDER_ID,
      traces: await twoTurns(),
      workflowRuns: [workflowRun()],
    });

    const run = view.workflows[0]!;
    expect(run.displayName).toBe('Nhắc Sale sau bàn giao');
    expect(run.key).toBe('sales-handoff-followup');
    expect(run.engineName).toBe('sales-handoff-followup.v1');
    expect(run.known).toBe(true);
  });

  it('cac buoc mang nhan tieng Viet, dung thu tu chay, khoa may giu nguyen', async () => {
    const view = buildOrderDebugView({
      orderId: ORDER_ID,
      traces: await twoTurns(),
      workflowRuns: [workflowRun()],
    });

    expect(view.workflows[0]!.steps.map((step) => step.key)).toEqual([
      'load-state',
      'wait',
      'recheck-mark',
    ]);
    expect(view.workflows[0]!.steps.map((step) => step.label)).toEqual([
      'Đọc trạng thái bàn giao',
      'Chờ đến hạn nhắc',
      'Kiểm tra lại và đánh dấu nhắc',
    ]);
  });

  it('khuon chua co metadata van hien duoc, bang chinh khoa may', async () => {
    const view = buildOrderDebugView({
      orderId: ORDER_ID,
      traces: await twoTurns(),
      workflowRuns: [workflowRun({ key: 'khuon-tuong-lai' })],
    });

    expect(view.workflows[0]!.displayName).toBe('khuon-tuong-lai');
    expect(view.workflows[0]!.known).toBe(false);
    expect(view.notes.join(' ')).toContain('khuon-tuong-lai');
  });

  it('trang thai ban giao co nhan tieng Viet kem ma goc', async () => {
    const view = buildOrderDebugView({
      orderId: ORDER_ID,
      traces: await twoTurns(),
      workflowRuns: [workflowRun({ handoffStatus: 'failed', lastError: 'engine tu choi' })],
    });

    expect(view.workflows[0]!.handoffStatus).toBe('failed');
    expect(view.workflows[0]!.handoffStatusLabel).toBe('Bàn giao thất bại');
    expect(view.workflows[0]!.lastError).toBe('engine tu choi');
  });

  it('chua ban giao duoc thi KHONG hien engineRunId gia', async () => {
    const view = buildOrderDebugView({
      orderId: ORDER_ID,
      traces: await twoTurns(),
      workflowRuns: [
        workflowRun({ handoffStatus: 'pending', engineRunId: null, dispatchedAt: null }),
      ],
    });

    expect(view.workflows[0]!.engineRunId).toBeUndefined();
    expect(view.workflows[0]!.dispatchedAt).toBeUndefined();
  });
});

describe('luong xu ly — neo tra cuu', () => {
  it('giu du traceId, engineRunId va operationKey de dan sang he khac', async () => {
    const traces = await twoTurns();
    const view = buildOrderDebugView({
      orderId: ORDER_ID,
      traces,
      workflowRuns: [workflowRun()],
    });

    expect(view.turns.map((turn) => turn.view.traceId)).toEqual(
      traces.map((trace) => trace.traceId),
    );
    expect(view.workflows[0]!.engineRunId).toBe('run-abc-123');
    expect(view.workflows[0]!.operationKey).toContain('sales-handoff-followup');
  });

  it('duong sang dashboard engine chi xuat hien khi ha tang khai URL', async () => {
    const traces = await twoTurns();

    expect(
      buildOrderDebugView({ orderId: ORDER_ID, traces, workflowRuns: [workflowRun()] })
        .workflows[0]!.dashboardUrl,
    ).toBeUndefined();

    expect(
      buildOrderDebugView({
        orderId: ORDER_ID,
        traces,
        workflowRuns: [workflowRun({ dashboardUrl: 'https://engine.example/runs/run-abc-123' })],
      }).workflows[0]!.dashboardUrl,
    ).toBe('https://engine.example/runs/run-abc-123');
  });
});

describe('luong xu ly — da khach va rieng tu', () => {
  it('tenant/moi truong lay tu ban ghi, khong hard-code khach nao', async () => {
    const view = buildOrderDebugView({
      orderId: ORDER_ID,
      traces: await twoTurns(),
      workflowRuns: [workflowRun()],
    });

    expect(view.tenant).toBe(TENANT);
    expect(view.environment).toBe(ENVIRONMENT);
  });

  it('KHONG mang payload/metadata cua ban giao ra ngoai', async () => {
    const view = buildOrderDebugView({
      orderId: ORDER_ID,
      traces: await twoTurns(),
      workflowRuns: [workflowRun()],
    });

    // Hai truong nay la cho PII/bi mat co the lot qua. Chung khong duoc co mat trong mo hinh
    // hien thi, va cach chac chan nhat de giu dieu do la khang dinh no o day.
    const serialized = JSON.stringify(view.workflows[0]);
    expect(serialized).not.toContain('payload');
    expect(serialized).not.toContain('metadata');
  });

  it('khong ro ri khoa/bi mat qua bat ky truong nao', async () => {
    const view = buildOrderDebugView({
      orderId: ORDER_ID,
      traces: await twoTurns(),
      workflowRuns: [workflowRun()],
    });

    const serialized = JSON.stringify(view).toLowerCase();
    for (const forbidden of ['x-api-key', 'authorization', 'bearer ', 'apikey']) {
      expect(serialized, `ro ri '${forbidden}'`).not.toContain(forbidden);
    }
  });
});
