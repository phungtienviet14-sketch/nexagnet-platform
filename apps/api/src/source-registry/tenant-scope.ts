/**
 * PHAM VI KHACH — cong cach ly cua tang nguon su that.
 *
 * VI SAO CAN, KHI MOI KHACH DA MOT DB RIENG. Hom nay moi khach chay mot stack rieng va mot
 * Postgres rieng, nen cach ly o tang ha tang la THAT. Nhung do la mot dac diem TRIEN KHAI, khong
 * phai mot bat bien cua mo hinh: no dung cho den dung ngay dau tien co hai khach chung mot DB,
 * mot cong cu quan tri doc nhieu tenant, hay mot job dong bo chay ngoai request scope. Ngay do
 * ma tang nay khong co khai niem "khach", thi cach duy nhat de phat hien ro ri la doc log.
 *
 * NGUYEN TAC: danh tinh khach den tu CAU HINH TRIEN KHAI (`loadTenantConfig().slug`), KHONG BAO
 * GIO tu dau vao cua nguoi goi. Mot API nhan `tenantId` tu body la mot API ma bat ky ai cung tu
 * xung duoc la khach khac. Vi the o day chi co MOT duong lay pham vi — `trustedTenantScope()` —
 * va moi ham doc/ghi deu doi mot `TenantScope` da duoc cap chu khong doi mot chuoi.
 *
 * FAIL CLOSED: khong doc duoc goi khach thi nem, khong tra ve pham vi rong. Mot pham vi rong se
 * lam moi truy van `where` bien mat.
 */
import { loadTenantConfig } from '@netviet/tenant';

/**
 * Mot pham vi khach DA DUOC CAP. Kieu nay co y kho tao ra: khong co constructor cong khai, chi co
 * `trustedTenantScope()` va `testTenantScope()`. Mot `string` thi ai cung dua vao duoc; mot
 * `TenantScope` thi phai di qua mot trong hai cua.
 */
export interface TenantScope {
  readonly tenantId: string;
  /** Nhan chong nham lan voi mot chuoi bat ky bi ep kieu. */
  readonly __brand: 'TenantScope';
}

const scopeOf = (tenantId: string): TenantScope => ({ tenantId, __brand: 'TenantScope' });

export class TenantScopeError extends Error {
  constructor(
    readonly reason: TenantScopeDeniedReason,
    message: string,
  ) {
    super(message);
    this.name = 'TenantScopeError';
  }
}

export const TENANT_SCOPE_DENIED_REASONS = [
  /** Khong nap duoc goi khach — khong biet dang phuc vu ai. Fail closed. */
  'TENANT_SCOPE_UNRESOLVED',
  /**
   * Nguoi goi hoi/sua du lieu cua MOT KHACH KHAC.
   *
   * Day la ma duy nhat tra loi duoc cau "co ai da cham vao du lieu khach khac chua" bang mot bo
   * loc, thay vi bang mot buoi doc log.
   */
  'TENANT_SCOPE_CROSS_TENANT',
] as const;
export type TenantScopeDeniedReason = (typeof TENANT_SCOPE_DENIED_REASONS)[number];

/**
 * Pham vi cua chinh tien trinh nay, doc tu goi khach dang duoc nap.
 *
 * Day la duong DUY NHAT ma code nghiep vu duoc lay pham vi. Neu ban thay minh muon them mot ham
 * nhan `tenantId: string` tu ben ngoai, thi cai ban dang them la mot duong vong qua cong nay.
 */
export function trustedTenantScope(): TenantScope {
  let slug: string;
  try {
    slug = loadTenantConfig().slug;
  } catch (cause) {
    throw new TenantScopeError(
      'TENANT_SCOPE_UNRESOLVED',
      `Khong nap duoc goi khach nen khong xac dinh duoc pham vi nguon su that: ${String(cause)}`,
    );
  }
  if (!slug.trim()) {
    throw new TenantScopeError('TENANT_SCOPE_UNRESOLVED', 'Goi khach khong co slug.');
  }
  return scopeOf(slug);
}

/**
 * Pham vi dung TRONG TEST — de dung duoc hai khach trong cung mot tien trinh.
 *
 * Ton tai vi bai test cach ly bat buoc phai dung duoc hai pham vi cung luc (`ultty` va
 * `van-tai-viet`), va khong the lam viec do neu chi co mot ham doc bien moi truong toan cuc.
 * Ten ham noi ro no la cua test; production goi `trustedTenantScope()`.
 */
export function testTenantScope(tenantId: string): TenantScope {
  if (!tenantId.trim()) {
    throw new TenantScopeError('TENANT_SCOPE_UNRESOLVED', 'tenantId rong.');
  }
  return scopeOf(tenantId);
}

/**
 * Khang dinh mot ban ghi DOC DUOC thuoc dung pham vi dang cam.
 *
 * Goi SAU moi lan doc mot ban ghi ra khoi kho, ke ca khi cau `where` da co `tenantId`. Hai lop
 * co y trung nhau: `where` bao ve truy van dung, con ham nay bao ve truong hop ai do them mot
 * duong doc moi va quen mat dieu kien — luc do ban ghi van ve, va cai nay la thu duy nhat con noi
 * duoc "khong phai cua ban".
 */
export function assertWithinScope(
  scope: TenantScope,
  record: { readonly tenantId: string } | null | undefined,
  subject: string,
): void {
  if (!record) return;
  if (record.tenantId !== scope.tenantId) {
    throw new TenantScopeError(
      'TENANT_SCOPE_CROSS_TENANT',
      `${subject} thuoc khach khac — pham vi hien tai la "${scope.tenantId}".`,
    );
  }
}
