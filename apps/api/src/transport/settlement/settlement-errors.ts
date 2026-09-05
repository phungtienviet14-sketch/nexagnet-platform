/**
 * MA TU CHOI cua `transport-settlement` — thuoc CAPABILITY nay, khong thuoc `transport-core`.
 *
 * TEP NAY KHONG IMPORT GI, cung rang buoc co y voi `fuel-errors.ts` va `costing-errors.ts`.
 * `transport.errors.ts` noi bo ma nay vao `TransportErrorReason` bang mot `import type`, tuc mot
 * canh CHI TON TAI LUC BIEN DICH va bi xoa sach khi sinh JavaScript. Nho vay lo trinh import luc
 * chay van di mot chieu `settlement -> fuel -> costing -> core`, khong co vong.
 *
 * Dung them import vao day.
 */

/** Ly do KIEM DAU VAO / TRA VE KHONG THAY — nguoi goi dua vao cai gi sai. */
export const TRANSPORT_SETTLEMENT_VALIDATION_REASONS = [
  'SETTLEMENT_DOCUMENT_NOT_FOUND',
  'SETTLEMENT_PERIOD_NOT_FOUND',
  'SETTLEMENT_CUSTOMER_NOT_FOUND',
  'SETTLEMENT_PARTNER_NOT_FOUND',
  'SETTLEMENT_TRIP_NOT_FOUND',
  'COMMISSION_RULE_NOT_FOUND',
  'COMMISSION_RULE_VERSION_NOT_FOUND',
  /** So tien khong phai so nguyen dong hop le, hoac sai dau so voi chieu cua dong. */
  'SETTLEMENT_AMOUNT_INVALID',
  /** Dieu khoan thanh toan am, khong nguyen, hoac vuot mot nam. */
  'SETTLEMENT_TERM_DAYS_INVALID',
  /** Khoang ky sai: ngay bat dau sau ngay ket thuc. */
  'SETTLEMENT_PERIOD_RANGE_INVALID',
  /** Ty le hoa hong ngoai khoang 0..100%, hoac sai bo truong so voi `calcKind`. */
  'COMMISSION_RATE_INVALID',
] as const;
export type TransportSettlementValidationReason =
  (typeof TRANSPORT_SETTLEMENT_VALIDATION_REASONS)[number];

/** Ly do CONG NGHIEP VU DONG — dau vao hop le, nhung luat khong cho di tiep. */
export const TRANSPORT_SETTLEMENT_DENIED_REASONS = [
  /**
   * Chung tu cua dong nay phai di dung chieu cua no. Mot `PARTNER_COMMISSION` mang
   * `direction: RECEIVABLE` bi chan o day chu khong nam trong bang cho toi luc ai do doc bao cao.
   */
  'SETTLEMENT_FLOW_DIRECTION_MISMATCH',
  /** Loai doi tac khong khop voi dong — vd gan mot khach hang vao dong cong no cay xang. */
  'SETTLEMENT_COUNTERPARTY_KIND_MISMATCH',
  /**
   * Cung khoa `(sourceContext, sourceId)` nhung NOI DUNG khac ban da ghi.
   *
   * Tach hoan toan khoi mot lan phat lai binh thuong: tra ve ban cu o day se lam ben goi tin rang
   * con so MOI cua ho da vao so, va khong ai biet cho toi luc doi chieu voi doi tac.
   */
  'SETTLEMENT_SOURCE_FINGERPRINT_CONFLICT',
  /** Ky quyet toan cua dong nay dang `CLOSING`/`CLOSED` — chung tu lui ngay bi tu choi. */
  'SETTLEMENT_PERIOD_FROZEN',
  /** Ban goc da bi dao; gan them mot ban sua se lam tong chuoi khac 0 ma khong ai co y do do. */
  'SETTLEMENT_TARGET_ALREADY_REVERSED',
  /** Chi `ORIGINAL` moi la dich cua mot ban sua — sua mot ban sua tao ra cay nhieu tang. */
  'SETTLEMENT_TARGET_NOT_ORIGINAL',
  /** Khong co gi de sua: so tien mong muon trung so tien da ghi. */
  'SETTLEMENT_ADJUSTMENT_NO_CHANGE',
  /** Mot ban goc chi bi dao MOT lan. */
  'SETTLEMENT_ALREADY_REVERSED',
  /** Phan bo vuot qua so du con lai cua chuoi chung tu. */
  'SETTLEMENT_ALLOCATION_EXCEEDS_OUTSTANDING',
  /**
   * Ghi nhan doanh thu doi hoi chuyen o `RECONCILED` — gia dinh demo cua Issue #87.
   *
   * Mot chuyen chua doi soat ma da sinh cong no khach se lam bao cao tuoi no dem ca nhung chuyen
   * con co the bi huy hoac con sua gia cuoc.
   */
  'SETTLEMENT_TRIP_NOT_RECONCILED',
  /** Chuyen chua co gia cuoc thi khong co gi de ghi nhan. */
  'SETTLEMENT_TRIP_REVENUE_MISSING',
  /** Chuyen nay khong phai chuyen thue xe ngoai nen khong co cong no nha xe. */
  'SETTLEMENT_TRIP_NOT_OUTSOURCED',
  /** Chuyen nay khong phai chuyen doi tac mang don nen khong co hoa hong. */
  'SETTLEMENT_TRIP_NOT_PARTNER_REFERRED',
  /**
   * Hai luat hoa hong CUNG BAC cung ap duoc — Issue #87 doi FAIL CLOSED.
   *
   * Chon bua mot cai se lam hai lan chay cung mot chuyen ra hai so tien khac nhau ma khong lan nao
   * bao loi. Mot khoan hoa hong khong ghi duoc la viec cho nguoi; ghi sai la mot khoan tien.
   */
  'COMMISSION_RULE_AMBIGUOUS',
  /** Khong luat nao ap duoc cho chuyen nay o ngay nghiep vu do. */
  'COMMISSION_RULE_NONE_APPLICABLE',
  /** Chuyen nay da tinh hoa hong roi — mot chuyen mot lan. */
  'COMMISSION_ALREADY_CALCULATED',
  /** Pham vi `(doi tac, tuyen)` da co mot luat; hai luat cung pham vi lam phep chon nhap nhang. */
  'COMMISSION_RULE_SCOPE_TAKEN',
  /** Ky da o dung trang thai do roi. */
  'SETTLEMENT_PERIOD_ALREADY_IN_STATE',
  /** May trang thai ky khong co canh nay. */
  'SETTLEMENT_PERIOD_TRANSITION_NOT_PERMITTED',
  /** Ky moi chong lap mot ky da co trong cung mot dong. */
  'SETTLEMENT_PERIOD_OVERLAP',
] as const;
export type TransportSettlementDeniedReason = (typeof TRANSPORT_SETTLEMENT_DENIED_REASONS)[number];

export type TransportSettlementErrorReason =
  TransportSettlementValidationReason | TransportSettlementDeniedReason;
