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
  /**
   * DANH TINH PHAP NHAN (R1-A, #230) — doc va quan ly xuong song noi nhieu ban ghi chuyen mon
   * ve mot doanh nghiep.
   *
   * Hai ma chu khong mot: doc danh tinh la viec hang ngay cua bat ky ai xem cong no; NOI hai ban
   * ghi lai voi nhau doi mot bao cao gop theo phap nhan, nen no phai la mot quyen rieng.
   */
  'transport.counterparty.read',
  'transport.counterparty.manage',
  /**
   * MO HINH VAN CHUYEN v2 (R1-B, #232 `D-01` / #234 A1) -- nghia vu thuong mai va vong chay
   * vat ly la HAI TRUC DOC LAP, nen chung co HAI cap quyen rieng: mot nguoi duoc phep nhap don
   * khach dat khong nhat thiet duoc phep dieu xe, va nguoc lai.
   */
  'transport.order.read',
  'transport.order.manage',
  'transport.run.read',
  'transport.run.manage',
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
  /**
   * DANH MUC CAY XANG (Lane C / C1) — doc va quan ly tram, bi danh, sieu du lieu hop dong.
   *
   * Hai ma, va chung KHONG gop vao `transport.fuel.entry.*`: phieu do dau la CHUNG TU (sinh moi
   * ngay, khoa lai sau doi soat), tram la MASTER DATA (sua bat cu luc nao). Mot nguoi duoc duyet
   * phieu khong hien nhien duoc sua danh muc tram — va nguoc lai, nguoi nhap danh muc khong can
   * mot quyen dong tien nao.
   *
   * `.read` cung phuc vu duong NHAN DANG (`GET stations/resolve`): do la mot phep doc tren cung
   * tap du lieu, chi khac cach hoi.
   */
  'transport.fuel.station.read',
  'transport.fuel.station.manage',
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

  /* --- `transport-settlement` (`TX-05`) --- */
  /**
   * BAO CAO quyet toan — AR aging, cong no phai tra, vi the doi tac, bien truc tiep, cong don.
   *
   * MOT ma cho ca nam bao cao, khong nam ma: chung tra loi cung mot cau hoi nghiep vu ("cong ty
   * dang o dau ve tien"), va khong nguon nao noi rang mot nguoi duoc xem tuoi no ma khong duoc xem
   * cong no phai tra. Chia bang phan quyen theo tung endpoint la chia theo hinh dang cua code, chu
   * khong theo hinh dang cua cong viec.
   *
   * `TX-05` di vao HTTP o T7 va KHONG mang mot ma GHI nao. `SettlementService` co day du lenh ghi
   * (ghi nhan cong no, dieu chinh, dao, phan bo, dieu khoan, ky, quy tac hoa hong), nhung khong
   * lenh nao trong so do da tung duoc phoi ra hay duoc gan quyen — va #168 §2.B1 doi dung
   * *"expose only those commands that are already defined and permissioned"*, kem
   * *"Reporting never mutates"*. Cap quyen GHI tai chinh o day se la mot quyet dinh chinh sach ma
   * chua ai quyet.
   */
  'transport.settlement.report.read',
  /**
   * CHUOI CHUNG TU goc + cac ban dieu chinh/dao cua no — tach khoi `.report.read`.
   *
   * Mot bao cao noi "con no bao nhieu"; mot chuoi chung tu noi "ai da sua con so nay, luc nao, va
   * vi sao". Cai thu hai la LICH SU SUA DOI tai chinh, va do dung nghia la mot quyen khac.
   */
  'transport.settlement.document.read',

  /* --- `transport-asset-compliance` (`TX-06`) --- */
  'transport.maintenance.plan.read',
  'transport.maintenance.plan.manage',
  /**
   * MO mot lenh sua — tach khoi `.close` co chu dich.
   *
   * Mo mot lenh dua xe sang `UNDER_MAINTENANCE` o PHEP HOP THANH (T1 §18.2) va lam no hien ra la
   * dang sua tren bang doi xe. Dong lai thi nguoc lai. Hai quyen do khac nhau ve hau qua van hanh,
   * nen bang phan quyen phai noi duoc dieu do.
   *
   * ---------------------------------------------------------------------------
   * `TX-06b` (#237) SUA CAU CHU O DAY. Ban truoc viet *"dieu do vien khong dieu chuyen len no
   * nua"* — mot cong chan KHONG ton tai: `TripService.assign()` kiem dung ba thu (chuyen chua o
   * diem cuoi, xe ton tai, lai xe ton tai) va khong tra mot lenh sua nao.
   *
   * Cai co that la mot CANH BAO doc duoc (`evaluateDispatchReadiness()`), va danh sach `blocking`
   * cua no co y RONG cho toi khi `Q-05` — *"cai gi THAT SU cam dieu mot xe di"* — co nguon tu B.
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

  /* --- `TX-07b` quyet toan lai xe (Lane D, Issue #237) --- */
  /**
   * DOC bang quyet toan cua mot lai xe — da ghi nhan / da rut / con lai / hoan ung, kem phan bo.
   *
   * TACH khoi `transport.payroll.period.read`, va do la mot khac biet ve NOI DUNG chu khong ve man
   * hinh: bang nay noi tien da RA KHOI cong ty luc nao va bang duong nao. Mot nguoi duoc xem bang
   * luong khong nhat thiet duoc xem lich su chi tien mat.
   */
  'transport.driver_settlement.read',
  /**
   * GHI mot lan chi — tien roi khoi cong ty.
   *
   * Quyen RIENG, cung ly le voi `transport.payslip.pay`: chay luong sinh ra con so, con lenh nay
   * chuyen tien that. Gop chung se lam moi nguoi tinh duoc luong cung chi duoc tien.
   */
  'transport.driver_settlement.cashout',
  /**
   * DAO mot lan chi da ghi (`INV-20`) — quyen RIENG, cung khuon
   * `transport.costing.reversal.post` va `transport.payslip.correct`.
   *
   * Ghi mot lan chi la viec hang ngay cua Ke toan; dao mot lan chi DA BAO ra ngoai la viet lai mot
   * con so da di vao so quy va vao bang doi chieu cua lai xe.
   */
  'transport.driver_settlement.reverse',

  /** Pham vi CUA CHINH MINH — lai xe. Cuong che bang quyen so huu phan cong, xem `TripService`. */
  'transport.driver.self.trip.read',
  'transport.driver.self.trip.update',
  /** So quy CUA CHINH MINH. Danh tinh den tu phien, khong tu mot `:driverId` tren duong dan. */
  'transport.driver.self.fund.read',
  /** PHIEU DO DAU CUA CHINH MINH — nop va xem. Danh tinh den tu phien, khong tu than yeu cau. */
  'transport.driver.self.fuel.read',
  'transport.driver.self.fuel.submit',
  /**
   * KHOAN CHI THUONG CUA CHINH MINH — lai xe tu ghi mot khoan da tra bang tien tam ung.
   *
   * TACH HAN khoi `transport.costing.expense.record`, va do la ca diem. Ma kia la quyen VAN HANH:
   * no ghi duoc cho BAT KY chuyen nao, BAT KY lai xe nao, va chon duoc ca nguon tien
   * (`COMPANY_DIRECT` — tien cong ty tra thang). Ma nay chi lam duoc mot viec: ghi mot khoan lay
   * tu quy CUA CHINH NGUOI DANG DANG NHAP, tren mot chuyen ma chinh ho duoc phan cong.
   *
   * Cap `transport.costing.expense.record` cho lai xe de "tien cho nhanh" se cho ho ghi chi phi vao
   * chuyen cua dong nghiep va rut tien tu quy cua nguoi khac. Cong that van nam o `CostingService`
   * (`requireDriverAssignedToTrip`); ma nay chi bao dam be mat lai xe khong bao gio cham toi duong
   * van hanh.
   */
  'transport.driver.self.expense.record',
  /**
   * PHIEU LUONG CUA CHINH MINH — lai xe doc lich su luong da cong bo cua chinh ho (`#168 B8`).
   *
   * TACH HAN khoi `transport.payroll.period.read`, va do la ca diem. Ma kia la quyen VAN HANH: no
   * doc duoc ky luong, lan chay, va phieu cua BAT KY lai xe nao — tuc bang luong ca doi xe. Cap no
   * cho lai xe de "tien cho nhanh" se cho moi nguoi doc luong cua dong nghiep.
   *
   * Ma nay cung KHONG mo mot duong ghi nao. Duyet (`transport.payslip.approve`), chi tra
   * (`.pay`) va phat phieu bu (`.correct`) deu nam ben van hanh, va khong ma nao trong so do co
   * mot bien the "cua chinh minh": mot nguoi tu duyet phieu luong cua chinh minh la dung cai ma
   * kiem soat noi bo sinh ra de chan.
   *
   * Cong THAT nam o `WorkforceReadService` (`Driver.authUserId` + quy tac cong bo `DRAFT`); ma nay
   * chi bao dam be mat lai xe khong bao gio cham toi duong van hanh.
   */
  'transport.driver.self.payslip.read',
  /**
   * BANG QUYET TOAN CUA CHINH MINH — lai xe doc so da ghi nhan, da rut, con lai va hoan ung.
   *
   * TACH HAN khoi `transport.driver_settlement.read`, cung ly le voi cap
   * `transport.driver.self.payslip.read` / `transport.payroll.period.read`: ma kia doc duoc bang
   * quyet toan cua BAT KY lai xe nao. Va ma nay KHONG mo mot duong ghi nao — khong co bien the
   * "tu rut tien cho chinh minh", vi mot nguoi tu chi tien cho chinh minh la dung cai ma kiem soat
   * noi bo sinh ra de chan.
   *
   * Cong THAT nam o `DriverSettlementReadService.selfStatement()` (`Driver.authUserId`); ma nay chi
   * bao dam be mat lai xe khong bao gio cham toi duong van hanh.
   */
  'transport.driver.self.settlement.read',
  /**
   * BAM VI TRI CUA CHINH MINH — lai xe mo phien, gui ban dinh vi, dong phien (`transport-proof`).
   *
   * Ba ma rieng chu khong mot ma `tracking.write` gop chung, vi ba viec nay co ba hinh dang rui ro
   * khac nhau: MO phien la mot lan chon chuyen (cong so huu that nam o `TrackingService`), GUI la
   * mot dong bang chung nho lap lai hang nghin lan, DONG la mot moc ket thuc. Mot khach muon tat
   * bam vi tri nen tang nhung van cho ghi moc bat dau se can den su khac biet do.
   */
  'transport.driver.self.tracking.start',
  'transport.driver.self.tracking.report',
  'transport.driver.self.tracking.stop',
  /** Van hanh doc TOM TAT bam vi tri — dem, quang duong, co rui ro. KHONG co toa do. */
  'transport.tracking.read',
  /**
   * DOC DUONG DI THO cua mot con nguoi — ma RIENG, va la ma hep nhat trong ca tep nay.
   *
   * Tach han khoi `transport.tracking.read`, va do la ca diem. Ma kia tra loi "co chung cu vi tri
   * khong" va "co bao nhieu co rui ro" — du cho ke toan doi soat. Ma NAY tra ve chuoi toa do tung
   * phut cua mot nguoi lam cong. Gop hai thu lam mot la mo mot nang luc giam sat ma khong ai yeu
   * cau, cho moi vai da co quyen doc so sach.
   *
   * Xem `ACCOUNTING_DENIED` ben duoi: ke toan CO `transport.tracking.read` va KHONG co ma nay.
   */
  'transport.location.history.read',
  /** Khai bao hang rao dia ly (kho, bai, cay xang) — viec cua van hanh. */
  'transport.geofence.read',
  'transport.geofence.manage',
] as const;

export type TransportAction = (typeof TRANSPORT_ACTIONS)[number];

const SELF_SCOPE_ACTIONS: readonly TransportAction[] = [
  'transport.driver.self.trip.read',
  'transport.driver.self.trip.update',
  'transport.driver.self.fund.read',
  'transport.driver.self.fuel.read',
  'transport.driver.self.fuel.submit',
  'transport.driver.self.expense.record',
  'transport.driver.self.payslip.read',
  'transport.driver.self.settlement.read',
  'transport.driver.self.tracking.start',
  'transport.driver.self.tracking.report',
  'transport.driver.self.tracking.stop',
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
  /**
   * Ke toan doc duoc TOM TAT bam vi tri (`transport.tracking.read`) — du de doi soat mot chuyen
   * co chung cu vi tri hay khong — nhung KHONG doc duoc duong di tung phut cua mot con nguoi.
   *
   * Day khong phai su nghi ngo ai ca. Doi soat so sach khong CAN toa do, va mot quyen khong can
   * den ma van duoc cap la mot quyen se bi dung vao viec khac. Khi mot ho so ky luat that su can
   * duong di, no di qua mot nguoi co `ADMIN` va de lai mot dong o `tracking.history_read`.
   */
  'transport.location.history.read',
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
