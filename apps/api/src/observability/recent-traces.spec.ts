import { describe, expect, it } from 'vitest';
import { RecentTracesSink } from './recent-traces.sink.js';
import { buildTraceView } from './trace-view.builder.js';
import { TelemetryService } from './telemetry.service.js';
import { TURN_DECISIONS } from '../turns/turn-decisions.js';
import { SALES_ORDER_DECISIONS } from '../orders/sales-order-decisions.js';

function telemetryWith(sink: RecentTracesSink): TelemetryService {
  const telemetry = new TelemetryService();
  telemetry.configure({
    release: { tenant: 'ultty', environment: 'gd1-test', gitSha: 'a'.repeat(40) },
    privacy: 'full',
    sinks: [sink],
  });
  return telemetry;
}

describe('RecentTracesSink — vong dem co tran', () => {
  it('gom ban ghi theo luot va tim lai duoc theo don', async () => {
    const sink = new RecentTracesSink();
    const telemetry = telemetryWith(sink);

    await telemetry.runTurn({ chatId: 'nhom-1' }, async () => {
      telemetry.enrich({ orderId: 'don-7' });
      telemetry.decision({ vocabulary: TURN_DECISIONS, point: 'message.intake', outcome: 'allowed', reason: 'ACCEPTED' });
    });

    const found = sink.findByOrderId('don-7');
    expect(found).not.toBeNull();
    expect(found!.records).toHaveLength(1);
  });

  it('KHONG giu ban ghi ngoai trace — khong tao khoa rac', () => {
    const sink = new RecentTracesSink();
    const telemetry = telemetryWith(sink);

    telemetry.decision({ vocabulary: TURN_DECISIONS, point: 'message.intake', outcome: 'allowed', reason: 'ACCEPTED' });

    expect(sink.stats().traces).toBe(0);
  });

  it('day luot CU nhat ra khi vuot tran — bo nho khong phinh vo han', async () => {
    const sink = new RecentTracesSink();
    const telemetry = telemetryWith(sink);

    // 320 > tran 300 luot.
    for (let index = 0; index < 320; index += 1) {
      await telemetry.runTurn({ chatId: `nhom-${index}` }, async () => {
        telemetry.decision({ vocabulary: TURN_DECISIONS, point: 'message.intake', outcome: 'allowed', reason: 'ACCEPTED' });
      });
    }

    expect(sink.stats().traces).toBeLessThanOrEqual(300);
    // Luot moi nhat phai con.
    expect(sink.list(1)[0]!.records[0]!.anchors.chatId).toBe('nhom-319');
  });
});

describe('buildTraceView — cay cho console', () => {
  it('lam phang cay thanh danh sach co do sau dung', async () => {
    const sink = new RecentTracesSink();
    const telemetry = telemetryWith(sink);

    await telemetry.runTurn({ chatId: 'nhom-1' }, async () => {
      await telemetry.step('agent.run', async () => {
        telemetry.decision({ vocabulary: TURN_DECISIONS, point: 'advisor.compose', outcome: 'allowed', reason: 'COMPOSED' });
      });
    });

    const view = buildTraceView(sink.list(1)[0]!);
    const step = view.nodes.find((node) => node.kind === 'step')!;
    const decision = view.nodes.find((node) => node.kind === 'decision')!;

    expect(step.depth).toBe(0);
    expect(decision.depth).toBe(1);
    // Ma de MAY loc, nhan de NGUOI doc — phai co ca hai.
    expect(decision.reason).toBe('COMPOSED');
    expect(decision.reasonLabel).toBe('Agent đã soạn câu trả lời');
  });

  it('danh dau buoc luu tru la KY THUAT de console an mac dinh', async () => {
    const sink = new RecentTracesSink();
    const telemetry = telemetryWith(sink);

    await telemetry.runTurn({ chatId: 'nhom-1' }, async () => {
      await telemetry.step('message.persist', async () => undefined);
      await telemetry.step('agent.run', async () => undefined);
    });

    const view = buildTraceView(sink.list(1)[0]!);
    const persist = view.nodes.find((node) => node.label === 'message.persist')!;
    const agent = view.nodes.find((node) => node.label === 'agent.run')!;

    expect(persist.technical).toBe(true);
    // Buoc nghiep vu KHONG bao gio bi an.
    expect(agent.technical).toBeUndefined();
  });

  it('lan goi AI hien du provider/model/cong cu', async () => {
    const sink = new RecentTracesSink();
    const telemetry = telemetryWith(sink);

    await telemetry.runTurn({ chatId: 'nhom-1' }, async () => {
      telemetry.aiCall({
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        operation: 'compose',
        durationMs: 1200,
        status: 'ok',
        toolNames: ['tra_cuu_san_pham'],
      });
    });

    const view = buildTraceView(sink.list(1)[0]!);
    const ai = view.nodes.find((node) => node.kind === 'ai')!;

    expect(ai.label).toBe('AI compose');
    expect(ai.detail).toContain('deepseek/deepseek-v4-flash');
    expect(ai.detail).toContain('tra_cuu_san_pham');
  });

  it('KHONG bo sot ban ghi nao, ke ca khi cha bi cat theo tran', async () => {
    const sink = new RecentTracesSink();
    const telemetry = telemetryWith(sink);

    await telemetry.runTurn({ chatId: 'nhom-1' }, async () => {
      await telemetry.step('agent.run', async () => {
        telemetry.decision({ vocabulary: TURN_DECISIONS, point: 'supervisor.risk', outcome: 'allowed', reason: 'ALLOWED' });
        telemetry.stateChange({ entity: 'Order', entityId: 'x', from: 'a', to: 'b' });
      });
      telemetry.decision({ vocabulary: SALES_ORDER_DECISIONS, point: 'order.auto_confirm', outcome: 'denied', reason: 'KILL_SWITCH_OFF' });
    });

    const stored = sink.list(1)[0]!;
    const view = buildTraceView(stored);

    expect(view.nodes).toHaveLength(stored.records.length);
  });
});
