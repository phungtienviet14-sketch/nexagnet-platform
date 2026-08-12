/**
 * Hang so nghiep vu cho rules engine (tang 4). Trong thuc te doc tu bang chinh sach;
 * demo dat mac dinh hop ly, tach thanh config de de chinh.
 */
export interface RulesConfig {
  /**
   * `null` = CHUA CAU HINH. Nam truong duoi day thuoc bon nghiep vu con BLOCKED (VAT · COD/ship
   * · cong no 7 ngay · khuyen mai) — chua co bang cuoc/bieu phi/quyet dinh chinh thuc tu khach.
   * Rules engine KHONG doc chung: `priceOrder` ep ship/COD/VAT ve 0 kem canh bao nen don luon
   * chuyen Sale, con `computeShipping` nem loi. Giu truong lai de hien "chua mo" tren /settings
   * va de ban ghi rule-config cu (dang chua SO) van doc duoc.
   */
  freeShipMinQuantity: number | null;
  shipFeeNoiThanh: number | null;
  shipFeeTinh: number | null;
  vatRate: number | null;
  codFee: number | null;
  /** Sai so cho phep khi doi chieu tong khach ghi vs he thong tinh — DUY NHAT truong engine dung */
  totalMismatchTolerance: number;
  /** Tu khoa nhan dien khu vuc noi thanh (da chuan hoa khong dau) */
  noiThanhKeywords: string[];
}

/**
 * KHONG dat so tien mac dinh. Truoc day file nay giu ship 30k/40k, VAT 0,1 va COD 20k — deu la
 * so PHONG DOAN, va vi engine bo qua nen man /settings hien nhu "da cau hinh" trong khi he thong
 * van tinh 0. Thieu nguon thi de `null` va noi ro la thieu.
 */
export const DEFAULT_RULES_CONFIG: RulesConfig = {
  freeShipMinQuantity: null,
  shipFeeNoiThanh: null,
  shipFeeTinh: null,
  vatRate: null,
  codFee: null,
  totalMismatchTolerance: 0.05,
  noiThanhKeywords: ['ha noi', 'hn', 'ho chi minh', 'hcm', 'sai gon', 'tphcm'],
};
