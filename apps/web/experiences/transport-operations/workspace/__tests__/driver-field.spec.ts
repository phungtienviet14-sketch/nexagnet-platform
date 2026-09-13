import { describe, expect, it } from 'vitest';
import type { DriverFieldLeg, DriverFieldWork } from '../../transport-types';
import { formatElapsed, toFieldScreen } from '../driver-field';

/**
 * WF-010 — mo hinh khung nhin cua man hinh hien truong.
 *
 * Quyet dinh "hien gi" nam o mot ham THUAN co bai kiem, khong nam rai trong JSX — cung quy uoc voi
 * `toSiteIntakeScreen()` cua `#267`. Sau ba lan sua giao dien, cau *"chang nao la chang dang lam"*
 * van doc lai duoc o day.
 */

const leg = (over: Partial<DriverFieldLeg> = {}): DriverFieldLeg => ({
  legId: 'leg-1',
  sequence: 1,
  kind: 'LOADED',
  originLabel: 'Hà Nội',
  destinationLabel: 'Hải Phòng',
  orderCode: 'ORD-1',
  orderId: 'ord-1',
  phase: 'PLANNED',
  recordedTypes: [],
  arrivalCheckpointId: null,
  waiting: null,
  documents: [],
  missingDocumentTypes: [],
  receiptHandover: null,
  nextActions: [
    {
      kind: 'CHECKPOINT',
      label: 'Đã tới điểm lấy hàng',
      checkpointType: 'PICKUP_ARRIVAL',
      requiresLocation: false,
      required: true,
    },
  ],
  ...over,
});

const work = (legs: readonly DriverFieldLeg[]): DriverFieldWork => ({
  serverNow: '2026-09-09T05:00:00.000Z',
  runs: legs.length === 0 ? [] : [{ runId: 'run-1', runCode: 'VC-001', legs }],
});

describe('Chang dang lam — WF-010', () => {
  it('khong co chuyen nao thi noi that dieu do', () => {
    const model = toFieldScreen(work([]));
    expect(model.current).toBeNull();
    expect(model.headline).toContain('Chưa có chuyến nào');
  });

  /**
   * "Chang dau tien CON VIEC" chu khong "chang co so thu tu nho nhat chua giao xong".
   *
   * Mot chang da giao xong nhung chua chup bien nhan VAN con viec, va do dung la thu lai xe phai
   * lam tiep. Chon theo so thu tu se day ho sang chang sau trong khi to giay o chang truoc chua
   * chup.
   */
  it('chon chang DAU TIEN con viec, khong chon theo so thu tu', () => {
    const done = leg({ legId: 'leg-1', sequence: 1, nextActions: [] });
    const pending = leg({
      legId: 'leg-2',
      sequence: 2,
      nextActions: [
        {
          kind: 'DOCUMENT',
          label: 'Chụp biên nhận giao hàng',
          documentType: 'DELIVERY_RECEIPT',
          requiresLocation: false,
          required: true,
        },
      ],
    });

    const model = toFieldScreen(work([done, pending]));
    expect(model.current?.legId).toBe('leg-2');
    expect(model.others.map((card) => card.legId)).toEqual(['leg-1']);
  });

  it('khong chang nao con viec thi noi ro la da xong, khong de trong', () => {
    const model = toFieldScreen(work([leg({ nextActions: [] })]));
    expect(model.current).toBeNull();
    expect(model.headline).toContain('Đã làm xong');
  });

  it('the mang tuyen, giai doan va ma don doc duoc', () => {
    const model = toFieldScreen(work([leg({ phase: 'ARRIVED' })]));
    expect(model.current?.route).toBe('Hà Nội → Hải Phòng');
    expect(model.current?.phaseLabel).toBe('Đã đến nơi giao');
    expect(model.current?.orderCode).toBe('ORD-1');
  });

  it('chang RONG duoc goi ten dung la chang rong', () => {
    const model = toFieldScreen(work([leg({ kind: 'EMPTY', orderCode: null })]));
    expect(model.current?.title).toContain('chạy rỗng');
    expect(model.current?.orderCode).toBeNull();
  });

  it('chung tu da chup va con thieu duoc dich sang tieng Viet', () => {
    const model = toFieldScreen(
      work([
        leg({
          documents: [
            {
              id: 'd1',
              type: 'GATE_PASS',
              basis: 'EXTERNAL_PHYSICAL',
              status: 'ACTIVE',
              receivedAt: '2026-09-09T04:00:00.000Z',
            },
          ],
          missingDocumentTypes: ['DELIVERY_RECEIPT'],
        }),
      ]),
    );
    expect(model.current?.capturedDocuments).toEqual(['Giấy vào cổng']);
    expect(model.current?.missingDocuments).toEqual(['Biên nhận giao hàng']);
  });

  it('trang thai ban giao bien nhan doc duoc bang cau tieng Viet', () => {
    const model = toFieldScreen(work([leg({ receiptHandover: 'RETURNED_TO_OFFICE' })]));
    expect(model.current?.handoverLabel).toBe('Văn phòng đã nhận biên nhận');
  });
});

describe('Thoi luong cho — WF-011', () => {
  /**
   * `#279` O5: *"elapsed display derives from server start time"*.
   *
   * Con so den TU MAY CHU (`elapsedSeconds`), va tep nay chi dinh dang no. Khong mot phep tru nao
   * voi `Date.now()`: mot chiec dien thoai lech mot tieng se hien mot con so khac han con so ma
   * nguoi duyet phu cap doc.
   */
  it('dinh dang tu con so MAY CHU da tinh, khong tu dong ho may nay', () => {
    const model = toFieldScreen(
      work([
        leg({
          waiting: {
            sessionId: 'w1',
            reason: 'RECEIVER_NOT_READY',
            startedAt: '2026-09-09T02:00:00.000Z',
            elapsedSeconds: 3 * 3600 + 12 * 60,
          },
        }),
      ]),
    );
    expect(model.current?.waitingElapsed).toBe('3 giờ 12 phút');
  });

  it('duoi mot tieng thi chi hien phut', () => {
    expect(formatElapsed(45 * 60)).toBe('45 phút');
  });

  it('khong bao gio hien mot khoang am', () => {
    expect(formatElapsed(-10)).toBe('0 phút');
  });

  it('chang khong cho thi khong hien dong nao', () => {
    expect(toFieldScreen(work([leg()])).current?.waitingElapsed).toBeNull();
  });
});
