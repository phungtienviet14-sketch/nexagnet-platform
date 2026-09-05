/**
 * SO GHI BANG CHUNG DANG CO HIEU LUC — thu diem nghen gui doi chieu mot ban soan CU voi (Issue #205).
 *
 * ---------------------------------------------------------------------------------------------
 * VI SAO PHAI CO MOT CONG RIENG CHO VIEC NAY.
 *
 * Mot ban soan nam trong hang cho cua Sale co the nhieu gio. Trong khoang do, ban ghi nguon co
 * the da bi sua, bi go trang thai `active`, hoac bi RUT quyen ke lai. Neu diem nghen gui chi doi
 * chieu ban soan voi CHINH NO (dau van ban, dau ban soan) thi ba thay doi tren deu khong nhin
 * thay duoc — va he thong tu cap phep lai mot cau ma khong ai con cho phep.
 *
 * Muc 8 ca 10 hop dong #205 goi dung ten dieu do: "old composition pinned to source version X then
 * source eligibility/version changes -> send fails closed, not silently re-authorized".
 *
 * ---------------------------------------------------------------------------------------------
 * VI SAO LA MOT CONG, KHONG PHAI MOT LOI GOI THANG SANG `ContentService`.
 *
 * `TurnReplyService` thuoc `turn-processing`; `ContentService` thuoc `knowledge`. Mot khach co
 * turn-processing ma khong co knowledge la mot cau hinh hop le, va mot lenh `import` thang giua
 * hai capability se lam cau hinh do khong boot duoc. Cong nay cho phep ranh gioi do giu nguyen:
 * ai co `knowledge` thi noi day vao, ai khong co thi khong — va khi khong co, cung khong the co
 * mot ghim tai lieu nao de kiem, vi `tra_cuu_tai_lieu` khong chay duoc neu thieu `ContentService`.
 */
export abstract class EvidenceRegistry {
  /**
   * `sourceId -> version` cua MOI ban ghi tai lieu dang DUOC PHEP ke lai.
   *
   * Ban ghi da go `active`, hay chua/khong duoc tuyen bo `narrativeEligible`, KHONG co mat trong
   * so — vang mat vi the doc duoc theo dung mot nghia: "cau nay khong con duoc phep noi nua".
   */
  abstract narrativeEvidenceIndex(): ReadonlyMap<string, string>;
}
