import { describe, expect, it } from 'vitest';
import { actionSlot, legsOfRun, tickingWaitSeconds, toFieldScreen } from './field-work';
import { ARRIVE_PICKUP, RECEIPT_PHOTO, leg, work } from './fixtures';

describe('toFieldScreen — chon viec ke tiep theo luat web', () => {
  it('khong co vong chay nao -> NO_WORK, khong bia chang', () => {
    const model = toFieldScreen({ serverNow: 'x', runs: [] });
    expect(model.kind).toBe('NO_WORK');
    expect(model.current).toBeNull();
    expect(model.openRunCount).toBe(0);
    expect(model.headline).toBe('Hiện chưa có việc nào được điều cho bạn.');
  });

  it('chang DAU TIEN con nut la chang dang lam, ke ca khi da giao xong nhung chua chup bien nhan', () => {
    const model = toFieldScreen(
      work([
        leg({ legId: 'a', sequence: 1, phase: 'DELIVERED', nextActions: [RECEIPT_PHOTO] }),
        leg({ legId: 'b', sequence: 2, nextActions: [ARRIVE_PICKUP] }),
      ]),
    );
    expect(model.kind).toBe('RUN_CURRENT');
    expect(model.current?.legId).toBe('a');
    expect(model.others.map((card) => card.legId)).toEqual(['b']);
    expect(model.headline).toBe('VX-0001 — Đã giao xong');
  });

  it('bo qua chang khong con nut (khong chon theo so thu tu)', () => {
    const model = toFieldScreen(
      work([
        leg({ legId: 'a', nextActions: [] }),
        leg({ legId: 'b', sequence: 2, phase: 'AT_PICKUP' }),
      ]),
    );
    expect(model.current?.legId).toBe('b');
  });

  it('con vong chay nhung khong nut nao -> RUN_IDLE, khong phai "khong co viec"', () => {
    const model = toFieldScreen(work([leg({ nextActions: [] })]));
    expect(model.kind).toBe('RUN_IDLE');
    expect(model.openRunCount).toBe(1);
    expect(model.headline).toContain('Đã làm xong');
  });

  it('dem theo VONG CHAY, khong theo chang', () => {
    const model = toFieldScreen({
      serverNow: 'x',
      runs: [
        { runId: 'r1', runCode: 'A', legs: [leg({ legId: '1' }), leg({ legId: '2' })] },
        { runId: 'r2', runCode: 'B', legs: [leg({ legId: '3' })] },
      ],
    });
    expect(model.openRunCount).toBe(2);
  });

  it('the chang: chang rong co tieu de rieng, chung tu da go khong tinh la da chup', () => {
    const model = toFieldScreen(
      work([
        leg({
          kind: 'EMPTY',
          orderCode: null,
          orderId: null,
          documents: [
            {
              id: 'd1',
              type: 'GATE_PASS',
              basis: 'DIGITAL_FILE',
              status: 'WITHDRAWN',
              receivedAt: 'x',
            },
            {
              id: 'd2',
              type: 'WEIGH_TICKET',
              basis: 'DIGITAL_FILE',
              status: 'ACTIVE',
              receivedAt: 'x',
            },
          ],
          missingDocumentTypes: ['DELIVERY_RECEIPT'],
          receiptHandover: 'WITH_DRIVER',
        }),
      ]),
    );
    const card = model.current;
    expect(card?.title).toBe('Chặng 1 — chạy rỗng');
    expect(card?.route).toBe('Kho A → Kho B');
    expect(card?.capturedDocuments).toEqual(['Phiếu cân']);
    expect(card?.missingDocuments).toEqual(['Biên nhận giao hàng']);
    expect(card?.handoverLabel).toBe('Biên nhận đang ở chỗ bạn');
  });
});

describe('legsOfRun', () => {
  it('tra moi chang cua dung vong chay, rong khi khong co', () => {
    const data = work([leg({ legId: 'a' }), leg({ legId: 'b', sequence: 2 })]);
    expect(legsOfRun(data, 'run-1').map((card) => card.legId)).toEqual(['a', 'b']);
    expect(legsOfRun(data, 'khac')).toEqual([]);
  });
});

describe('actionSlot', () => {
  it('khoa rieng cho tung nut tren cung chang', () => {
    expect(actionSlot('leg-1', ARRIVE_PICKUP)).toBe('leg-1:CHECKPOINT:PICKUP_ARRIVAL');
    expect(actionSlot('leg-1', RECEIPT_PHOTO)).toBe('leg-1:DOCUMENT:DELIVERY_RECEIPT');
  });
});

describe('tickingWaitSeconds — dong ho cho chi de hien thi', () => {
  it('cong them khoang da troi tu luc NHAN phan hoi', () => {
    expect(tickingWaitSeconds(600, 1_000_000, 1_090_000)).toBe(690);
  });
  it('dong ho may lui (hoac chua troi) thi giu nguyen so may chu', () => {
    expect(tickingWaitSeconds(600, 1_000_000, 999_000)).toBe(600);
  });
  it('gia tri hong khong bao gio ra so am', () => {
    expect(tickingWaitSeconds(Number.NaN, 0, 10)).toBe(0);
    expect(tickingWaitSeconds(-50, 0, 0)).toBe(0);
  });
});
