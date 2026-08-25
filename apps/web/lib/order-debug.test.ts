import { describe, expect, it } from 'vitest';
import type { OrderDebugView } from '@netviet/shared';
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
  it('khong bao gio tra ve mot con so tran trui', () => {
    const lines = durationLines(
      view({ durations: { synchronousMs: 92, causalSpanMs: 96_000, turnCount: 2 } }),
    );

    for (const line of lines) {
      expect(line.label.length).toBeGreaterThan(0);
      expect(line.hint.length).toBeGreaterThan(0);
    }
  });

  it('hai con so mang HAI nghia khac nhau, khong tron lam mot', () => {
    const lines = durationLines(
      view({ durations: { synchronousMs: 92, causalSpanMs: 96_000, turnCount: 2 } }),
    );

    expect(lines.map((line) => line.label)).toEqual([
      'Thời gian xử lý đồng bộ',
      'Khoảng từ lượt đầu tới lượt cuối',
    ]);
    expect(lines[0]!.value).toBe('92 ms');
    expect(lines[1]!.value).toBe('1 phút 36 giây');
    expect(lines[1]!.hint).toContain('chờ bền vững');
  });

  it('chi mot luot thi KHONG bia ra khoang nhan qua', () => {
    const lines = durationLines(view({ durations: { synchronousMs: 92, turnCount: 1 } }));

    expect(lines).toHaveLength(1);
    expect(lines[0]!.label).toBe('Thời gian xử lý đồng bộ');
  });

  it('khong do duoc gi thi khong hien dong nao', () => {
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
