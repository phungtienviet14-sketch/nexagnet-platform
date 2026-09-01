/**
 * TRANG THAI CUA MOT THAO TAC GHI tren be mat khach — duyet, tu choi, danh dau da nhap don.
 *
 * VI SAO DAY LA MOT MODULE THUAN, khong phai vai bien `useState` rai trong component:
 *
 * Ba luat duoi day la LUAT NGHIEP VU, khong phai chi tiet trinh bay, va ca ba deu tung la nguon
 * cua su co that o cac san pham kieu nay:
 *
 *   1. MOT lan bam dang chay tai mot thoi diem. Bam hai lan vao "Duyệt & gửi" = gui hai tin vao
 *      nhom dai ly. Khong hoan tac duoc bang mot loi xin loi.
 *   2. THAT BAI PHAI O LAI tren man hinh cho den khi nguoi dung xu ly no. Mot loi bien mat vi
 *      danh sach vua tu tai lai la mot loi khong ai biet da xay ra — va don do thi van chua gui.
 *   3. THANH CONG XOA loi CUA DUNG DONG DO, khong xoa loi cua dong khac.
 *
 * Viet o day thi ba luat nay kiem tra duoc bang test chay trong mot phan nghin giay, va khong
 * phu thuoc vao viec dung duoc mot trinh duyet trong bo test.
 */

export type OrderActionKind = 'approve' | 'reject' | 'complete-handoff';

export interface PendingAction {
  readonly reference: string;
  readonly kind: OrderActionKind;
}

export interface OrderActionState {
  /** Lan bam DANG chay, hoac `null` khi dang ranh. Toi da MOT. */
  readonly pending: PendingAction | null;
  /** Loi con dang hien, theo tung don. Khoa la ma tham chieu cua don. */
  readonly failures: Readonly<Record<string, string>>;
}

export const IDLE_ORDER_ACTION_STATE: OrderActionState = { pending: null, failures: {} };

export type OrderActionEvent =
  | { readonly type: 'start'; readonly reference: string; readonly kind: OrderActionKind }
  | { readonly type: 'succeeded'; readonly reference: string }
  | { readonly type: 'failed'; readonly reference: string; readonly message: string }
  | { readonly type: 'dismiss'; readonly reference: string };

function without(
  failures: Readonly<Record<string, string>>,
  reference: string,
): Readonly<Record<string, string>> {
  if (!(reference in failures)) return failures;
  const next = { ...failures };
  delete next[reference];
  return next;
}

export const ORDER_ACTION_FAILURE_FALLBACK =
  'Chưa thực hiện được thao tác này. Thử lại; nếu vẫn vậy, báo quản trị viên.';

export function orderActionReducer(
  state: OrderActionState,
  event: OrderActionEvent,
): OrderActionState {
  switch (event.type) {
    case 'start':
      // Dang co mot lan bam chay thi BO QUA lan bam moi. Bo qua chu khong xep hang: nguoi dung
      // bam nhanh hai lan la muon LAM MOT LAN, khong phai muon lam hai lan.
      if (state.pending) return state;
      return {
        pending: { reference: event.reference, kind: event.kind },
        failures: without(state.failures, event.reference),
      };
    case 'succeeded':
      return { pending: null, failures: without(state.failures, event.reference) };
    case 'failed':
      return {
        pending: null,
        failures: { ...state.failures, [event.reference]: event.message },
      };
    case 'dismiss':
      return { pending: state.pending, failures: without(state.failures, event.reference) };
    default:
      return state;
  }
}

/** Co lan bam nao dang chay khong — dung de KHOA moi nut, khong chi nut vua bam. */
export function isActionRunning(state: OrderActionState): boolean {
  return state.pending !== null;
}

/** Dong nay co dang chay khong — dung de doi chu tren dung nut do sang "Đang gửi…". */
export function pendingKindFor(
  state: OrderActionState,
  reference: string,
): OrderActionKind | null {
  return state.pending?.reference === reference ? state.pending.kind : null;
}

export function failureFor(state: OrderActionState, reference: string): string | null {
  return state.failures[reference] ?? null;
}

/**
 * Cau loi doc duoc cho nguoi dung.
 *
 * Loi tu API DA la tieng nghiep vu o cac duong quan trong ("Đơn ở trạng thái sent, không thể từ
 * chối", "Gửi xác nhận vào nhóm Zalo thất bại"), nen giu no lai la co ich THAT — khac han truong
 * hop loi tai danh sach o `SectionState.ErrorState`, noi thu den tay nguoi dung chi la
 * "Failed to fetch". Nhung khong tin tuong mu quang: chuoi qua dai hoac rong thi thay bang cau
 * du phong, de mot vet stack hay mot trang HTML loi khong bao gio do ra man hinh khach.
 */
const MAX_FAILURE_LENGTH = 200;

export function readableFailure(error: unknown): string {
  const raw = error instanceof Error ? error.message.trim() : '';
  if (raw.length === 0 || raw.length > MAX_FAILURE_LENGTH) return ORDER_ACTION_FAILURE_FALLBACK;
  if (/<[a-z!/]/i.test(raw)) return ORDER_ACTION_FAILURE_FALLBACK;
  return raw;
}
