import { describe, expect, it } from 'vitest';
import {
  approvalReasons,
  toApprovalItem,
  toApprovalQueue,
  type ApprovalContext,
} from '../approvals';
import { collectKeys, collectStrings, dirtyOrder, ENGINEERING_ONLY_KEYS } from './fixtures';

const WITH_THRESHOLD: ApprovalContext = { maxAutoConfirmQuantity: 50 };

describe('hang cho duyet — phep loc (Issue #110 §Duyệt & gửi)', () => {
  it('chi giu tin CHUA GUI ma DA CO thu de gui', () => {
    const queue = toApprovalQueue([
      dirtyOrder({ id: 'cho-duyet' }),
      dirtyOrder({ id: 'da-gui', status: 'sent' }),
      dirtyOrder({ id: 'da-huy', status: 'rejected' }),
      // Chua co gi de gui: khong `priced`, khong ban tu van. Bam duyet chi ra loi.
      dirtyOrder({ id: 'chua-co-gi', priced: null, trace: undefined }),
    ]);
    expect(queue.map((item) => item.reference)).toEqual(['cho-duyet']);
  });

  it('con giu tin o trang thai `needs_edit` — do cung la viec cua nguoi duyet', () => {
    const queue = toApprovalQueue([dirtyOrder({ id: 'can-sua', status: 'needs_edit' })]);
    expect(queue).toHaveLength(1);
  });

  it('xep TIN CU LEN TRUOC — hang cho la mot hang doi', () => {
    const queue = toApprovalQueue([
      dirtyOrder({ id: 'moi', createdAt: '2026-09-01T05:00:00.000Z' }),
      dirtyOrder({ id: 'cu', createdAt: '2026-09-01T01:00:00.000Z' }),
      dirtyOrder({ id: 'giua', createdAt: '2026-09-01T03:00:00.000Z' }),
    ]);
    expect(queue.map((item) => item.reference)).toEqual(['cu', 'giua', 'moi']);
  });
});

describe('muc trong hang cho tra loi du bon cau', () => {
  const item = toApprovalItem(dirtyOrder(), WITH_THRESHOLD);

  it('noi ro HE THONG DINH GUI GI, va do la ban xac nhan don', () => {
    expect(item.proposal.kind).toBe('xac_nhan_don');
    expect(item.proposal.title).toBe('Bản xác nhận đơn sẽ gửi vào nhóm');
    expect(item.proposal.text).toBe('Xác nhận đơn: 2 x Ghế Felix — tổng 2.300.000đ');
  });

  it('noi ro CHO AI va GOM NHUNG GI', () => {
    expect(item.order.dealerName).toBe('Đại lý Thái Nguyên');
    expect(item.order.groupName).toBe('Nhóm đại lý Thái Nguyên');
    expect(item.order.totalQuantity).toBe(2);
    expect(item.intentLabel).toBe('Đặt đơn');
  });

  it('van khong de mot truong ky thuat nao lot vao muc duyet', () => {
    const keys = new Set(collectKeys(item));
    for (const forbidden of ENGINEERING_ONLY_KEYS) {
      expect(keys.has(forbidden), `truong "${forbidden}" khong duoc co mat`).toBe(false);
    }
    expect(collectStrings(item).join(' ')).not.toContain('0af7651916cd43dd8448eb211c80319c');
  });

  it('tin tu van lay noi dung se gui, va noi ro do la ban tu van', () => {
    const advice = toApprovalItem(dirtyOrder({ priced: null }), WITH_THRESHOLD);
    expect(advice.proposal.kind).toBe('tu_van');
    expect(advice.proposal.text).toBe('Dạ em ghi nhận đơn ạ.');
  });
});

describe('VI SAO can nguoi — ly do co ma, phan biet duoc tung duong', () => {
  function codes(order = dirtyOrder(), context: ApprovalContext = WITH_THRESHOLD) {
    return approvalReasons(order, context).map((reason) => reason.code);
  }

  it('vuot nguong tu dong gui thi noi ro CA hai con so', () => {
    const order = dirtyOrder();
    const big = {
      ...order,
      priced: { ...order.priced!, lines: [{ ...order.priced!.lines[0]!, quantity: 80 }] },
    };
    const reasons = approvalReasons(big, WITH_THRESHOLD);
    expect(reasons[0]!.code).toBe('VUOT_NGUONG_TU_DONG');
    expect(reasons[0]!.text).toContain('80');
    expect(reasons[0]!.text).toContain('50');
  });

  it('KHONG khang dinh vuot nguong khi chua doc duoc nguong', () => {
    const order = dirtyOrder();
    const big = {
      ...order,
      priced: { ...order.priced!, lines: [{ ...order.priced!.lines[0]!, quantity: 80 }] },
    };
    expect(codes(big, { maxAutoConfirmQuantity: null })).not.toContain('VUOT_NGUONG_TU_DONG');
  });

  it('dong hang chua khop danh muc la mot ly do RIENG', () => {
    const order = dirtyOrder();
    const unmatched = {
      ...order,
      priced: { ...order.priced!, lines: [{ ...order.priced!.lines[0]!, matched: false }] },
    };
    expect(codes(unmatched)).toContain('CHUA_KHOP_SAN_PHAM');
  });

  it('chua xac dinh dai ly la mot ly do RIENG', () => {
    const order = dirtyOrder({ dealerName: undefined });
    const noDealer = { ...order, priced: { ...order.priced!, dealerName: null } };
    expect(codes(noDealer)).toContain('CHUA_XAC_DINH_DAI_LY');
  });

  it('moi canh bao cua rules engine thanh mot dong rieng, giu nguyen van', () => {
    const order = dirtyOrder();
    const warned = {
      ...order,
      priced: { ...order.priced!, warnings: ['Tổng đơn khách ghi lệch so với hệ thống tính.'] },
    };
    const reasons = approvalReasons(warned, WITH_THRESHOLD);
    expect(reasons.map((reason) => reason.code)).toContain('CO_CANH_BAO');
    expect(reasons.map((reason) => reason.text)).toContain(
      'Tổng đơn khách ghi lệch so với hệ thống tính.',
    );
  });

  it('N duong tu choi cho ra N ly do, khong gop lai thanh mot', () => {
    const order = dirtyOrder({ dealerName: undefined });
    const messy = {
      ...order,
      priced: {
        ...order.priced!,
        dealerName: null,
        lines: [{ ...order.priced!.lines[0]!, quantity: 80, matched: false }],
        warnings: ['Thiếu địa chỉ giao hàng.'],
      },
    };
    expect(codes(messy)).toEqual([
      'VUOT_NGUONG_TU_DONG',
      'CHUA_KHOP_SAN_PHAM',
      'CHUA_XAC_DINH_DAI_LY',
      'CO_CANH_BAO',
    ]);
  });

  it('khong co gi bat thuong thi van noi mot cau THAT, khong bia nguyen nhan', () => {
    expect(codes()).toEqual(['CHO_NGUOI_XAC_NHAN']);
  });

  it('cung mot don cho ra cung mot bo ly do — tat dinh', () => {
    expect(codes()).toEqual(codes());
  });
});
