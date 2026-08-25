import { describe, expect, it } from 'vitest';
import type { DebugWorkflowRun, OrderDebugView } from '@netviet/shared';
import { clockOf, durationLines, formatDuration, technicalFacts } from './order-debug';

/**
 * TRINH BAY cua man hinh "Luong xu ly".
 *
 * Bai kiem o day nham vao dung mot loai loi: mot con so DUNG duoc trinh bay theo cach lam nguoi
 * doc ket luan SAI. Do la loi ma bo kiem cua API khong bat duoc — API tra ve 96000 va no dung;
 * cai sai xay ra o cho con so do bien thanh chu.
 */

function view(overrides: Partial<OrderDebugView> = {}): OrderDebugView {
  return {
    orderId: 'don-7',
    tenant: 'khach-test',
    environment: 'moi-truong-test',
    turns: [],
    workflows: [],
    durations: { turnCount: 0 },
    notes: [],
    ...overrides,
  };
}

function turn(traceId: string, startedAt: string) {
  return {
    view: {
      traceId,
      tenant: 'khach-test',
      environment: 'moi-truong-test',
      startedAt,
      anchors: {},
      nodes: [],
    },
    channelLabel: 'Tin nhắn Zalo',
    channel: 'zca',
    derived: false,
    startedAt,
  };
}

/** Mot lan ban giao workflow, du toi thieu de dung mot dong thoi luong. */
function workflow(overrides: Partial<DebugWorkflowRun> = {}): DebugWorkflowRun {
  return {
    key: 'sales-handoff-followup',
    version: 'v1',
    engineName: 'sales-handoff-followup.v1',
    displayName: 'Nhắc Sale sau bàn giao',
    description: '',
    known: true,
    handoffStatus: 'dispatched',
    handoffStatusLabel: 'Đã bàn giao cho engine',
    queuedAt: '2026-08-25T10:00:02.000Z',
    attempts: 1,
    operationKey: 'op-1',
    steps: [],
    ...overrides,
  };
}

describe('formatDuration — doi don vi theo do lon', () => {
  it('duoi mot giay thi giu mili giay', () => {
    expect(formatDuration(92)).toBe('92 ms');
  });

  it('0 KHONG bi lam tron thanh "duoi 1 giay" — do la mot phep do that', () => {
    expect(formatDuration(0)).toBe('0 ms');
  });

  it('vai chuc giay doc bang giay', () => {
    expect(formatDuration(45_000)).toBe('45 giây');
  });

  it('96 giay doc thanh "1 phút 36 giây", khong phai mot day chu so', () => {
    expect(formatDuration(96_000)).toBe('1 phút 36 giây');
  });

  it('tron phut thi khong deo them "0 giây"', () => {
    expect(formatDuration(120_000)).toBe('2 phút');
  });

  it('hang gio doc bang gio va phut', () => {
    expect(formatDuration(3 * 3_600_000 + 25 * 60_000)).toBe('3 giờ 25 phút');
  });

  it('gia tri vo nghia thi noi "khong xac dinh", khong in NaN', () => {
    expect(formatDuration(Number.NaN)).toBe('không xác định');
    expect(formatDuration(-5)).toBe('không xác định');
  });
});

describe('clockOf — moc thoi gian doc duoc', () => {
  it('co ca giay: man hinh nay doc thu tu trong mot phut', () => {
    expect(clockOf('2026-08-25T10:00:02.000Z')).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('moc hong thi hien gach ngang, khong hien "Invalid Date"', () => {
    expect(clockOf('khong-phai-ngay')).toBe('—');
  });
});

describe('durationLines — moi con so deu co nhan va cau giai thich', () => {
  /*
   * CHO NAY LA CHO NOI DOI. API tra ve nhung con so dung; cai sai xay ra khi con so bien thanh
   * chu. Ban truoc dan cau "Có bao gồm cả lần chờ bền vững của workflow." vao hieu timestamp cua
   * cac LUOT — mot con so ~2 giay — trong khi lan cho ben vung that su la 90 giay.
   *
   * Bai kiem duoi day khoa dung mot dieu: cau "bao gom lan cho ben vung" chi duoc phep dung canh
   * con so cua ENGINE.
   */

  it('khong bao gio tra ve mot con so tran trui', () => {
    const lines = durationLines(
      view({
        durations: { synchronousMs: 92, turnIntervalMs: 2_000, turnCount: 2 },
        workflows: [workflow({ engineDurationMs: 95_000 })],
      }),
    );

    for (const line of lines) {
      expect(line.label.length).toBeGreaterThan(0);
      expect(line.hint.length).toBeGreaterThan(0);
      expect(line.value.length).toBeGreaterThan(0);
    }
  });

  it('ba con so mang BA nghia khac nhau, khong tron lam mot', () => {
    const lines = durationLines(
      view({
        durations: { synchronousMs: 11, turnIntervalMs: 2_000, turnCount: 2 },
        workflows: [workflow({ engineDurationMs: 95_000 })],
      }),
    );

    expect(lines.map((line) => line.label)).toEqual([
      'Thời gian xử lý đồng bộ',
      'Thời gian workflow',
      'Khoảng giữa các lượt được ghi nhận',
    ]);
    expect(lines[0]!.value).toBe('11 ms');
    expect(lines[1]!.value).toBe('1 phút 35 giây');
    expect(lines[2]!.value).toBe('2 giây');
  });

  it('CAU "cho ben vung" chi duoc dung canh con so cua ENGINE', () => {
    const lines = durationLines(
      view({
        durations: { synchronousMs: 11, turnIntervalMs: 2_000, turnCount: 2 },
        workflows: [workflow({ engineDurationMs: 95_000 })],
      }),
    );

    const claims = lines.filter((line) => line.hint.includes('chờ bền vững'));

    // Dong dong bo co quyen NHAC toi lan cho — de noi rang no KHONG bao gom. Dong khoang-luot
    // thi khong duoc phep nhac toi no theo bat cu chieu nao.
    expect(claims.map((line) => line.label)).toEqual([
      'Thời gian xử lý đồng bộ',
      'Thời gian workflow',
    ]);
    expect(lines[0]!.hint).toContain('Không bao gồm');
    expect(lines[1]!.hint).toContain('Có bao gồm');
    expect(lines[2]!.hint).not.toContain('bền vững');
  });

  it('dong khoang-luot phai NOI RO no khong phai thoi gian workflow', () => {
    const lines = durationLines(
      view({
        durations: { turnIntervalMs: 2_000, turnCount: 2 },
        workflows: [workflow({ engineDurationMs: 95_000 })],
      }),
    );

    const interval = lines.find((line) => line.label === 'Khoảng giữa các lượt được ghi nhận')!;
    expect(interval.hint).toContain('Không phải thời gian workflow');
  });

  it('workflow DANG CHAY thi noi "chua xac dinh", khong bia mot con so', () => {
    const lines = durationLines(
      view({
        durations: { synchronousMs: 11, turnCount: 1 },
        workflows: [
          workflow({
            engineStatus: 'RUNNING',
            engineStatusLabel: 'Đang chạy',
            engineStartedAt: '2026-08-25T10:00:02.000Z',
          }),
        ],
      }),
    );

    const wf = lines.find((line) => line.label === 'Thời gian workflow')!;
    expect(wf.value).toBe('chưa xác định');
    expect(wf.hint).toContain('chưa');
    expect(wf.hint).not.toContain('NaN');
  });

  it('engine khong cho moc nao thi van hien dong do, va noi ro la khong co du lieu', () => {
    const lines = durationLines(
      view({
        durations: { synchronousMs: 11, turnCount: 1 },
        workflows: [workflow()],
      }),
    );

    const wf = lines.find((line) => line.label === 'Thời gian workflow')!;
    expect(wf.value).toBe('chưa xác định');
    expect(wf.hint.length).toBeGreaterThan(0);
  });

  it('nhieu workflow thi moi dong mang TEN nghiep vu de khong lan nhau', () => {
    const lines = durationLines(
      view({
        durations: { turnCount: 1 },
        workflows: [
          workflow({ operationKey: 'op-1', engineDurationMs: 95_000 }),
          workflow({
            operationKey: 'op-2',
            displayName: 'Việc khác',
            engineDurationMs: 3_000,
          }),
        ],
      }),
    );

    expect(lines.map((line) => line.label)).toEqual([
      'Thời gian workflow · Nhắc Sale sau bàn giao',
      'Thời gian workflow · Việc khác',
    ]);
    // Nhan phai DUY NHAT: React dung nhan lam khoa, hai nhan trung nhau lam mot dong bien mat.
    expect(new Set(lines.map((line) => line.label)).size).toBe(lines.length);
  });

  it('chi mot luot thi KHONG bia ra khoang giua cac luot', () => {
    const lines = durationLines(view({ durations: { synchronousMs: 92, turnCount: 1 } }));

    expect(lines).toHaveLength(1);
    expect(lines[0]!.label).toBe('Thời gian xử lý đồng bộ');
  });

  it('khong do duoc gi va khong co workflow nao thi khong hien dong nao', () => {
    expect(durationLines(view())).toEqual([]);
  });
});

describe('technicalFacts — bang neo tra cuu', () => {
  it('luon co ma don va cap khach/moi truong', () => {
    const labels = technicalFacts(view()).map((fact) => fact.label);

    expect(labels).toContain('Mã đơn');
    expect(labels).toContain('Khách hàng · môi trường');
  });

  it('moi luot gop mot traceId, luot dau duoc goi ten rieng', () => {
    const facts = technicalFacts(
      view({
        turns: [
          turn('trace-1', '2026-08-25T10:00:02.000Z'),
          turn('trace-2', '2026-08-25T10:01:38.000Z'),
        ],
      }),
    );

    expect(facts.find((fact) => fact.value === 'trace-1')?.label).toBe('Trace ID (lượt đầu)');
    expect(facts.find((fact) => fact.value === 'trace-2')?.label).toBe('Trace ID (lượt 2)');
  });

  it('truong khong co du lieu thi VANG MAT, khong hien o rong', () => {
    const labels = technicalFacts(view()).map((fact) => fact.label);

    expect(labels).not.toContain('Bản phát hành');
    expect(labels).not.toContain('Engine run ID');
  });

  it('engineRunId chi xuat hien khi ban giao da sang duoc engine', () => {
    const withoutRun = technicalFacts(
      view({
        workflows: [
          {
            key: 'sales-handoff-followup',
            version: 'v1',
            engineName: 'sales-handoff-followup.v1',
            displayName: 'Nhắc Sale sau bàn giao',
            description: '',
            known: true,
            handoffStatus: 'pending',
            handoffStatusLabel: 'Đang chờ bàn giao',
            queuedAt: '2026-08-25T10:00:02.000Z',
            attempts: 0,
            operationKey: 'khoa-thao-tac',
            steps: [],
          },
        ],
      }),
    );

    expect(withoutRun.map((fact) => fact.label)).toContain('Operation key');
    expect(withoutRun.map((fact) => fact.label)).not.toContain('Engine run ID');
  });
});
