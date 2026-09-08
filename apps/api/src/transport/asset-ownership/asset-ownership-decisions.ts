import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';

/**
 * TU VUNG QUYET DINH cua mien so huu tai san (`TX-08`, #242 Lane E).
 *
 * Bon cong nghiep vu, va moi cong deu co NHIEU HON MOT duong tu choi. Mot `boolean` se gop chung
 * lai va nguoi truc se khong biet phai sua o dau — dac biet o `ownership.scope.resolve`, noi ba ly
 * do tu choi doi ba hanh dong khac han nhau:
 *
 *   · chua noi tai khoan     -> quan tri phai noi ho so ben huu quan voi user;
 *   · ho so da ngung         -> mot quyet dinh nghiep vu, khong phai loi cau hinh;
 *   · xe khong thuoc pham vi -> DUNG hanh vi, va la thu bo test doi phai xay ra.
 */

/* ------------------------------------------------------------------ *
 * ownership.interest.record — AssetOwnershipService.recordInterest()
 * ------------------------------------------------------------------ */
export const OWNERSHIP_RECORD_REASONS = [
  'INTEREST_RECORDED',
  /**
   * Ben huu quan da co MOT quyen loi dang hieu luc tren chinh chiec xe nay.
   *
   * Khong ghi de, va do la bat bien cua ca tranche: sua ty le la DONG ban cu roi MO ban moi, de
   * lich su con doc lai duoc. Ghi de se lam bien mat cau tra loi cho "truoc do ho so huu bao nhieu".
   */
  'ACTIVE_INTEREST_EXISTS',
  'VEHICLE_NOT_FOUND',
  'STAKEHOLDER_NOT_FOUND',
  /** Ho so ben huu quan da ngung hoat dong — khong mo them quyen loi moi cho no. */
  'STAKEHOLDER_INACTIVE',
  /**
   * Lan ghi nay se lam TONG cac ty le dang hieu luc vuot 10000 diem co ban.
   *
   * Ma RIENG chu khong gop vao `OWNERSHIP_BASIS_POINTS_INVALID`: dau vao hoan toan hop le xet
   * rieng no, cai sai la QUAN HE cua no voi cac ban ghi khac. Nguoi dung phai dong bot mot quyen
   * loi khac, khong phai sua con so vua go.
   *
   * TEN CU la `REGISTER_COMPLETE_SUM_EXCEEDED`, va ten do mang mot gia dinh SAI: rang tran 100%
   * chi ap khi so dang ky da khai day du. Bang chung luc chay tren `transport-preview/gd1-test` do
   * duoc mot so dang ky "con thieu" mang tong 11500 diem. Tran luon dung; "day du" chi quyet dinh
   * tong co phai BANG 10000 hay khong.
   */
  'OWNERSHIP_SUM_EXCEEDS_TOTAL',
] as const;
export type OwnershipRecordReason = (typeof OWNERSHIP_RECORD_REASONS)[number];

/* ------------------------------------------------------------------ *
 * ownership.interest.close — AssetOwnershipService.closeInterest()
 * ------------------------------------------------------------------ */
export const OWNERSHIP_CLOSE_REASONS = [
  'INTEREST_CLOSED',
  'INTEREST_NOT_FOUND',
  /** Da dong tu truoc. Idempotent — khong nem, va khong ghi de moc dong cu. */
  'INTEREST_ALREADY_CLOSED',
  /**
   * So dang ky da khai day du, va dong ban nay lam tong tut duoi 10000.
   *
   * KHONG chan: dong mot quyen loi la mot su that phap ly da xay ra ngoai doi (nguoi ta ban co
   * phan cua ho), va phan mem tu choi ghi nhan no se chi lam du lieu sai di. Thay vao do so dang
   * ky tu HA XUONG `false` — lan khai day du truoc do khong con dung nua, va he thong noi ra dieu
   * do thay vi im lang giu mot loi khai da sai.
   */
  'REGISTER_COMPLETENESS_DROPPED',
] as const;
export type OwnershipCloseReason = (typeof OWNERSHIP_CLOSE_REASONS)[number];

/* ------------------------------------------------------------------ *
 * ownership.register.declare — AssetOwnershipService.declareRegisterComplete()
 * ------------------------------------------------------------------ */
export const OWNERSHIP_REGISTER_REASONS = [
  'REGISTER_MARKED_COMPLETE',
  'REGISTER_MARKED_PARTIAL',
  /** Khong khai day du duoc khi tong cac ty le dang hieu luc chua dung 10000 diem. */
  'REGISTER_SUM_NOT_FULL',
] as const;
export type OwnershipRegisterReason = (typeof OWNERSHIP_REGISTER_REASONS)[number];

/* ------------------------------------------------------------------ *
 * ownership.scope.resolve — AssetOwnershipScopeService.resolve()
 * ------------------------------------------------------------------ */
export const OWNERSHIP_SCOPE_REASONS = [
  'SCOPE_GRANTED',
  /** Phien dang nhap khong noi voi ho so ben huu quan nao. Fail-closed. */
  'STAKEHOLDER_NOT_LINKED',
  /**
   * Nguoi goi chi mot chiec xe KHONG nam trong pham vi cua ho.
   *
   * Day la duong tu choi ma `#242 E6` doi phai chung minh: doi `vehicleId` tren duong dan khong
   * duoc mo mot chiec xe cua nguoi khac. Ghi lai thanh mot quyet dinh CO MA de mot lan do dam
   * doc duoc tu trace, chu khong chim vao mot `403` chung.
   */
  'VEHICLE_NOT_ENTITLED',
] as const;
export type OwnershipScopeReason = (typeof OWNERSHIP_SCOPE_REASONS)[number];

export type TransportAssetOwnershipDecisionReason =
  OwnershipRecordReason | OwnershipCloseReason | OwnershipRegisterReason | OwnershipScopeReason;

export const TRANSPORT_ASSET_OWNERSHIP_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-core',
  points: [
    'ownership.interest.record',
    'ownership.interest.close',
    'ownership.register.declare',
    'ownership.scope.resolve',
  ],
  labels: {
    INTEREST_RECORDED: 'Đã ghi một quyền lợi sở hữu',
    ACTIVE_INTEREST_EXISTS: 'Bên hữu quan đã có quyền lợi đang hiệu lực trên xe này',
    VEHICLE_NOT_FOUND: 'Không tìm thấy xe',
    STAKEHOLDER_NOT_FOUND: 'Không tìm thấy hồ sơ bên hữu quan',
    STAKEHOLDER_INACTIVE: 'Hồ sơ bên hữu quan đã ngừng hoạt động',
    OWNERSHIP_SUM_EXCEEDS_TOTAL: 'Ghi thêm sẽ làm tổng tỷ lệ sở hữu vượt 100%',

    INTEREST_CLOSED: 'Đã đóng một quyền lợi sở hữu',
    INTEREST_NOT_FOUND: 'Không tìm thấy quyền lợi sở hữu',
    INTEREST_ALREADY_CLOSED: 'Quyền lợi đã đóng từ trước',
    REGISTER_COMPLETENESS_DROPPED: 'Sổ đăng ký hạ khỏi trạng thái đầy đủ vì tổng không còn 100%',

    REGISTER_MARKED_COMPLETE: 'Đã khai sổ đăng ký sở hữu là đầy đủ',
    REGISTER_MARKED_PARTIAL: 'Đã hạ sổ đăng ký về trạng thái còn thiếu',
    REGISTER_SUM_NOT_FULL: 'Chưa khai đầy đủ được — tổng tỷ lệ chưa đủ 100%',

    SCOPE_GRANTED: 'Đã giải được phạm vi xe của bên hữu quan',
    STAKEHOLDER_NOT_LINKED: 'Phiên đăng nhập chưa nối với hồ sơ bên hữu quan nào',
    VEHICLE_NOT_ENTITLED: 'Xe không nằm trong phạm vi của bên hữu quan',
  } satisfies Record<TransportAssetOwnershipDecisionReason, string>,
});
