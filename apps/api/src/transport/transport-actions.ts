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

  /* --- `transport-fuel` (`TX-04`) --- */
  'transport.fuel.entry.read',
  /**
   * Nop/sua HO mot phieu — duong cua Ke toan khi lai xe dua phieu giay.
   *
   * Tach khoi `transport.driver.self.fuel.submit` co chu dich: hai hanh dong nay khac nhau ve CHAT.
   * Cai kia la "nop phieu cua chinh toi" (danh tinh tu phien); cai nay la "nop phieu THAY MOT NGUOI
   * KHAC", va no phai la mot quyen ma khong lai xe nao co.
   */
  'transport.fuel.entry.submit_for_driver',
  'transport.fuel.entry.verify',
  'transport.fuel.statement.import',
  'transport.fuel.reconciliation.read',
  'transport.fuel.reconciliation.match',
  'transport.fuel.reconciliation.resolve',
  'transport.fuel.reconciliation.close',
  /**
   * MO LAI mot ky doi soat da dong — `GD-11` doi mot quyen RIENG, giong het
   * `transport.costing.period.reopen` cua T3.
   *
   * Dong ky la viec cuoi thang cua Ke toan; mo lai mot ky DA BAO CAO RA NGOAI la quyet dinh cua
   * Giam doc. Gop hai quyen se lam bang phan quyen khong con noi len dieu do.
   */
  'transport.fuel.reconciliation.reopen',

  /* --- `transport-asset-compliance` (`TX-06`) --- */
  'transport.maintenance.plan.read',
  'transport.maintenance.plan.manage',
  /**
   * MO mot lenh sua — tach khoi `.close` co chu dich.
   *
   * Mo mot lenh la KHOA MOT XE khoi doi hinh: tu luc do phep hop thanh tra ve
   * `UNDER_MAINTENANCE` va dieu do vien khong dieu chuyen len no nua. Dong lai thi nguoc lai.
   * Hai quyen do khac nhau ve hau qua van hanh, nen bang phan quyen phai noi duoc dieu do.
   */
  'transport.maintenance.work_order.open',
  'transport.maintenance.work_order.close',
  'transport.compliance.document.read',
  'transport.compliance.document.manage',
  /** Trang thai HIEU LUC cua doi xe — phep hop thanh cua T1 §18.2, chi doc. */
  'transport.fleet_status.read',
  /** Bang canh bao van hanh gom chung (VT-015, VT-065). */
  'transport.alerts.read',

  /* --- `transport-workforce` (`TX-07`) --- */
  'transport.payroll.period.read',
  'transport.payroll.period.manage',
  /**
   * CHAY luong cho mot ky — tach khoi `.period.manage`.
   *
   * Mo mot ky la mot thao tac lich; chay luong SINH RA cac phieu mang so tien. Gop chung se lam
   * moi nguoi mo duoc ky cung tinh duoc tien cho ca doi xe.
   */
  'transport.payroll.run',
  'transport.payslip.approve',
  'transport.payslip.pay',
  /**
   * Sua mot phieu DA CHOT bang phieu bo sung / phieu dao (`INV-20`).
   *
   * Quyen RIENG, cung ly le voi `transport.costing.reversal.post` cua T3: ghi mot phieu luong la
   * viec cuoi thang, con sua mot phieu DA TRA la viet lai mot con so da bao ra ngoai.
   */
  'transport.payslip.correct',
  /** Pham vi CUA CHINH MINH — lai xe. Cuong che bang quyen so huu phan cong, xem `TripService`. */
  'transport.driver.self.trip.read',
  'transport.driver.self.trip.update',
  /** So quy CUA CHINH MINH. Danh tinh den tu phien, khong tu mot `:driverId` tren duong dan. */
  'transport.driver.self.fund.read',
  /** PHIEU DO DAU CUA CHINH MINH — nop va xem. Danh tinh den tu phien, khong tu than yeu cau. */
  'transport.driver.self.fuel.read',
  'transport.driver.self.fuel.submit',
] as const;

export type TransportAction = (typeof TRANSPORT_ACTIONS)[number];

const SELF_SCOPE_ACTIONS: readonly TransportAction[] = [
  'transport.driver.self.trip.read',
  'transport.driver.self.trip.update',
  'transport.driver.self.fund.read',
  'transport.driver.self.fuel.read',
  'transport.driver.self.fuel.submit',
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
 *
 * T4 them MOT dong theo dung khuon do: `transport.fuel.reconciliation.reopen`. Ke toan DONG duoc
 * mot ky doi soat bang ke — do la viec cuoi thang cua ho — nhung MO LAI mot ky da phat ban giao
 * cong no ra ngoai la mot quyet dinh khac han ve muc do (`GD-11`).
 */
const ACCOUNTING_DENIED: readonly TransportAction[] = [
  'transport.trip.cancel',
  'transport.costing.period.reopen',
  'transport.fuel.reconciliation.reopen',
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
