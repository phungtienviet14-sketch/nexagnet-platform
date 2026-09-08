import { loadTenantConfig } from '@netviet/tenant';
import type { TollProvider, TollTransactionKind } from './toll-provider.port.js';

/**
 * Chinh sach cua `transport-toll` — CAU HINH THEO KHACH, va o day no con la mot RANH GIOI DAO DUC.
 *
 * ===========================================================================
 * VI SAO KHONG CO BO COT MAC DINH — khac han `fuel-policy.ts`, va khac CO CHU DICH.
 *
 * `DEFAULT_FUEL_STATEMENT_COLUMNS` ton tai de mot tep mau chay duoc ngay. O day dieu do bi CAM:
 *
 *   · ten cot cua CA HAI nha cung cap dang o muc `CUSTOMER SAMPLE REQUIRED`
 *     (`docs/kien-truc/transport-etc-ingestion.md` §2.3);
 *   · #269 noi thang: *"If there is no real provider statement sample: do not fabricate format."*
 *
 * Mot bo cot mac dinh o day se thanh "dinh dang VETC" trong dau nguoi doc sau ba tuan, va khong ai
 * con nho rang no do chung ta nghi ra. Nen khong co bo mac dinh nao, va hau qua truc tiep la:
 *
 *   khach chua khai bo cot cho mot nha cung cap
 *     => duong chay cua NHA CUNG CAP DO tra `TOLL_PROVIDER_MAPPING_NOT_CONFIGURED`
 *     => tuc `BLOCKED_SAMPLE_REQUIRED`
 *
 * Do la mot TRANG THAI TRUNG THUC, khong phai mot loi can sua. Va no RIENG cho tung nha cung cap:
 * ePass co the da mo trong khi VETC con khoa.
 */

/**
 * TEN COT ma goi khach khai. Khong cot nao la hang so trong ma.
 *
 * `businessDate` va `passedAt` deu tuy chon RIENG LE nhung khong duoc thieu CA HAI — xem
 * `tollMappingConfigurationError()`. Mot sao ke ETC rat co the chi co mot cot "thoi diem qua tram";
 * ngay nghiep vu khi do duoc tinh MOT LAN tu no theo mui gio tenant (`INV-25`).
 */
export const TOLL_COLUMN_KEYS = [
  'accountNo',
  'kind',
  'vehiclePlate',
  'passedAt',
  'businessDate',
  'amount',
  'station',
  'providerRef',
] as const;
export type TollColumnKey = (typeof TOLL_COLUMN_KEYS)[number];

/** Cot khong the thieu du khai kieu gi: khong co so tai khoan hay so tien thi khong co gi de doc. */
export const REQUIRED_TOLL_COLUMN_KEYS: readonly TollColumnKey[] = ['accountNo', 'amount'];

export interface TollProviderMappingPolicy {
  readonly columns: Partial<Readonly<Record<TollColumnKey, string>>>;
  /** Dang ngay cua cot `businessDate`. Khong co duong "tu doan" — xem `fuel-statement-mapping.ts`. */
  readonly dateFormat: 'iso' | 'dmy';
  /**
   * CHU cua nha cung cap -> loai giao dich cua ta.
   *
   * Vi du khai (KHONG phai mot dinh dang da biet cua ai): `{ "Qua tram": "TOLL_PASS" }`. Bang nay
   * do nguoi nhin thay tep that khai ra; mot chuoi khong co trong bang se lam dong do bi tu choi
   * voi `TOLL_ROW_KIND_UNKNOWN` chu khong bi doan thanh `TOLL_PASS`.
   */
  readonly kinds: Readonly<Record<string, TollTransactionKind>>;
  /**
   * Loai dung khi tep KHONG CO cot loai.
   *
   * Mot tep chi liet ke luot qua tram thi khong can cot loai — nhung khi do nguoi khai phai NOI RA
   * rang moi dong la `TOLL_PASS`. Suy dieu do ho la doan.
   */
  readonly defaultKind: TollTransactionKind | null;
}

export interface TransportTollPolicy {
  readonly timeZone: string;
  readonly providers: Partial<Readonly<Record<TollProvider, TollProviderMappingPolicy>>>;
  /** Chan mot tep nham, khong phai mot gioi han nghiep vu. */
  readonly maxSourceBytes: number;
  readonly maxRows: number;
}

export const TRANSPORT_TOLL_POLICY = Symbol('TRANSPORT_TOLL_POLICY');

/** Sao ke ETC mot thang cua mot doi ~20 xe. Bien de chan mot tep nham, khong de chan nghiep vu. */
export const DEFAULT_TOLL_MAX_SOURCE_BYTES = 8_000_000;
/**
 * VETC gop toi da 1.000 giao dich mot hoa don (§2.1 tai lieu nghien cuu), nen mot thang cua B co
 * the ve nhieu tep. `20.000` dong mot tep la rong rai so voi con so do, va van chan duoc mot tep
 * nham hang trieu dong lam can bo nho.
 */
export const DEFAULT_TOLL_MAX_ROWS = 20_000;

/**
 * VI SAO MOT BO COT LA KHONG DU DUNG — kiem MOT LAN, o day.
 *
 * Ba duong hong, moi duong mot cau tra loi rieng, va tat ca deu la loi CAU HINH chu khong phai loi
 * du lieu. Bat chung o day thay vi de moi dong bi tu choi voi mot ma noi sai cho phai sua.
 */
export function tollMappingConfigurationError(mapping: TollProviderMappingPolicy): string | null {
  const missing = REQUIRED_TOLL_COLUMN_KEYS.filter((key) => (mapping.columns[key] ?? '') === '');
  if (missing.length > 0) return `thieu khai cot bat buoc: ${missing.join(', ')}`;

  const hasDate = (mapping.columns.businessDate ?? '') !== '';
  const hasPassedAt = (mapping.columns.passedAt ?? '') !== '';
  if (!hasDate && !hasPassedAt) {
    return 'phai khai it nhat mot trong hai cot `businessDate` hoac `passedAt`';
  }

  const hasKindColumn = (mapping.columns.kind ?? '') !== '';
  if (!hasKindColumn && mapping.defaultKind === null) {
    return 'tep khong co cot loai giao dich thi phai khai `defaultKind`';
  }
  return null;
}

export function tenantTransportTollPolicy(timeZone: string): TransportTollPolicy {
  const configured = loadTenantConfig().policies.transportToll;
  return {
    timeZone,
    providers: configured?.providers ?? {},
    maxSourceBytes: configured?.maxSourceBytes ?? DEFAULT_TOLL_MAX_SOURCE_BYTES,
    maxRows: configured?.maxRows ?? DEFAULT_TOLL_MAX_ROWS,
  };
}
