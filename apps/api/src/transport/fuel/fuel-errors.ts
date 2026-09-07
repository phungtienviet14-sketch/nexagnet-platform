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
  /**
   * Bang chung khong ton tai, hoac khong thuoc phieu tren duong dan — #222 P1-C.
   *
   * MOT ma cho ca hai truong hop, va do la co y: phan biet chung se xac nhan cho nguoi goi rang mot
   * `evidenceId` nao do CO TON TAI o dau do trong he thong — dung kieu thong tin ma `DRIVER-VIEW-002`
   * khong cho ro ri. Nguoi dung hop le thi hai truong hop nay giong het nhau: tai lai trang.
   */
  'FUEL_EVIDENCE_NOT_FOUND',

  /* --- Danh tinh cay xang (Lane C / C1) --- */
  'FUEL_STATION_NOT_FOUND',
  'FUEL_STATION_ALIAS_NOT_FOUND',
  /**
   * Ten tram chuan hoa ra CHUOI RONG — vd `"---"` hay `"..."`.
   *
   * Khong phai mot lan bat be chinh ta: `nameNormalized` la KHOA SO KHOP, va mot khoa rong se khop
   * voi moi tram khac cung rong. Mot hang nhu vay khong tra loi duoc cau hoi duy nhat bang tram ton
   * tai de tra loi, va no keo theo mot lan khop nham ngay lan nhan dang dau tien.
   */
  'FUEL_STATION_NAME_INVALID',
  /** Nhu tren, cho bi danh. Bi danh rong con te hon: khoa cua no UNIQUE toan cuc. */
  'FUEL_STATION_ALIAS_INVALID',
  /**
   * MOT NUA TOA DO khong phai mot diem.
   *
   * Duong hay gap nhat KHONG phai lan tao moi ma la mot lan SUA: bieu mau gui `latitudeE7: null`
   * ma khong gui `longitudeE7`, va hang con lai mot nua toa do. Nen phep kiem chay tren trang thai
   * DA GOP, khong tren ban va.
   */
  'FUEL_STATION_COORDINATES_INCOMPLETE',
  /** Ban kinh khong co tam thi khong khoanh duoc gi — va `0` met KHONG phai "khong kiem". */
  'FUEL_STATION_GEOFENCE_WITHOUT_COORDINATES',
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
  /**
   * Bang chung nay DA duoc go roi — #222 P1-C.
   *
   * Hai lan bam "Gỡ chứng từ" gan nhau, hoac hai tab cung mo. Khong phai mot loi cua ai ca, va
   * KHONG duoc gop voi `FUEL_EVIDENCE_NOT_FOUND`: o day chung tu that su da tung ton tai va da
   * duoc go dung y muon, nen cau tra loi la "khong con viec gi de lam", khong phai "tim khong ra".
   */
  'FUEL_EVIDENCE_ALREADY_WITHDRAWN',
  /**
   * Phieu DA DUOC DUYET — khong go bang chung duoc nua (`GD-10`).
   *
   * Xem `evaluateFuelEvidenceRemoval`. Duong dung la dao khoan chi o `TX-03` roi ghi phieu moi.
   */
  'FUEL_EVIDENCE_ENTRY_ALREADY_TRUSTED',
  /** Phieu da khop hoac da nam trong ky doi soat DA DONG (`GD-11`) — khong go bang chung duoc. */
  'FUEL_EVIDENCE_ENTRY_RECONCILIATION_LOCKED',

  /* --- Danh tinh cay xang (Lane C / C1) --- */
  /**
   * Ma cua hang DA CHUAN HOA da thuoc mot tram khac CUA CUNG nha cung cap.
   *
   * `CH-05` va `CH05` la cung mot ma sau khi chuan hoa, nen hai lan nhap kieu do bi chan o day chu
   * khong lang le tao hai tram — neu de lot, moi lan nhan dang theo ma se ra `AMBIGUOUS` va khong
   * ai hieu tai sao.
   */
  'FUEL_STATION_CODE_TAKEN',
  /**
   * Bi danh nay DA tro toi mot tram KHAC.
   *
   * Khong ghi de, va cung khong lang le them hang thu hai: mot bi danh tro toi hai tram khong tra
   * loi duoc gi ca, va chinh su mo ho la thu bi danh sinh ra de xoa. Nguoi dat phai lam no cu the
   * hon (`CHXD SO 5` -> `CHXD SO 5 HA NOI`).
   */
  'FUEL_STATION_ALIAS_TAKEN',
] as const;
export type TransportFuelConflictReason = (typeof TRANSPORT_FUEL_CONFLICT_REASONS)[number];

export type TransportFuelErrorReason = TransportFuelValidationReason | TransportFuelConflictReason;
