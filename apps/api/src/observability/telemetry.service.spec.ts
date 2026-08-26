import { describe, expect, it } from 'vitest';
import { TelemetryService } from './telemetry.service.js';
import type { TelemetryRecord, TelemetrySink } from './telemetry-record.js';
import { parseTraceparent, toTraceparent } from './trace-context.js';
import { TURN_DECISIONS } from '../turns/turn-decisions.js';
import { SALES_ORDER_DECISIONS } from '../orders/sales-order-decisions.js';

/** Sink thu — giu lai ban ghi trong bo nho de khang dinh. */
class RecordingSink implements TelemetrySink {
  readonly records: TelemetryRecord[] = [];
  record(record: TelemetryRecord): void {
    this.records.push(record);
  }
}

/** Sink HONG — dung de chung minh bat bien fail-open cua muc 20. */
class BrokenSink implements TelemetrySink {
  record(): void {
    throw new Error('backend observability chet');
  }
}

function telemetryWith(
  sinks: readonly TelemetrySink[],
  tenant = 'ultty',
  privacy: 'full' | 'redacted' | 'metadata-only' = 'full',
): TelemetryService {
  const telemetry = new TelemetryService();
  telemetry.configure({
    release: { tenant, environment: 'gd1-test', gitSha: 'a'.repeat(40), source: 'manifest' },
    privacy,
    sinks,
  });
  return telemetry;
}

describe('TelemetryService — mot soi chi xuyen suot', () => {
  it('moi ban ghi trong CUNG mot luot mang CUNG mot traceId', async () => {
    const sink = new RecordingSink();
    const telemetry = telemetryWith([sink]);

    await telemetry.runTurn({ chatId: 'nhom-1' }, async () => {
      await telemetry.step('message.intake', async () => undefined);
      telemetry.decision({
        vocabulary: SALES_ORDER_DECISIONS,
        point: 'order.auto_confirm',
        outcome: 'denied',
        reason: 'QUANTITY_ABOVE_THRESHOLD',
      });
      await telemetry.step('outbound.decide', async () => undefined);
    });

    expect(sink.records).toHaveLength(3);
    const traceIds = new Set(sink.records.map((record) => record.traceId));
    expect(traceIds.size).toBe(1);
    // Khuon W3C: 32 ky tu hex. Khong phai UUID — xem chu thich trong trace-context.ts.
    expect([...traceIds][0]).toMatch(/^[0-9a-f]{32}$/);
  });

  it('HAI luot khac nhau KHONG dung chung traceId', async () => {
    const sink = new RecordingSink();
    const telemetry = telemetryWith([sink]);

    await telemetry.runTurn({ chatId: 'nhom-1' }, async () =>
      telemetry.step('message.intake', async () => undefined),
    );
    await telemetry.runTurn({ chatId: 'nhom-1' }, async () =>
      telemetry.step('message.intake', async () => undefined),
    );

    expect(sink.records[0]!.traceId).not.toBe(sink.records[1]!.traceId);
  });

  it('context di theo chuoi async ma khong phai truyen tham so', async () => {
    const sink = new RecordingSink();
    const telemetry = telemetryWith([sink]);

    await telemetry.runTurn({ chatId: 'nhom-1' }, async () => {
      // Ba lop async long nhau, khong lop nao nhan `traceId` lam doi so.
      await new Promise((resolve) => setTimeout(resolve, 1));
      await (async () => {
        await (async () => {
          telemetry.decision({
            vocabulary: TURN_DECISIONS,
            point: 'message.intake',
            outcome: 'allowed',
            reason: 'ACCEPTED',
          });
        })();
      })();
    });

    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]!.anchors.chatId).toBe('nhom-1');
  });

  it('luot CHAY SONG SONG khong tron context cua nhau', async () => {
    const sink = new RecordingSink();
    const telemetry = telemetryWith([sink]);

    await Promise.all(
      ['nhom-a', 'nhom-b', 'nhom-c'].map((chatId) =>
        telemetry.runTurn({ chatId }, async () => {
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
          telemetry.enrich({ orderId: `don-${chatId}` });
          telemetry.decision({ vocabulary: TURN_DECISIONS, point: 'message.intake', outcome: 'allowed', reason: 'ACCEPTED' });
        }),
      ),
    );

    expect(sink.records).toHaveLength(3);
    for (const record of sink.records) {
      // Neo phai khop voi dung luot cua no — bat bien chong lan du lieu giua cac khach.
      expect(record.anchors.orderId).toBe(`don-${record.anchors.chatId}`);
    }
  });

  it('`enrich` bo sung neo ma KHONG xoa neo da co', async () => {
    const sink = new RecordingSink();
    const telemetry = telemetryWith([sink]);

    await telemetry.runTurn({ chatId: 'nhom-1' }, async () => {
      telemetry.enrich({ intent: 'dat_don' });
      telemetry.enrich({ orderId: 'don-9' });
      telemetry.decision({ vocabulary: TURN_DECISIONS, point: 'message.intake', outcome: 'allowed', reason: 'ACCEPTED' });
    });

    const { anchors } = sink.records[0]!;
    expect(anchors).toMatchObject({ chatId: 'nhom-1', intent: 'dat_don', orderId: 'don-9' });
  });

  it('buoc long nhau tao quan he cha-con de dung duoc cay trace', async () => {
    const sink = new RecordingSink();
    const telemetry = telemetryWith([sink]);

    await telemetry.runTurn({ chatId: 'nhom-1' }, async () => {
      await telemetry.step('pipeline.turn', async () => {
        await telemetry.step('agent.run', async () => undefined);
      });
    });

    const [child, parent] = sink.records as [
      Extract<TelemetryRecord, { type: 'step' }>,
      Extract<TelemetryRecord, { type: 'step' }>,
    ];
    // Con ket thuc TRUOC cha, nen no duoc ghi truoc.
    expect(child.name).toBe('agent.run');
    expect(parent.name).toBe('pipeline.turn');
    expect(child.parentSpanId).toBe(parent.spanId);
  });

  it('span NGOAI CUNG khong co cha — va tuyet doi khong tu lam cha cua chinh no', async () => {
    /*
     * Test nay sinh ra tu mot loi that (21/08/2026), phat hien khi dung `tools/trace-view.mjs`
     * dung cay tu NDJSON: ca cay bi trai phang. Nguyen nhan la span goc mang
     * `parentSpanId === spanId` cua chinh no, do envelope dung `?? scope.currentSpanId` cho ca
     * truong hop "khong co cha".
     *
     * Test nesting o tren KHONG bat duoc, vi no chi khang dinh ve span CON — noi ma
     * `parentSpanId` luon co gia tri that. Cai sai nam o span goc, cho khong ai khang dinh.
     */
    const sink = new RecordingSink();
    const telemetry = telemetryWith([sink]);

    await telemetry.runTurn({}, async () => {
      await telemetry.step('pipeline.turn', async () => {
        await telemetry.step('agent.run', async () => undefined);
      });
    });

    const root = sink.records.find(
      (record) => record.type === 'step' && record.name === 'pipeline.turn',
    )!;
    expect(root.parentSpanId).toBeUndefined();
    expect(root.parentSpanId).not.toBe(root.spanId);
  });

  it('ban ghi diem treo vao BUOC dang chay, khong treo vao goc', async () => {
    const sink = new RecordingSink();
    const telemetry = telemetryWith([sink]);

    await telemetry.runTurn({}, async () => {
      await telemetry.step('agent.run', async () => {
        telemetry.decision({ vocabulary: TURN_DECISIONS, point: 'advisor.compose', outcome: 'allowed', reason: 'COMPOSED' });
      });
    });

    const decision = sink.records.find((record) => record.type === 'decision')!;
    const step = sink.records.find((record) => record.type === 'step')!;
    expect(decision.parentSpanId).toBe(step.spanId);
  });
});

describe('TelemetryService — danh tinh khach & ban trien khai', () => {
  it('moi ban ghi deu mang tenant, environment va release', async () => {
    const sink = new RecordingSink();
    const telemetry = telemetryWith([sink], 'wata');

    await telemetry.runTurn({}, async () =>
      telemetry.step('message.intake', async () => undefined),
    );

    expect(sink.records[0]).toMatchObject({
      tenant: 'wata',
      environment: 'gd1-test',
      release: 'a'.repeat(12),
    });
  });

  it('hai instance khac khach KHONG lam ro ri danh tinh sang nhau', async () => {
    const ulttySink = new RecordingSink();
    const wataSink = new RecordingSink();
    const ultty = telemetryWith([ulttySink], 'ultty');
    const wata = telemetryWith([wataSink], 'wata');

    await Promise.all([
      ultty.runTurn({ chatId: 'nhom-ultty' }, async () =>
        ultty.step('message.intake', async () => undefined),
      ),
      wata.runTurn({ chatId: 'nhom-wata' }, async () =>
        wata.step('message.intake', async () => undefined),
      ),
    ]);

    expect(ulttySink.records.every((record) => record.tenant === 'ultty')).toBe(true);
    expect(wataSink.records.every((record) => record.tenant === 'wata')).toBe(true);
    // Khong ban ghi nao di nham sink.
    expect(ulttySink.records).toHaveLength(1);
    expect(wataSink.records).toHaveLength(1);
    expect(JSON.stringify(ulttySink.records)).not.toContain('wata');
    expect(JSON.stringify(wataSink.records)).not.toContain('ultty');
  });
});

describe('TelemetryService — quyet dinh, trang thai, thay doi du lieu', () => {
  it('quyet dinh mang LY DO CO KIEU, khong phai mot cau van', async () => {
    const sink = new RecordingSink();
    const telemetry = telemetryWith([sink]);

    await telemetry.runTurn({}, async () => {
      telemetry.decision({
        vocabulary: TURN_DECISIONS,
        point: 'advice.auto_reply',
        outcome: 'denied',
        reason: 'COMPOSER_DISABLED',
        detail: { advice_composer: 'off' },
      });
    });

    expect(sink.records[0]).toMatchObject({
      type: 'decision',
      point: 'advice.auto_reply',
      outcome: 'denied',
      reason: 'COMPOSER_DISABLED',
    });
  });

  it('ghi chuyen trang thai kem ly do', async () => {
    const sink = new RecordingSink();
    const telemetry = telemetryWith([sink]);

    await telemetry.runTurn({}, async () => {
      telemetry.stateChange({
        entity: 'Order',
        entityId: 'don-1',
        from: 'pending_review',
        to: 'needs_edit',
        reason: 'SUPERVISOR_FLAGGED_RISK',
      });
    });

    expect(sink.records[0]).toMatchObject({
      type: 'state_change',
      entity: 'Order',
      from: 'pending_review',
      to: 'needs_edit',
      reason: 'SUPERVISOR_FLAGGED_RISK',
    });
  });

  it('KHONG ghi khi trang thai chuyen sang chinh no', async () => {
    const sink = new RecordingSink();
    const telemetry = telemetryWith([sink]);

    await telemetry.runTurn({}, async () => {
      telemetry.stateChange({
        entity: 'Order',
        entityId: 'don-1',
        from: 'sent',
        to: 'sent',
      });
    });

    expect(sink.records).toHaveLength(0);
  });

  it('ghi delta ngu nghia thay vi anh chup toan bo thuc the', async () => {
    const sink = new RecordingSink();
    const telemetry = telemetryWith([sink]);

    await telemetry.runTurn({}, async () => {
      telemetry.dataChange({
        entity: 'Order',
        entityId: 'don-1',
        field: 'quantity',
        from: 20,
        to: 5,
      });
    });

    expect(sink.records[0]).toMatchObject({
      type: 'data_change',
      field: 'quantity',
      from: 20,
      to: 5,
    });
  });
});

describe('TelemetryService — quan sat lop AI', () => {
  it('ghi model, do tre, token va cong cu da goi', async () => {
    const sink = new RecordingSink();
    const telemetry = telemetryWith([sink]);

    await telemetry.runTurn({}, async () => {
      telemetry.aiCall({
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        operation: 'compose',
        durationMs: 1_820,
        status: 'ok',
        inputTokens: 2_310,
        outputTokens: 180,
        toolRounds: 2,
        toolNames: ['tra_cuu_san_pham', 'sua_don'],
      });
    });

    expect(sink.records[0]).toMatchObject({
      type: 'ai_call',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      operation: 'compose',
      durationMs: 1_820,
      inputTokens: 2_310,
      toolNames: ['tra_cuu_san_pham', 'sua_don'],
    });
  });

  it('KHONG luu prompt tho o muc `redacted` khi prompt chua PII', async () => {
    const sink = new RecordingSink();
    const telemetry = telemetryWith([sink], 'ultty', 'redacted');

    await telemetry.runTurn({}, async () => {
      telemetry.aiCall({
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        operation: 'compose',
        durationMs: 10,
        status: 'ok',
        attributes: { prompt: 'khach 0912345678 hoi ve ghe Felix' },
      });
    });

    expect(JSON.stringify(sink.records[0])).not.toContain('0912345678');
  });
});

describe('TelemetryService — FAIL-OPEN (muc 20)', () => {
  it('backend observability chet KHONG lam hong nghiep vu', async () => {
    const telemetry = telemetryWith([new BrokenSink()]);
    let businessRan = false;

    const result = await telemetry.runTurn({ chatId: 'nhom-1' }, async () =>
      telemetry.step('order.persist', async () => {
        businessRan = true;
        return 'don-da-luu';
      }),
    );

    expect(result).toBe('don-da-luu');
    expect(businessRan).toBe(true);
  });

  it('sink hong khong chan cac sink con lai', async () => {
    const healthy = new RecordingSink();
    const telemetry = telemetryWith([new BrokenSink(), healthy, new BrokenSink()]);

    await telemetry.runTurn({}, async () => {
      telemetry.decision({ vocabulary: TURN_DECISIONS, point: 'message.intake', outcome: 'allowed', reason: 'ACCEPTED' });
    });

    expect(healthy.records).toHaveLength(1);
  });

  it('moi loi ghi telemetry deu bi nuot, khong nem ra ngoai', async () => {
    const telemetry = telemetryWith([new BrokenSink()]);

    await telemetry.runTurn({}, async () => {
      expect(() =>
        telemetry.decision({ vocabulary: TURN_DECISIONS, point: 'message.intake', outcome: 'allowed', reason: 'ACCEPTED' }),
      ).not.toThrow();
      expect(() =>
        telemetry.stateChange({ entity: 'Order', entityId: 'x', from: 'a', to: 'b' }),
      ).not.toThrow();
      expect(() =>
        telemetry.dataChange({ entity: 'Order', field: 'q', from: 1, to: 2 }),
      ).not.toThrow();
      expect(() =>
        telemetry.aiCall({
          provider: 'p',
          model: 'm',
          operation: 'parse',
          durationMs: 1,
          status: 'ok',
        }),
      ).not.toThrow();
    });
  });

  it('loi NGHIEP VU van duoc nem tiep nguyen ven — telemetry chi quan sat', async () => {
    const sink = new RecordingSink();
    const telemetry = telemetryWith([sink]);

    await expect(
      telemetry.runTurn({}, async () =>
        telemetry.step('order.persist', async () => {
          throw new Error('DB tu choi ghi');
        }),
      ),
    ).rejects.toThrow('DB tu choi ghi');

    // …va van ghi lai duoc buoc that bai kem loi.
    expect(sink.records[0]).toMatchObject({
      type: 'step',
      name: 'order.persist',
      status: 'error',
      error: { message: 'DB tu choi ghi' },
    });
  });

  it('goi telemetry NGOAI moi trace khong nem — script/test van chay duoc', () => {
    const sink = new RecordingSink();
    const telemetry = telemetryWith([sink]);

    expect(() =>
      telemetry.decision({ vocabulary: TURN_DECISIONS, point: 'message.intake', outcome: 'allowed', reason: 'ACCEPTED' }),
    ).not.toThrow();
    expect(sink.records[0]!.traceId).toBe('no-trace');
  });
});

describe('traceparent — tuong thich W3C cho n8n/Dify sau nay', () => {
  it('di va ve nguyen ven', () => {
    const traceId = 'b'.repeat(32);
    const spanId = 'c'.repeat(16);

    expect(parseTraceparent(toTraceparent(traceId, spanId))).toEqual({ traceId, spanId });
  });

  it('noi tiep trace cua ben goi thay vi mo cay moi', async () => {
    const sink = new RecordingSink();
    const telemetry = telemetryWith([sink]);
    const upstreamTraceId = 'd'.repeat(32);

    await telemetry.runTurn(
      {},
      async () => telemetry.step('message.intake', async () => undefined),
      toTraceparent(upstreamTraceId, 'e'.repeat(16)),
    );

    expect(sink.records[0]!.traceId).toBe(upstreamTraceId);
  });

  it.each([
    ['rong', undefined],
    ['rac', 'khong-phai-traceparent'],
    ['trace id toan so 0', `00-${'0'.repeat(32)}-${'1'.repeat(16)}-01`],
  ])('header %s -> null, de ben goi mo trace moi', (_label, header) => {
    expect(parseTraceparent(header)).toBeNull();
  });

  it('header hong KHONG lam hong luot — van co traceId moi', async () => {
    const sink = new RecordingSink();
    const telemetry = telemetryWith([sink]);

    await telemetry.runTurn(
      {},
      async () => telemetry.step('message.intake', async () => undefined),
      'rac-hoan-toan',
    );

    expect(sink.records[0]!.traceId).toMatch(/^[0-9a-f]{32}$/);
  });
});
