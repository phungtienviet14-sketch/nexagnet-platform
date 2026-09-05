import type { AuthRole } from '../../lib/auth';

/**
 * CAU BRIDGE `GD-22` phia MAN HINH — ban guong cua `apps/api/src/transport/transport-actions.ts`.
 *
 * Vi sao web phai guong lai thay vi import: `packages/tenant` khong xuat mot kieu vai/hanh dong nao,
 * va `apps/api` khong phai dependency cua `apps/web`. Nen ban sao la BAT BUOC — cai khong bat buoc
 * la de no LECH trong im lang. `__tests__/transport-actions.spec.ts` doc thang tep cua API tu dia
 * va so tung hanh dong, nen mot lan API doi bang phan quyen ma web khong doi se lam DO test, chu
 * khong lam sai lang le mot man hinh khach.
 *
 * QUY TAC: khong mot tep nao khac trong experience nay duoc viet `if (role === ...)`. Man hinh hoi
 * `canPerform(...)`, khong hoi chuc danh — dung nhu §11.1 cua hop dong mien: hanh dong dat theo
 * MIEN, khong theo chuc danh.
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
  'transport.costing.reversal.post',
  'transport.costing.period.read',
  'transport.costing.period.manage',
  'transport.costing.period.reopen',
  /* --- `transport-fuel` (`TX-04`) --- */
  'transport.fuel.entry.read',
  'transport.fuel.entry.submit_for_driver',
  'transport.fuel.entry.verify',
  'transport.fuel.statement.import',
  'transport.fuel.reconciliation.read',
  'transport.fuel.reconciliation.match',
  'transport.fuel.reconciliation.resolve',
  'transport.fuel.reconciliation.close',
  'transport.fuel.reconciliation.reopen',
  /* --- `transport-settlement` (`TX-05`) --- */
  /**
   * BAO CAO quyet toan — tuoi no, cong no phai tra, vi the doi tac, bien truc tiep, cong don. MOT
   * ma cho ca nam bao cao: chung tra loi cung mot cau hoi nghiep vu ("cong ty dang o dau ve tien").
   * `TX-05` di vao HTTP o T7 va KHONG mang mot ma GHI nao — bao cao khong bao gio sua so.
   */
  'transport.settlement.report.read',
  /**
   * CHUOI CHUNG TU goc + cac ban dieu chinh/dao — tach khoi `.report.read`. Bao cao noi "con no bao
   * nhieu"; chuoi chung tu noi "ai da sua con so nay, luc nao, vi sao". Do la mot quyen khac.
   */
  'transport.settlement.document.read',
  /* --- `transport-asset-compliance` (`TX-06`) --- */
  'transport.maintenance.plan.read',
  'transport.maintenance.plan.manage',
  'transport.maintenance.work_order.open',
  'transport.maintenance.work_order.close',
  'transport.compliance.document.read',
  'transport.compliance.document.manage',
  'transport.fleet_status.read',
  'transport.alerts.read',
  /* --- `transport-workforce` (`TX-07`) --- */
  'transport.payroll.period.read',
  'transport.payroll.period.manage',
  'transport.payroll.run',
  'transport.payslip.approve',
  'transport.payslip.pay',
  'transport.payslip.correct',
  /* --- pham vi CUA CHINH MINH — lai xe --- */
  'transport.driver.self.trip.read',
  'transport.driver.self.trip.update',
  'transport.driver.self.fund.read',
  'transport.driver.self.fuel.read',
  'transport.driver.self.fuel.submit',
  /**
   * Khoan chi thuong CUA CHINH MINH — tach han khoi `transport.costing.expense.record`, vi ma van
   * hanh kia ghi duoc cho bat ky chuyen/lai xe nao va chon duoc ca nguon `COMPANY_DIRECT`.
   */
  'transport.driver.self.expense.record',
  /**
   * Phieu luong CUA CHINH MINH — chi doc, va chi phieu DA CONG BO. Tach han khoi
   * `transport.payroll.period.read` (bang luong ca doi xe) va khong mo mot duong ghi nao.
   */
  'transport.driver.self.payslip.read',
] as const;

export type TransportAction = (typeof TRANSPORT_ACTIONS)[number];

export const SELF_SCOPE_ACTIONS: readonly TransportAction[] = [
  'transport.driver.self.trip.read',
  'transport.driver.self.trip.update',
  'transport.driver.self.fund.read',
  'transport.driver.self.fuel.read',
  'transport.driver.self.fuel.submit',
  'transport.driver.self.expense.record',
  'transport.driver.self.payslip.read',
];

/** Moi hanh dong van hanh — tuc tat ca TRU pham vi lai xe. */
const OPERATIONS_ACTIONS: readonly TransportAction[] = TRANSPORT_ACTIONS.filter(
  (action): action is TransportAction => !SELF_SCOPE_ACTIONS.includes(action),
);

/**
 * Ba hanh dong Ke toan KHONG co, moi cai mot ly do rieng — chep nguyen tu API:
 *
 *   · `transport.trip.cancel`                — VT-082 "khong xoa du lieu" (`GD-02`);
 *   · `transport.costing.period.reopen`      — `GD-11`: mo lai ky DA BAO CAO can quyen rieng;
 *   · `transport.fuel.reconciliation.reopen` — cung khuon `GD-11` cho ky doi soat bang ke.
 */
const ACCOUNTING_DENIED: readonly TransportAction[] = [
  'transport.trip.cancel',
  'transport.costing.period.reopen',
  'transport.fuel.reconciliation.reopen',
];

/**
 * Bon vai as-built cua nen tang → hanh dong. Giam doc → `ADMIN` · Ke toan → `ACCOUNTING` ·
 * Lai xe → `SALE` (CHO GIU TAM: nen tang chua co vai `DRIVER`).
 *
 * `MANAGER: []` la CO Y va duoc chep y nguyen tu API. Khach chi noi ve ba mau vai (VT-080); che mot
 * anh xa thu tu cho `MANAGER` la dua vao base mot chinh sach khong ai quyet. Hau qua tren man hinh
 * phai duoc noi that: xem `MANAGER_HAS_NO_TRANSPORT_SCOPE`.
 *
 * `ADMIN` KHONG co pham vi lai xe — do la ket qua that cua bang nay, va no lam ba route
 * `/transport/me/*` tra 403 cho `ADMIN` du controller con ghi `@Roles('SALE','ADMIN')`.
 */
const ROLE_ACTIONS: Readonly<Record<AuthRole, readonly TransportAction[]>> = {
  ADMIN: OPERATIONS_ACTIONS,
  ACCOUNTING: OPERATIONS_ACTIONS.filter((action) => !ACCOUNTING_DENIED.includes(action)),
  SALE: SELF_SCOPE_ACTIONS,
  MANAGER: [],
};

export const actionsForRole = (role: AuthRole): readonly TransportAction[] => ROLE_ACTIONS[role];

export const roleCanPerform = (role: AuthRole, action: TransportAction): boolean =>
  ROLE_ACTIONS[role].includes(action);

/**
 * `role === null` nghia la KHONG BIET vai, khong phai "khong co quyen".
 *
 * Xay ra o hai luc that: (a) `AuthGate` dang doi `/auth/me`, va (b) tenant chay che do khong phien
 * dang nhap, luc do MOI guard cua API tra `true` ngay (`transport-action.guard.ts:50`). Ca hai
 * truong hop, an bot theo vai la noi doi theo huong nguoc lai — man hinh se ke rang khach khong lam
 * duoc viec ma API dang cho phep. Nen o day tra `true`, dung khuon `isSectionEnabled` cua b2b.
 */
export const canPerform = (role: AuthRole | null, action: TransportAction): boolean =>
  role === null ? true : roleCanPerform(role, action);

/** Vai co it nhat mot hanh dong van hanh — tuc thay duoc mot man hinh dieu hanh nao do. */
export const hasOperationsScope = (role: AuthRole | null): boolean =>
  role === null || OPERATIONS_ACTIONS.some((action) => roleCanPerform(role, action));

/** Vai co pham vi lai xe — dieu kien de be mat lai xe co nghia. */
export const hasDriverScope = (role: AuthRole | null): boolean =>
  role === null || SELF_SCOPE_ACTIONS.some((action) => roleCanPerform(role, action));

/**
 * Cau noi that cho `MANAGER`. KHONG duoc thay bang mot anh xa quyen tu phat trong web: neu khach
 * muon vai nay lam duoc viec, cho dung de sua la bang o `apps/api/src/transport/transport-actions.ts`.
 */
export const MANAGER_HAS_NO_TRANSPORT_SCOPE =
  'Tài khoản của bạn chưa được cấp quyền dùng phần vận hành vận tải. Hãy liên hệ quản trị viên ' +
  'của doanh nghiệp để được mở quyền.';

/**
 * Cau cho mot vai KHONG co pham vi van hanh — va hai truong hop nay phai noi HAI cau khac nhau.
 *
 * Lai xe (`SALE`) khong thay man hinh van hanh la DUNG THIET KE, va viec can lam cua ho la mo be
 * mat cua chinh minh. Con `MANAGER` khong thay gi la mot khoang trong phan quyen chua ai quyet.
 * Dung mot cau cho ca hai se noi voi lai xe rang ho la Quan ly — mot cau sai, va sai theo kieu lam
 * nguoi doc mat tin vao ca man hinh.
 */
export const operationsEmptyMessage = (role: AuthRole | null): string =>
  hasDriverScope(role) && !hasOperationsScope(role)
    ? 'Vai Lái xe chỉ mở màn hình của chính mình, không mở màn hình vận hành. Hãy dùng đường "Mở màn hình lái xe".'
    : MANAGER_HAS_NO_TRANSPORT_SCOPE;
