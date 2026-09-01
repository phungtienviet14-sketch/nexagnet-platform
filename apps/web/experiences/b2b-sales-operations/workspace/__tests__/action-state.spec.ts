import { describe, expect, it } from 'vitest';
import {
  failureFor,
  isActionRunning,
  orderActionReducer,
  pendingKindFor,
  readableFailure,
  IDLE_ORDER_ACTION_STATE,
  ORDER_ACTION_FAILURE_FALLBACK,
  type OrderActionEvent,
  type OrderActionState,
} from '../action-state';

function play(...events: readonly OrderActionEvent[]): OrderActionState {
  return events.reduce(orderActionReducer, IDLE_ORDER_ACTION_STATE);
}

describe('duyet thanh cong (Issue #110 §Required tests)', () => {
  it('bam duyet khoa moi nut, va lan duyet xong thi mo lai', () => {
    const running = play({ type: 'start', reference: 'ord-1', kind: 'approve' });
    expect(isActionRunning(running)).toBe(true);
    expect(pendingKindFor(running, 'ord-1')).toBe('approve');
    // Dong KHAC cung bi khoa: chi mot lan ghi chay tai mot thoi diem.
    expect(pendingKindFor(running, 'ord-2')).toBeNull();

    const done = orderActionReducer(running, { type: 'succeeded', reference: 'ord-1' });
    expect(isActionRunning(done)).toBe(false);
    expect(pendingKindFor(done, 'ord-1')).toBeNull();
  });
});

describe('tu choi thanh cong', () => {
  it('di qua dung mot vong doi nhu duyet, chi khac o loai thao tac', () => {
    const running = play({ type: 'start', reference: 'ord-1', kind: 'reject' });
    expect(pendingKindFor(running, 'ord-1')).toBe('reject');
    expect(isActionRunning(orderActionReducer(running, { type: 'succeeded', reference: 'ord-1' })))
      .toBe(false);
  });
});

describe('bam hai lan khong duoc gui hai lan', () => {
  it('lan bam thu hai bi BO QUA trong khi lan thu nhat chua xong', () => {
    const state = play(
      { type: 'start', reference: 'ord-1', kind: 'approve' },
      { type: 'start', reference: 'ord-1', kind: 'approve' },
      { type: 'start', reference: 'ord-2', kind: 'reject' },
    );
    expect(state.pending).toEqual({ reference: 'ord-1', kind: 'approve' });
  });
});

describe('that bai PHAI o lai tren man hinh', () => {
  it('loi hien ra dung dong cua no va khong tu bien mat', () => {
    const failed = play(
      { type: 'start', reference: 'ord-1', kind: 'approve' },
      { type: 'failed', reference: 'ord-1', message: 'Gửi xác nhận vào nhóm Zalo thất bại' },
    );
    expect(failureFor(failed, 'ord-1')).toBe('Gửi xác nhận vào nhóm Zalo thất bại');
    expect(isActionRunning(failed)).toBe(false);

    // Lam viec o mot don KHAC khong duoc xoa loi cua don nay.
    const elsewhere = play(
      { type: 'start', reference: 'ord-1', kind: 'approve' },
      { type: 'failed', reference: 'ord-1', message: 'Gửi thất bại' },
      { type: 'start', reference: 'ord-2', kind: 'approve' },
      { type: 'succeeded', reference: 'ord-2' },
    );
    expect(failureFor(elsewhere, 'ord-1')).toBe('Gửi thất bại');
    expect(failureFor(elsewhere, 'ord-2')).toBeNull();
  });

  it('thu lai THANH CONG thi loi cua chinh don do bien mat', () => {
    const recovered = play(
      { type: 'start', reference: 'ord-1', kind: 'approve' },
      { type: 'failed', reference: 'ord-1', message: 'Gửi thất bại' },
      { type: 'start', reference: 'ord-1', kind: 'approve' },
      { type: 'succeeded', reference: 'ord-1' },
    );
    expect(failureFor(recovered, 'ord-1')).toBeNull();
  });

  it('nguoi dung tu an duoc thong bao loi', () => {
    const dismissed = play(
      { type: 'start', reference: 'ord-1', kind: 'approve' },
      { type: 'failed', reference: 'ord-1', message: 'Gửi thất bại' },
      { type: 'dismiss', reference: 'ord-1' },
    );
    expect(failureFor(dismissed, 'ord-1')).toBeNull();
  });
});

describe('cau loi doc duoc cho nguoi khong doc log', () => {
  it('giu nguyen cau nghiep vu do may chu tra ve', () => {
    expect(readableFailure(new Error('Đơn ở trạng thái sent, không thể từ chối'))).toBe(
      'Đơn ở trạng thái sent, không thể từ chối',
    );
  });

  it('thay bang cau du phong khi chuoi rong, qua dai, hoac la mot trang HTML loi', () => {
    expect(readableFailure(new Error(''))).toBe(ORDER_ACTION_FAILURE_FALLBACK);
    expect(readableFailure(new Error('x'.repeat(400)))).toBe(ORDER_ACTION_FAILURE_FALLBACK);
    expect(readableFailure(new Error('<!doctype html><title>502</title>'))).toBe(
      ORDER_ACTION_FAILURE_FALLBACK,
    );
    expect(readableFailure('khong phai Error')).toBe(ORDER_ACTION_FAILURE_FALLBACK);
  });
});
