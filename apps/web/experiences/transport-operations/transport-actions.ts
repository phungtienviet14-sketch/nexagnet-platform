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
  'transport.counterparty.read',
  'transport.counterparty.manage',
  'transport.order.read',
  'transport.order.manage',
  'transport.run.read',
  'transport.run.manage',
  'transport.expense.claim.read',
  'transport.expense.claim.submit',
  'transport.expense.claim.review',
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
  'transport.fuel.station.read',
  'transport.fuel.station.manage',
  'transport.fuel.document.read',
  'transport.fuel.document.ingest',
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
  'transport.customer_reconciliation.read',
  'transport.customer_reconciliation.confirm',
  'transport.customer_payment.read',
  'transport.customer_payment.record',
  'transport.customer_payment.allocate',
  'transport.customer_payment.correct',
  /* --- `R8` CHI SO VAN HANH (Issue #237) — den cung `transport-costing` --- */
  /**
   * BAO CAO CHI SO VAN HANH — km co hang/rong, bien truc tiep theo don va theo ca vong chay. KHONG
   * co ma GHI di kem: bao cao chi tom tat, khong sua so lieu goc. Tach khoi
   * `transport.settlement.report.read` vi hai bao cao tra loi hai cau hoi cho hai nguoi khac nhau —
   * quyet toan noi "cong ty dang o dau ve TIEN", chi so van hanh noi "doi xe chay hieu qua den dau".
   */
  'transport.analytics.read',
  /* --- THAP DIEU HANH (Lane G, #244) — den cung `transport-core` --- */
  /**
   * BANG DIEU HANH GOM CHUNG — bay cot vong chay, dem doi xe, hang viec dang cho nguoi xu ly. MOT
   * quyen cho ca bang, cung ly le voi `transport.alerts.read`. Tach khoi no vi canh bao tra loi
   * "cai gi sap hong", con bang tra loi "xe nao dang o dau va viec nao dang cho ai" — mot khach chi
   * bat `transport-core` co bang ma khong co canh bao.
   */
  'transport.control_tower.read',
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
  /* --- `TX-07b` quyet toan lai xe (Lane D, Issue #237) --- */
  'transport.driver_settlement.read',
  'transport.driver_settlement.cashout',
  'transport.driver_settlement.reverse',
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
  'transport.driver.self.expense.claim.submit',
  /**
   * Phieu luong CUA CHINH MINH — chi doc, va chi phieu DA CONG BO. Tach han khoi
   * `transport.payroll.period.read` (bang luong ca doi xe) va khong mo mot duong ghi nao.
   */
  'transport.driver.self.payslip.read',
  /**
   * Bang quyet toan CUA CHINH MINH (`TX-07b`) — da ghi nhan / da rut / con lai / hoan ung.
   *
   * Chi doc, va khong co bien the "tu rut tien cho chinh minh": mot nguoi tu chi tien cho chinh
   * minh la dung cai ma kiem soat noi bo sinh ra de chan.
   */
  'transport.driver.self.settlement.read',
  /**
   * Bam vi tri CUA CHINH MINH (Issue #235 Lane B) — ba ma rieng, vi ba viec co ba hinh dang rui
   * ro khac nhau: MO phien la mot lan chon chuyen, GUI la mot dong bang chung lap lai hang nghin
   * lan, DONG la mot moc ket thuc.
   */
  'transport.driver.self.tracking.start',
  'transport.driver.self.tracking.report',
  'transport.driver.self.tracking.stop',
  /** Chung cu bat dau/giao hang CUA CHINH MINH — mot ma cho ca hai loai. */
  'transport.driver.self.proof.record',
  /** MOC VAN HANH CUA CHINH MINH — mot ma cho ca chin loai moc (`#243` F5). */
  'transport.driver.self.checkpoint.record',
  /**
   * NHAN VIEC TAI DIA DIEM A CUA CHINH MINH (`#267` H2/H4) — HAI ma, chu khong mot.
   *
   * `.propose` DOC ("toi dang o dau"), `.confirm` TAO ra mot vong chay. Ranh gioi nay la thu ca
   * `#267` xoay quanh; chep nguyen tu API, xem khoi chu thich ben do cho ly do day du.
   */
  'transport.driver.self.site_intake.propose',
  'transport.driver.self.site_intake.confirm',
  /**
   * MO MOT PHIEN CHO NGUOI NHAN (`#279` O5) — nut `Bat dau cho` cua chinh lai xe do.
   *
   * MOT ma, va CHI mot: khong co ma `.close` o pham vi lai xe. Ho dong mot phien bang cach bam
   * `Khach da nhan hang` — mot moc — va chinh moc do dong phien.
   */
  'transport.driver.self.waiting.start',
  /** HAI ma cua lai xe cho chung tu (`#279` O1/O7). Khong co ma BIA MO. */
  'transport.driver.self.document.record',
  'transport.driver.self.receipt_handover.record',
  /** DOC phien cho (`#279` O5/O11). Ke toan CO ma nay; ma DONG thi khong. */
  'transport.waiting.read',
  'transport.waiting.close',
  /** HAI ma cho phu cap cho (`#279` O6): de nghi ⟂ quyet dinh. */
  'transport.waiting_allowance.propose',
  'transport.waiting_allowance.decide',
  /** BA ma cho chung tu van hanh (`#279` O1/O11): doc ⟂ ghi bu ⟂ bia mo. */
  'transport.operational_document.read',
  'transport.operational_document.record',
  'transport.operational_document.withdraw',
  /** BAN GIAO BIEN NHAN (`#279` O7) — hai buoc cua VAN PHONG. */
  'transport.receipt_handover.record',
  /** DONG THOI GIAN cua mot chuyen — moc, giai doan tung chang, canh bao. KHONG toa do. */
  'transport.checkpoint.read',
  /** GHI moc tu be mat van hanh — `ASSIGNED` va cac moc bu. KHONG kem chung cu vi tri. */
  'transport.checkpoint.record',
  /** TOM TAT bam vi tri — dem, quang duong, co rui ro. KHONG co toa do. */
  'transport.tracking.read',
  /** TOM TAT chung cu — loai, so anh, cach chup, phan quyet hang rao. KHONG toa do. */
  'transport.proof.read',
  /**
   * BIA MO mot chung cu — quyen RIENG, khong di kem quyen doc. Lai xe khong bao gio co no.
   * Chep nguyen tu API; xem khoi chu thich ben do cho ly do day du.
   */
  'transport.proof.withdraw',
  /**
   * DUONG DI THO cua mot con nguoi — ma hep nhat trong ca tep, va Ke toan KHONG co no.
   * Doi soat so sach khong CAN toa do; xem `ACCOUNTING_DENIED` ben duoi.
   */
  'transport.location.history.read',
  'transport.geofence.read',
  'transport.geofence.manage',
  /* --- `TX-08` SO HUU TAI SAN (Lane E, Issue #242) --- */
  'transport.asset_ownership.read',
  'transport.asset_ownership.manage',
  'transport.stakeholder.self.vehicle.read',
  /* --- `TX-08` mo rong: NAP DU LIEU ETC / PHI DUONG BO (Lane J, Issue #269) --- */
  'transport.toll.account.read',
  'transport.toll.account.manage',
  'transport.toll.import',
  'transport.toll.review.read',
  'transport.toll.review.resolve',

  /* --- `TX-09` NGHIEM THU CHUNG TU / THUONG MAI (Lane I, Issue #268) --- */
  /**
   * DOC hang cho nghiem thu — vong chay da chay xong, dang cho chung tu duoc A xac nhan. Tach khoi
   * `transport.checkpoint.read`: dong thoi gian moc noi "xe da lam gi, luc nao"; hang cho nay noi
   * "ho so nao dang cho nguoi co tham quyen ky, va cai gi con thieu".
   */
  'transport.commercial_acceptance.read',
  /**
   * QUYET DINH nghiem thu — duyet / khong chap nhan / doi bo sung chung tu. Chi Giam doc va Ke toan.
   *
   * KHONG co bien the "cua chinh minh": mot lai xe tu nghiem thu chuyen cua chinh minh la dung cai
   * ma kiem soat noi bo sinh ra de chan. Va no KHONG mo mot duong sua nao vao can cu —
   * `transport.checkpoint.record` / `transport.proof.withdraw` van nam trong `ACCOUNTING_DENIED`.
   */
  'transport.commercial_acceptance.decide',
  /* --- `TX-11` DIEU XE (Lane M, Issue #277) — chi doc; duong ghi dung `transport.run.manage` --- */
  'transport.dispatch.suggest.read',
] as const;

export type TransportAction = (typeof TRANSPORT_ACTIONS)[number];

export const SELF_SCOPE_ACTIONS: readonly TransportAction[] = [
  'transport.driver.self.trip.read',
  'transport.driver.self.trip.update',
  'transport.driver.self.fund.read',
  'transport.driver.self.fuel.read',
  'transport.driver.self.fuel.submit',
  'transport.driver.self.expense.record',
  'transport.driver.self.expense.claim.submit',
  'transport.driver.self.payslip.read',
  'transport.driver.self.settlement.read',
  'transport.driver.self.tracking.start',
  'transport.driver.self.tracking.report',
  'transport.driver.self.tracking.stop',
  'transport.driver.self.proof.record',
  'transport.driver.self.checkpoint.record',
  'transport.driver.self.site_intake.propose',
  'transport.driver.self.site_intake.confirm',
  'transport.driver.self.waiting.start',
  'transport.driver.self.document.record',
  'transport.driver.self.receipt_handover.record',
];

/**
 * PHAM VI BEN HUU QUAN (`TX-08`) — chep nguyen tu API.
 *
 * KHONG vai nao cap cac ma nay, va do khong phai mot thieu sot: pham vi "Xe toi co co phan" den tu
 * mot hang `TransportAssetStakeholder.authUserId`, khong tu mot chuc danh. Xem khoi
 * `STAKEHOLDER_SCOPE_ACTIONS` trong `apps/api/src/transport/transport-actions.ts`.
 *
 * Hau qua o phia man hinh: `canPerform` tra `false` cho moi vai, nen KHONG duoc dung no lam dieu
 * kien hien be mat ben huu quan. Dieu kien dung la API tra ve du lieu hay `403`.
 */
export const STAKEHOLDER_SCOPE_ACTIONS: readonly TransportAction[] = [
  'transport.stakeholder.self.vehicle.read',
];

/** Moi hanh dong van hanh — tuc tat ca TRU pham vi lai xe va pham vi ben huu quan. */
const OPERATIONS_ACTIONS: readonly TransportAction[] = TRANSPORT_ACTIONS.filter(
  (action): action is TransportAction =>
    !SELF_SCOPE_ACTIONS.includes(action) && !STAKEHOLDER_SCOPE_ACTIONS.includes(action),
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
  /**
   * Ke toan doc duoc TOM TAT bam vi tri (`transport.tracking.read`) — du de doi soat mot chuyen
   * co chung cu vi tri hay khong — nhung KHONG doc duoc duong di tung phut cua mot con nguoi.
   * Chep nguyen tu API; xem khoi chu thich ben do cho ly do day du.
   */
  'transport.location.history.read',
  /**
   * GHI moc van hanh (`#243` F1) — Ke toan DOC duoc dong thoi gian, KHONG ghi duoc moc.
   *
   * Phan cong nhiem vu: F4 dat phu cap cho tren mot con so do duoc tu chinh chuoi moc, nen nguoi
   * DUYET khoan tien do khong duoc sua can cu sinh ra no. Chep nguyen tu API.
   */
  'transport.checkpoint.record',
  /**
   * DONG mot phien cho (`#279` O5) — cung phan cong nhiem vu, va o day chat hon: gio dong la moc
   * tren cua khoang thoi gian ma Ke toan sap duyet tien cho.
   */
  'transport.waiting.close',
  /**
   * BIA MO mot chung tu van hanh (`#279` O2/O12) — Ke toan DOC duoc, KHONG go duoc.
   *
   * To giay do co the la can cu cua chinh lan `Da ket thuc` ma ho sap bam.
   */
  'transport.operational_document.withdraw',
  /**
   * Ke toan DOC duoc chung cu — do la ca cong viec cua ho — nhung RUT mot chung cu la viec khac:
   * go bo mot muc khoi chinh ho so minh dang doi soat.
   */
  'transport.proof.withdraw',
  /**
   * Hang rao duoc cham LUC DOC, nen them mot hang rao hom nay doi phan quyet cua MOI chung cu cu.
   * Quyen do thuoc van hanh, khong thuoc nguoi dang doi soat chinh nhung lan giao do.
   */
  'transport.geofence.manage',
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
