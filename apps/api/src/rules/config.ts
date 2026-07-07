/**
 * Hang so nghiep vu cho rules engine (tang 4). Trong thuc te doc tu bang chinh sach;
 * demo dat mac dinh hop ly, tach thanh config de de chinh.
 */
export interface RulesConfig {
  /** Don co tong so luong >= nguong nay -> mien phi ship */
  freeShipMinQuantity: number;
  /** Cuoc ship 1 SP giao noi thanh HN/HCM (Grab) */
  shipFeeNoiThanh: number;
  /** Cuoc ship 1 SP giao tinh (Viettel) */
  shipFeeTinh: number;
  /** Thue VAT */
  vatRate: number;
  /** Phi thu ho COD (demo: co dinh) */
  codFee: number;
  /** Sai so cho phep khi doi chieu tong khach ghi vs he thong tinh */
  totalMismatchTolerance: number;
  /** Tu khoa nhan dien khu vuc noi thanh (da chuan hoa khong dau) */
  noiThanhKeywords: string[];
}

export const DEFAULT_RULES_CONFIG: RulesConfig = {
  freeShipMinQuantity: 2,
  shipFeeNoiThanh: 30_000,
  shipFeeTinh: 40_000,
  vatRate: 0.1,
  codFee: 20_000,
  totalMismatchTolerance: 0.05,
  noiThanhKeywords: ['ha noi', 'hn', 'ho chi minh', 'hcm', 'sai gon', 'tphcm'],
};
