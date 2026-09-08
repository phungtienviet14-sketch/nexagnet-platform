/**
 * Ly do TU CHOI cua mien so huu tai san — tang kiem dau vao, khong phai quyet dinh nghiep vu.
 *
 * Cung khuon voi `counterparty-errors.ts` / `costing-errors.ts`: tu vung thuoc ve cho so huu no,
 * va `transport.errors.ts` chi GOP lai de mot lop loi dung chung con noi duoc kieu.
 */
export const TRANSPORT_ASSET_OWNERSHIP_ERROR_REASONS = [
  'ASSET_STAKEHOLDER_NOT_FOUND',
  /**
   * Tai khoan dang nhap do DA noi voi mot ben huu quan khac.
   *
   * Tach khoi mot loi unique tho cua Postgres vi day la thu nguoi quan tri SUA DUOC: gan nhu luon
   * la mot lan noi nham, va cau tra loi dung la "go cau noi cu truoc", khong phai "tao them".
   */
  'ASSET_STAKEHOLDER_ACCOUNT_TAKEN',
  'VEHICLE_OWNERSHIP_INTEREST_NOT_FOUND',
  /**
   * Ty le khong phai so nguyen diem co ban trong 1..10000.
   *
   * Mot ma RIENG chu khong gop vao mot `INVALID` chung: day la loi nhap lieu pho bien nhat cua ca
   * mien — nguoi dung go `50` nghi la 50%, trong khi `50` diem co ban la 0,5%. Giao dien can phan
   * biet duoc de noi dung cau do.
   */
  'OWNERSHIP_BASIS_POINTS_INVALID',
  /** `effectiveTo` khong sau `effectiveFrom`, hoac moc thoi gian khong doc duoc. */
  'OWNERSHIP_PERIOD_INVALID',
] as const;
export type TransportAssetOwnershipErrorReason =
  (typeof TRANSPORT_ASSET_OWNERSHIP_ERROR_REASONS)[number];
