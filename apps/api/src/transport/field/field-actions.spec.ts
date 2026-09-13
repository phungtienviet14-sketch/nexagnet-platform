import { describe, expect, it } from 'vitest';
import { fieldActionsFor } from './field-actions.js';

/**
 * FD-010 — VIEC KE TIEP tren man hinh lai xe, do o tang HAM THUAN.
 *
 * Bai quan trong nhat cua tep la bai cuoi cung: mot nut chi duoc hien khi may chu THAT SU se chap
 * nhan lan bam do. `fieldActionsFor` doc chinh `requiredPredecessor()` cua
 * `checkpoint-lifecycle.ts` — cung ham ma `CheckpointService` dung de tu choi — nen hai ban luat
 * khong the lech nhau.
 */

const input = (over: Partial<Parameters<typeof fieldActionsFor>[0]> = {}) => ({
  recordedTypes: [],
  documentTypes: [],
  requiredDocumentTypes: ['DELIVERY_RECEIPT' as const],
  hasOpenWaiting: false,
  hasOrder: true,
  receiptHandoverRecorded: false,
  runTerminal: false,
  ...over,
});

const labels = (over: Partial<Parameters<typeof fieldActionsFor>[0]> = {}): readonly string[] =>
  fieldActionsFor(input(over)).map((action) => action.label);

describe('Viec ke tiep cua mot chang — FD-010', () => {
  /** `#279` O9: *"not internal state-machine jargon"*. Lai xe doc tieng Viet, khong doc ten enum. */
  it('chang chua bam gi chi hien MOT viec: den diem lay hang', () => {
    expect(labels()).toEqual(['Đã tới điểm lấy hàng']);
  });

  /**
   * `GATE_ENTRY` va `LOADING` deu doi `PICKUP_ARRIVAL` va KHONG doi nhau — nhieu bai khong co cong,
   * va nhieu bai qua cong roi moi den can. Ca hai hien cung luc, va do la dung.
   */
  it('sau khi den diem lay hang, ba viec mo ra cung luc', () => {
    expect(labels({ recordedTypes: ['PICKUP_ARRIVAL'] })).toEqual([
      'Đã vào cổng',
      'Đang xếp hàng',
      'Rời điểm lấy hàng',
    ]);
  });

  it('nut chup giay nam NGAY SAU moc sinh ra to giay do', () => {
    expect(labels({ recordedTypes: ['PICKUP_ARRIVAL', 'GATE_ENTRY'] })).toEqual([
      'Chụp giấy vào cổng',
      'Đang xếp hàng',
      'Rời điểm lấy hàng',
    ]);
  });

  it('da chup roi thi nut chup bien mat', () => {
    expect(
      labels({ recordedTypes: ['PICKUP_ARRIVAL', 'GATE_ENTRY'], documentTypes: ['GATE_PASS'] }),
    ).toEqual(['Đang xếp hàng', 'Rời điểm lấy hàng']);
  });

  /** `LOADING` la moc DUY NHAT lap lai duoc — mot chang co the boc o hai kho. */
  it('`Dang xep hang` van hien sau khi da bam mot lan', () => {
    expect(labels({ recordedTypes: ['PICKUP_ARRIVAL', 'LOADING'] })).toContain('Đang xếp hàng');
  });

  it('khong hien viec cua buoc sau khi buoc truoc chua xay ra', () => {
    expect(labels()).not.toContain('Đã đến nơi');
    expect(labels({ recordedTypes: ['PICKUP_ARRIVAL'] })).not.toContain('Đã đến nơi');
  });

  it('`Da den noi` doi vi tri, ba viec o diem lay hang thi khong', () => {
    const arrival = fieldActionsFor(
      input({ recordedTypes: ['PICKUP_ARRIVAL', 'PICKUP_DEPARTURE'] }),
    );
    const delivery = arrival.find((action) => action.checkpointType === 'DELIVERY_ARRIVAL');
    expect(delivery?.requiresLocation).toBe(true);

    const gate = fieldActionsFor(input({ recordedTypes: ['PICKUP_ARRIVAL'] })).find(
      (action) => action.checkpointType === 'GATE_ENTRY',
    );
    expect(gate?.requiresLocation).toBe(false);
  });
});

describe('Nut `Bat dau cho` — FD-011', () => {
  const arrived = ['PICKUP_ARRIVAL', 'PICKUP_DEPARTURE', 'DELIVERY_ARRIVAL'] as const;

  it('hien NGAY SAU `Da den noi`', () => {
    expect(labels({ recordedTypes: [...arrived] })).toEqual([
      // Xem bai `CHUNG TU KHONG bi khoa theo chang duong` ben duoi: mot to phieu can van chup duoc
      // sau khi da roi diem lay hang.
      'Chụp phiếu cân',
      'Bắt đầu chờ',
      'Khách đã nhận hàng',
    ]);
  });

  it('bien mat khi da co mot phien cho dang mo', () => {
    expect(labels({ recordedTypes: [...arrived], hasOpenWaiting: true })).toEqual([
      'Chụp phiếu cân',
      'Khách đã nhận hàng',
    ]);
  });

  /**
   * `evaluateWaitingStart` tra `WAITING_DELIVERY_ALREADY_ACCEPTED` sau khi nguoi nhan da nhan hang,
   * nen hien nut o do se la mot nut bam vao thi bao loi.
   */
  it('bien mat sau khi nguoi nhan da nhan hang', () => {
    expect(labels({ recordedTypes: [...arrived, 'DELIVERY_ACCEPTED'] })).not.toContain(
      'Bắt đầu chờ',
    );
  });
});

describe('Bien nhan va ban giao — FD-012', () => {
  const delivered = [
    'PICKUP_ARRIVAL',
    'PICKUP_DEPARTURE',
    'DELIVERY_ARRIVAL',
    'DELIVERY_ACCEPTED',
  ] as const;

  it('sau khi khach nhan hang: chup bien nhan, roi ban giao', () => {
    expect(labels({ recordedTypes: [...delivered] })).toEqual([
      'Chụp phiếu cân',
      'Chụp biên nhận giao hàng',
      'Tôi đang giữ biên nhận',
    ]);
  });

  it('bien nhan la chung tu BAT BUOC theo chinh sach ho so B', () => {
    const receipt = fieldActionsFor(input({ recordedTypes: [...delivered] })).find(
      (action) => action.documentType === 'DELIVERY_RECEIPT',
    );
    expect(receipt?.required).toBe(true);
  });

  /**
   * Mot chang RONG khong mang don (bat bien cua `TransportRunLeg`), nen khong co to bien nhan nao
   * de lai xe cam ve. Hien nut o do se la mot cau hoi khong co cau tra loi.
   */
  it('chang khong mang don thi khong co nut ban giao', () => {
    expect(labels({ recordedTypes: [...delivered], hasOrder: false })).not.toContain(
      'Tôi đang giữ biên nhận',
    );
  });

  it('da ghi ban giao roi thi nut bien mat', () => {
    expect(labels({ recordedTypes: [...delivered], receiptHandoverRecorded: true })).not.toContain(
      'Tôi đang giữ biên nhận',
    );
  });

  it('chang khong bat buoc chung tu thi nut chup van hien, nhung khong `required`', () => {
    const receipt = fieldActionsFor(
      input({ recordedTypes: [...delivered], requiredDocumentTypes: [] }),
    ).find((action) => action.documentType === 'DELIVERY_RECEIPT');
    expect(receipt).toBeDefined();
    expect(receipt?.required).toBe(false);
  });
});

/**
 * FD-014 — MOC bi khoa theo CHANG DUONG, CHUNG TU thi khong.
 *
 * Do la mot phan biet co that, khong phai mot chi tiet ky thuat:
 *
 *   · mot MOC khang dinh *"toi DANG o day, BAY GIO"* — `receivedAt` la gio may chu luc bam. Mot lai
 *     xe dang tren duong bam `Da vao cong` se ghi mot lan vao cong vao dung luc ho khong o cong;
 *   · mot CHUNG TU khang dinh *"toi DANG CAM to giay nay"* — va to phieu can van nam trong cabin
 *     sau khi xe da roi kho hang tieng.
 *
 * Nen nut chup KHONG bi go di khi chang duong dong lai. Go no se ep lai xe phai chup dung luc dang
 * lai xe ra khoi cong — hoac bo qua luon, va mot chung tu bi bo qua la mot chung tu khong bao gio
 * co.
 */
describe('Moc bi khoa theo chang duong, chung tu thi khong — FD-014', () => {
  it('sau khi roi diem lay hang, ba viec o diem lay hang khong con duoc chao', () => {
    const after = labels({ recordedTypes: ['PICKUP_ARRIVAL', 'PICKUP_DEPARTURE'] });
    expect(after).not.toContain('Đã vào cổng');
    expect(after).not.toContain('Đang xếp hàng');
    expect(after).toContain('Đã đến nơi');
  });

  it('nhung nut CHUP cua chang duong do van con', () => {
    expect(labels({ recordedTypes: ['PICKUP_ARRIVAL', 'PICKUP_DEPARTURE'] })).toContain(
      'Chụp phiếu cân',
    );
  });

  it('sau khi khach nhan hang, hai moc giao hang khong con duoc chao', () => {
    const after = labels({
      recordedTypes: [
        'PICKUP_ARRIVAL',
        'PICKUP_DEPARTURE',
        'DELIVERY_ARRIVAL',
        'DELIVERY_ACCEPTED',
      ],
    });
    expect(after).not.toContain('Đã đến nơi');
    expect(after).not.toContain('Khách đã nhận hàng');
    expect(after).toContain('Chụp biên nhận giao hàng');
  });
});

describe('Vong chay da ket thuc — FD-013', () => {
  /**
   * `evaluateCheckpoint` tu choi moi moc bang `CHECKPOINT_RUN_TERMINAL`, nen mot danh sach nut o
   * day se la mot man hinh day nut bam vao thi bao loi.
   */
  it('khong con viec gi de bam', () => {
    expect(labels({ recordedTypes: ['PICKUP_ARRIVAL'], runTerminal: true })).toEqual([]);
  });
});
