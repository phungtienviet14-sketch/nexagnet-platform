import { loadTenantConfig } from '@netviet/tenant';

/**
 * Chinh sach cua `transport-core` — phan CAU HINH THEO KHACH, khong phai bat bien cua mien.
 *
 * T1 §3.2 xep mui gio vao nhom `A — Platform primitive` va ghi khoang cach do la `PG-08`. Nen tang
 * hom nay KHONG co mui gio tenant o tang danh tinh (do tren main: mui gio chi ton tai trong cau
 * hinh lap lich campaign). Cho tay lai o day la mot lua chon co gioi han co y:
 *
 *   · dat trong `policies.transportCore` -> la CAU HINH, doi duoc, khong phai hang so trong ma;
 *   · KHONG dung mot lop lich/ky tong quat -> `PG-07`/`PG-08` thuoc Platform Track;
 *   · khi `PG-08` dong, cho nay tro thanh mot lan doc tu tenant identity, va HINH DANG DU LIEU
 *     (cot `businessDate` rieng tren moi ban ghi) khong phai doi — do moi la thu dat.
 */
export interface TransportCorePolicy {
  /** Ten mui gio IANA, vd `Asia/Ho_Chi_Minh`. */
  readonly timeZone: string;
}

export const TRANSPORT_CORE_POLICY = Symbol('TRANSPORT_CORE_POLICY');

/**
 * Dong ho tiem duoc. CHI de bai test ghim mot khoanh khac quanh nua dem — khong dung o duong chay
 * that, va khong co provider nao cho token nay trong composition.
 */
export const TRANSPORT_CLOCK = Symbol('TRANSPORT_CLOCK');

/**
 * `Asia/Ho_Chi_Minh` la mac dinh cua `GD-04` cho khach tham chieu. Day la GIA DINH CUA CHUNG TA,
 * khong phai loi khach — khach chua tra loi `OPEN-18`. Khai tuong minh trong goi khach thi de doi;
 * khong khai thi van chay dung cho khach Viet Nam thay vi hong luc boot.
 */
export const DEFAULT_TRANSPORT_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export function tenantTransportCorePolicy(): TransportCorePolicy {
  const configured = loadTenantConfig().policies.transportCore;
  return { timeZone: configured?.timeZone ?? DEFAULT_TRANSPORT_TIME_ZONE };
}
