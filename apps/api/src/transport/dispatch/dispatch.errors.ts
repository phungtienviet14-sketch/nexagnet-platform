/**
 * MA TU CHOI DAU VAO cua mien DIEU XE (Lane M, #277).
 *
 * Tach khoi `dispatch-decisions.ts` theo dung quy uoc da co cua mien van tai: tep kia tra loi
 * "he thong QUYET DINH gi va vi sao" (nguoi doc trace), tep NAY tra loi "nguoi goi API da gui cai
 * gi sai" (nguoi bam nut).
 *
 * Tep nay CO Y khong import gi.
 */
export const TRANSPORT_DISPATCH_ERROR_REASONS = [
  /** Ma nghia vu thuong mai khong ton tai — hoac khong thuoc khach nay. Fail-closed nhu nhau. */
  'DISPATCH_ORDER_NOT_FOUND',
  /**
   * Mot nghia vu DA HUY khong con la mot cau hoi dieu xe. Tra ve mot danh sach ung vien cho no
   * se moi nguoi dung dieu mot chiec xe di lam mot viec khong con ton tai.
   */
  'DISPATCH_ORDER_CANCELLED',
  /**
   * KHONG BIET DIEM LAY HANG O DAU — va day la ma quan trong nhat cua tep nay.
   *
   * `TransportOrder.originLabel` la mot CHUOI ("Kho Hai Phong"), khong phai mot toa do. Khi chuoi
   * do khong noi duoc ve mot cho co that trong he thong, cau tra loi dung la NOI RA dieu do. Lay
   * dai mot toa do — kho gan nhat, tam cua tinh, hay bai xe — se cho ra mot bang xep hang trong
   * y het mot bang xep hang that, va khong ai doc duoc no la gia.
   */
  'DISPATCH_PICKUP_LOCATION_UNRESOLVED',
  /** Toa do nguoi goi gui khong qua duoc `parseGeoPoint` (ngoai bien, NaN, hoac Null Island). */
  'DISPATCH_POINT_INVALID',
  /** Ma dia diem/hang rao nguoi goi gui khong ton tai hoac da ngung hoat dong. */
  'DISPATCH_PLACE_REF_NOT_FOUND',
  /** Moc gio lay hang gui len khong phai mot khoanh khac doc duoc. */
  'DISPATCH_REQUIRED_PICKUP_AT_INVALID',
  /** Ma xe khong ton tai — dung khi BOSS xac nhan mot ung vien. */
  'DISPATCH_VEHICLE_NOT_FOUND',
  /**
   * BOSS chon mot chiec xe ma vong tinh lai KHONG con de nghi nua.
   *
   * `M9`: *"Re-check on commit because map results may be stale."* Ma nay la ket qua cua lan kiem
   * lai do — khong phai mot loi ky thuat, ma la mot cau tra loi nghiep vu: su that da doi giua luc
   * nhin va luc bam.
   */
  'DISPATCH_RECOMMENDATION_STALE',
  /**
   * Nghia vu nay DA duoc gan cho mot chiec xe KHAC. `L3` cam mot don nam tren hai chang co tai
   * cung luc, va cong that nam trong mot giao dich co khoa dong.
   */
  'DISPATCH_ORDER_ALREADY_ASSIGNED',
  /**
   * NHA CUNG CAP DINH TUYEN KHONG TRA LOI — va he thong KHONG tu xep hang bang duong chim bay.
   *
   * `M13`: *"routing provider failure degrades to typed `ROUTING_UNAVAILABLE`, not auto-select by
   * straight-line fallback unless owner explicitly configures that fallback."*
   */
  'DISPATCH_ROUTING_UNAVAILABLE',
  /** So diem yeu cau vuot tran ma tri cua chinh sach — chan tren chi phi, xem `M12`. */
  'DISPATCH_MATRIX_BOUND_EXCEEDED',
] as const;
export type TransportDispatchErrorReason = (typeof TRANSPORT_DISPATCH_ERROR_REASONS)[number];
