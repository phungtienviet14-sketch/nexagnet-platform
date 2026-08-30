import type { UserRole } from '../auth/auth.types.js';

/**
 * HANH DONG cua mien van tai — T1 §11.1.
 *
 * Hanh dong dat theo MIEN, khong theo chuc danh: "duoc huy chuyen" la mot nang luc, "Giam doc" la
 * mot vai. Khach sau co them "Dieu hanh vien" thi them mot mau vai, khong sua base.
 *
 * KHOANG CACH VOI NEN TANG (`PG-02`, do tren main): auth as-built chi co mot enum vai PHANG
 * (`USER_ROLES`) va `RolesGuard` so `user.role` voi danh sach tren handler. Khong co khai niem
 * action, khong co vai `DRIVER`, khong co gioi han theo dong. T2 KHONG dung IAM moi — chi thi
 * workstream cam. Thay vao do:
 *
 *   · mien cong bo hang so co kieu (tep nay) va kiem quyen qua `roleCanPerform`;
 *   · cau BRIDGE vai→hanh dong nam DUNG MOT CHO, o day, o tang bien gioi;
 *   · code nghiep vu KHONG duoc viet `if (role === ...)` o bat cu dau.
 *
 * Khi auth foundation co permission that, chi mot bang duoi day doi. Neu khong lam vay tu dau thi
 * chi phi dao nguoc cua `GD-22` nhay tu "trung binh" len "rat cao" — T1 §21 ghi ro dieu do.
 */
export const TRANSPORT_ACTIONS = [
  'transport.vehicle.read',
  'transport.vehicle.manage',
  'transport.driver.read',
  'transport.driver.manage',
  'transport.customer.read',
  'transport.customer.manage',
  'transport.partner.read',
  'transport.partner.manage',
  'transport.trip.read',
  'transport.trip.create',
  'transport.trip.update',
  'transport.trip.assign',
  'transport.trip.transition',
  'transport.trip.cancel',
  /* --- `transport-costing` (`TX-03`) --- */
  'transport.costing.expense.read',
  'transport.costing.expense.record',
  'transport.costing.driver_fund.read',
  'transport.costing.driver_fund.advance',
  'transport.costing.driver_fund.return',
  'transport.costing.driver_fund.adjust',
  /**
   * DAO mot su kien da ghi — `INV-20`. Mot hanh dong RIENG, khong gop vao `.record`.
   *
   * Ghi mot khoan chi va dao mot khoan chi da ghi la hai quyen khac nhau ve muc do: cai thu nhat la
   * viec hang ngay, cai thu hai viet lai cai da bao cao. Gop chung se lam moi nguoi ghi duoc chi
   * phi cung dao duoc lich su, va bang phan quyen se khong con noi len dieu do.
   */
  'transport.costing.reversal.post',
  'transport.costing.period.read',
  'transport.costing.period.manage',
  /**
   * MO LAI mot ky da dong — `GD-11` doi mot quyen RIENG, khong phai quyen quan ly ky thong thuong.
   *
   * Do la ly do no khong nam trong `.period.manage`: dong ky la viec cuoi thang cua Ke toan, con mo
   * lai mot ky da bao cao ra ngoai la mot quyet dinh cua Giam doc.
   */
  'transport.costing.period.reopen',

  /** Pham vi CUA CHINH MINH — lai xe. Cuong che bang quyen so huu phan cong, xem `TripService`. */
  'transport.driver.self.trip.read',
  'transport.driver.self.trip.update',
  /** So quy CUA CHINH MINH. Danh tinh den tu phien, khong tu mot `:driverId` tren duong dan. */
  'transport.driver.self.fund.read',
] as const;

export type TransportAction = (typeof TRANSPORT_ACTIONS)[number];

const SELF_SCOPE_ACTIONS: readonly TransportAction[] = [
  'transport.driver.self.trip.read',
  'transport.driver.self.trip.update',
  'transport.driver.self.fund.read',
];

/** Moi hanh dong van hanh — tuc tat ca TRU pham vi lai xe. */
const OPERATIONS_ACTIONS: readonly TransportAction[] = TRANSPORT_ACTIONS.filter(
  (action): action is TransportAction => !SELF_SCOPE_ACTIONS.includes(action),
);

/**
 * CAU BRIDGE DEMO `GD-22` — mau vai nghiep vu → bon vai as-built cua nen tang.
 *
 * Giam doc → `ADMIN` · Ke toan → `ACCOUNTING` · Lai xe → `SALE` (CHO GIU TAM, khong phai mot quyet
 * dinh nghiep vu: nen tang chua co vai `DRIVER`).
 *
 * `MANAGER` co y KHONG duoc cap gi. Ba mau vai la tat ca nhung gi khach da noi (VT-080); che mot
 * anh xa thu tu cho `MANAGER` la dua mot chinh sach ma KHONG AI QUYET vao base, roi moi khach van
 * tai sau deu thua huong. Fail-closed o day la cau tra loi trung thuc: chua ai noi vai nay lam gi
 * trong nghiep vu van tai.
 *
 * `SALE` chi co pham vi CUA CHINH MINH. Va vi `SALE` la vai dong nhat cua nen tang hom nay, dieu
 * KHONG duoc phep xay ra la mot `SALE` bat ky doc duoc moi chuyen — nen no khong he co
 * `transport.trip.read`. Rieng viec cat hanh dong VAN CHUA DU: cong that nam o quyen so huu phan
 * cong (`TripService.driverTrip`), vi hai `SALE` khac nhau van cung mot vai.
 */
/**
 * Hai hanh dong Ke toan KHONG co, moi cai mot ly do khac nhau:
 *
 *   · `transport.trip.cancel`            — VT-082 "khong xoa du lieu" (`GD-02`: huy thay xoa);
 *   · `transport.costing.period.reopen`  — `GD-11`: mo lai mot ky DA BAO CAO can quyen rieng.
 *
 * Ke toan VAN duoc tao tam ung va dong ky: Issue #85 ghi ro "Director and Accountant can create
 * advances", va dong ky cuoi thang la viec cua chinh ho.
 */
const ACCOUNTING_DENIED: readonly TransportAction[] = [
  'transport.trip.cancel',
  'transport.costing.period.reopen',
];

const ROLE_ACTIONS: Readonly<Record<UserRole, readonly TransportAction[]>> = {
  ADMIN: OPERATIONS_ACTIONS,
  ACCOUNTING: OPERATIONS_ACTIONS.filter((action) => !ACCOUNTING_DENIED.includes(action)),
  SALE: SELF_SCOPE_ACTIONS,
  MANAGER: [],
};

export const actionsForRole = (role: UserRole): readonly TransportAction[] => ROLE_ACTIONS[role];

export const roleCanPerform = (role: UserRole, action: TransportAction): boolean =>
  ROLE_ACTIONS[role].includes(action);
