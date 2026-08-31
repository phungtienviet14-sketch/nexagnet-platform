/**
 * MA TU CHOI cua `transport-fuel` — thuoc CAPABILITY nay, khong thuoc `transport-core`.
 *
 * TEP NAY KHONG IMPORT GI, va do la mot rang buoc co y — giong het `costing-errors.ts`.
 * `transport.errors.ts` noi bo ma nay vao `TransportErrorReason` bang mot `import type`, tuc mot
 * canh CHI TON TAI LUC BIEN DICH va bi xoa sach khi sinh JavaScript. Nho vay:
 *
 *   · lo trinh import luc chay van di dung mot chieu `fuel -> costing -> core`, khong co vong;
 *   · ma cua fuel van duoc kiem chinh ta o tung loi goi (`TransportDomainError.denied('...')` go
 *     sai mot chu la khong bien dich duoc) thay vi phai noi long `reason` thanh `string`;
 *   · va tu vung cua fuel nam trong thu muc fuel.
 *
 * Neu tep nay import bat cu thu gi tu `../`, canh do co the tro thanh canh THAT luc chay va uu diem
 * dau tien bien mat. Dung them import vao day.
 */

/** Ly do KIEM DAU VAO / TRA VE KHONG THAY — nguoi goi dua vao cai gi sai. */
export const TRANSPORT_FUEL_VALIDATION_REASONS = [
  'FUEL_ENTRY_NOT_FOUND',
  'FUEL_SUPPLIER_NOT_FOUND',
  'FUEL_STATEMENT_NOT_FOUND',
  'FUEL_STATEMENT_LINE_NOT_FOUND',
  'FUEL_RECONCILIATION_NOT_FOUND',
  'FUEL_DISCREPANCY_NOT_FOUND',
  /** So lit khong phai mot so thap phan hop le, hoac <= 0, hoac qua nhieu chu so. */
  'FUEL_LITERS_INVALID',
  /** Odo am hoac khong phai so nguyen. KHONG dung cho odo lui — do la `ODOMETER_NOT_ADVANCED`. */
  'FUEL_ODOMETER_INVALID',
  /** Dinh dang file bang ke khong co adapter nao doc duoc. */
  'FUEL_STATEMENT_FORMAT_UNSUPPORTED',
  /** Anh xa cot cua goi khach khong tim thay mot cot bat buoc trong hang tieu de cua file. */
  'FUEL_STATEMENT_MAPPING_INVALID',
  /** File doc duoc nhung khong co hang du lieu nao. */
  'FUEL_STATEMENT_EMPTY',
  /** Khoang ky sai: ngay bat dau sau ngay ket thuc. */
  'FUEL_PERIOD_RANGE_INVALID',
  /**
   * Chenh lech loai `AMBIGUOUS_CANDIDATES` duoc quyet `MATCH_CONFIRMED` ma khong chi ra cap nao.
   *
   * Tach khoi mot loi "thieu truong" chung chung: day la cho `GD-09` de nguoi ta lang le quay lai —
   * quyet "khop di" ma khong noi khop VOI CAI NAO thi he thong lai phai doan, va doan la chinh cai
   * `GD-09` cam.
   */
  'FUEL_MATCH_TARGET_REQUIRED',
] as const;
export type TransportFuelValidationReason = (typeof TRANSPORT_FUEL_VALIDATION_REASONS)[number];

/**
 * Ly do VA CHAM LUC GHI — dau vao hop le, nhung trang thai da luu khong cho ghi them.
 *
 * Tach khoi nhom kiem dau vao vi cach xu ly khac han: nguoi dung khong sua duoc dau vao de qua
 * duoc, ho phai TAI LAI roi quyet lai tren trang thai moi.
 */
export const TRANSPORT_FUEL_CONFLICT_REASONS = [
  /** Khoa chong ghi trung cua phieu da duoc dung cho mot phieu KHAC. */
  'FUEL_CORRELATION_KEY_REUSED',
  /**
   * Da co mot bang ke cho dung `(cay xang, ky)` nay — T1 §5.
   *
   * KHONG lang le ghi de: ghi de lam bien mat cac cap da khop va cac chenh lech da co nguoi quyet,
   * va nguoi nhap se khong bao gio biet minh vua xoa mat mot buoi doi soat.
   */
  'FUEL_STATEMENT_PERIOD_TAKEN',
  /** Phieu nay vua duoc nguoi khac khop voi mot dong khac. */
  'FUEL_ENTRY_ALREADY_MATCHED',
  /** Dong bang ke nay vua duoc nguoi khac khop voi mot phieu khac. */
  'FUEL_STATEMENT_LINE_ALREADY_MATCHED',
  /**
   * MOT PHIEN KHAC vua doi trang thai ky doi soat truoc ban.
   *
   * Cung bai hoc voi `FUND_PERIOD_STATUS_RACE` cua T3: bao "khoang ngay trung" cho mot tinh huong
   * mat luot se day nguoi dung di sua khoang ngay — thu khong co van de gi.
   */
  'FUEL_RECONCILIATION_STATE_RACE',
  /**
   * `INV-26` phat hien o TANG KHO (trigger), khong phai o tang mien.
   *
   * Duong nay chi mo khi mot lan ghi KHONG di qua `fuel-matching.ts`. No khong bao gio duoc gap
   * trong van hanh binh thuong — va dung vi vay no phai co MOT MA RIENG: gap no nghia la co mot
   * duong ghi thu hai vao bang cap khop ma khong ai biet.
   */
  'FUEL_MATCH_SELF_SOURCED',
] as const;
export type TransportFuelConflictReason = (typeof TRANSPORT_FUEL_CONFLICT_REASONS)[number];

export type TransportFuelErrorReason = TransportFuelValidationReason | TransportFuelConflictReason;
