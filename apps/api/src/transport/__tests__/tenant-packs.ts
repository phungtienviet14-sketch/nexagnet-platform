import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * GOI KHACH NAO DUOC PHEP BAT NGHIEP VU VAN TAI — mot danh sach TUONG MINH.
 *
 * Truoc day nam cong bao ve (`*.composition.spec.ts`) moi cai tu viet mot vong lap noi rang
 * "KHONG goi khach nao trong `tenants/` duoc bat `transport-*`". Cau do dung chung nao chua co
 * mot goi van tai nao ton tai, va y that cua no nam trong chinh chu thich cu:
 *
 *   "Bai test nay se do ngay lan dau tien mot khach dang co duoc bat `transport-core`
 *    MA KHONG AI CO Y."
 *
 * #180 dung mot goi XEM TRUOC CO CHU Y. Nen cau dung phai la: chi nhung slug ghi ro o day moi
 * duoc bat nghiep vu van tai, va KHONG mot goi khach THAT nao duoc co ten trong danh sach do.
 *
 * Cach viet nay SIET cong lai chu khong noi ra. No do o HAI phia:
 *
 *   1. ai do bat `transport-*` cho mot khach that (nhu truoc day), va
 *   2. ai do them mot khach that vao chinh danh sach cho phep nay — dieu ma ban cu KHONG bat duoc,
 *      vi ban cu khong he co danh sach.
 */
export const TRANSPORT_PREVIEW_TENANTS: readonly string[] = ['transport-preview'];

/**
 * GOI KHACH THAT. Khong mot ten nao trong day duoc phep xuat hien o `TRANSPORT_PREVIEW_TENANTS`
 * chung nao T7 chua dong — do la loi hua "Ultty/Amico/Wata khong doi" cua #180 §3, viet thanh mot
 * cau may kiem duoc.
 */
export const CUSTOMER_TENANTS: readonly string[] = ['amico', 'ultty', 'wata'];

export interface TenantPackSummary {
  readonly slug: string;
  readonly capabilities: readonly string[];
  readonly experience: string;
}

/** Doc MOI goi khach that trong `tenants/`. Nem neu mot thu muc thieu `tenant.json`. */
export function readTenantPacks(repoRoot: string): readonly TenantPackSummary[] {
  const tenantsDir = join(repoRoot, 'tenants');
  return readdirSync(tenantsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const raw = JSON.parse(
        readFileSync(join(tenantsDir, entry.name, 'tenant.json'), 'utf8'),
      ) as Omit<TenantPackSummary, 'slug'>;
      return {
        slug: entry.name,
        capabilities: raw.capabilities,
        experience: raw.experience,
      };
    });
}

/**
 * Cac goi khach KHONG nam trong danh sach xem truoc — tuc nhung goi tuyet doi khong duoc bat
 * nghiep vu van tai. Day la tap ma nam cong bao ve quet qua.
 */
export function nonPreviewTenantPacks(repoRoot: string): readonly TenantPackSummary[] {
  return readTenantPacks(repoRoot).filter((pack) => !TRANSPORT_PREVIEW_TENANTS.includes(pack.slug));
}
