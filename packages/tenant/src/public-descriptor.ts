import type { CapabilityId, ExperienceId, TenantConfig } from './tenant.schema.js';

/**
 * PHEP CHIEU CONG KHAI cua goi khach — hinh dang DUY NHAT cua goi khach duoc phep roi may chu.
 *
 * Hai ben doc no, va CHINH VI hai ben doc no ma no song o day chu khong o mot app:
 *
 *   · web: Server Component -> trinh duyet (`app/layout.tsx`);
 *   · API: `GET /auth/client` -> ung dung native, thu khong co Server Component nao de dua goi
 *     khach cho no.
 *
 * Hai ban chep tay se lech nhau dung vao ngay ai do them mot truong vao `branding`, va man hinh
 * tren dien thoai se noi mot ten khach khac voi trinh duyet ma khong bai kiem nao do.
 *
 * TEP NAY THUAN: chi import KIEU. Khong duoc import `tenant.config.ts` (`node:fs`) hay bat cu gia tri
 * nao khac — phep chieu phai chay duoc o moi noi nhan mot `TenantConfig`, va mot import gia tri o
 * day se keo loader vao nhung noi khong co dia.
 */

/** Thuong hieu di ra ngoai: khoi `branding` cua goi khach cong them ten ngan cua danh tinh. */
export type PublicTenantBranding = TenantConfig['branding'] & { shortName: string };

/**
 * Mot nang luc nghiep vu khach DA KHAI la chua san sang — nguyen van tu goi khach.
 *
 * Ba truong nay la du lieu NGHIEP VU do khach viet ra, khong phai trang thai ky thuat: `label` la
 * ten khach goi nang luc do, `reason` la ly do khach noi vi sao no chua mo. Khong truong nao la bi
 * mat, nen chung duoc phep qua ranh gioi server -> trinh duyet.
 */
export interface BlockedCapabilityDescriptor {
  readonly key: string;
  readonly label: string;
  readonly reason: string;
}

/**
 * LOI TU THU cua goi khach rang ban trien khai nay la mot BAN XEM TRUOC.
 *
 * Hai truong deu la cau chu do khach viet ra, khong phai bi mat, nen chung duoc phep qua ranh gioi
 * server -> trinh duyet. Vang mat ⇒ khong hien gi.
 */
export interface PreviewNoticeDescriptor {
  readonly label: string;
  readonly note: string;
}

export interface PublicTenantDescriptor {
  readonly branding: PublicTenantBranding;
  readonly experience: ExperienceId;
  readonly capabilities: readonly CapabilityId[];
  /** Adapter identifiers are safe for UI composition. Credentials are deliberately omitted. */
  readonly integrationAdapters: {
    readonly channel: readonly string[];
    readonly parser: readonly string[];
    readonly erp?: string;
    readonly contentSource?: string;
  };
  /**
   * NANG LUC KHACH DA KHAI LA CHUA SAN SANG — de be mat huong khach noi that duoc.
   *
   * Doc tu GOI KHACH chu khong doi mot lan goi API: cau "COD chua san sang" phai hien ra ngay o
   * lan render dau, ke ca khi API dang do hay dang loi. Mot man hinh im lang ve nang luc bi chan
   * la mot man hinh khien nguoi dung tuong no chay duoc — dung thu Issue #107 §7 cam.
   *
   * Danh sach RONG nghia la khach khong khai nang luc nao bi chan. No KHONG co nghia la "moi thu
   * da san sang": do la cau hoi cua cong go-live (`/settings/readiness`), mot nguon khac.
   */
  readonly readiness: {
    readonly blockedCapabilities: readonly BlockedCapabilityDescriptor[];
    /** Chi co o goi khach TU KHAI la ban xem truoc. `undefined` cho moi khach that. */
    readonly previewNotice?: PreviewNoticeDescriptor;
  };
  /**
   * LICH NGHIEP VU cua khach van tai — mui gio IANA, khong phai mot tuy chon hien thi.
   *
   * Ra toi trinh duyet vi mot ly do cu the: bao cao tuoi no BAT BUOC tham so `asOf`, va no phai la
   * NGAY NGHIEP VU theo lich cua khach. Lay ngay tu dong ho may se cho ra ngay khac khi nguoi dung
   * mo man hinh tu mot mui gio khac — hoac khi may cai sai mui gio — va hai nguoi se doc ra hai
   * bang cong no khac nhau ma khong ai biet vi sao.
   *
   * `undefined` khi khach khong khai (moi khach khong van tai). Luc do man hinh dung mui gio cua
   * may va NOI RA dieu do, chu khong im lang.
   */
  readonly transport?: { readonly timeZone?: string };
}

/**
 * Build the only tenant shape that may leave the server (web browser or native app).
 * Select fields explicitly so a future credential reference cannot leak through object spreading.
 */
export function toPublicTenantDescriptor(config: TenantConfig): PublicTenantDescriptor {
  return {
    branding: { ...config.branding, shortName: config.identity.shortName },
    experience: config.experience,
    capabilities: [...config.capabilities],
    integrationAdapters: {
      channel: [...(config.integrations.channel?.allowedAdapters ?? [])],
      parser: [...(config.integrations.parser?.allowedAdapters ?? [])],
      ...(config.integrations.erp ? { erp: config.integrations.erp.adapter } : {}),
      ...(config.integrations.contentSource
        ? { contentSource: config.integrations.contentSource.adapter }
        : {}),
    },
    readiness: {
      blockedCapabilities: config.policies.readiness.blockedCapabilities.map(
        ({ key, label, reason }) => ({ key, label, reason }),
      ),
      // Chon tung truong mot, khong spread: mot truong moi trong schema khong duoc lang le di ra
      // trinh duyet chi vi no duoc them vao `readiness`.
      ...(config.policies.readiness.previewNotice
        ? {
            previewNotice: {
              label: config.policies.readiness.previewNotice.label,
              note: config.policies.readiness.previewNotice.note,
            },
          }
        : {}),
    },
    // Chon tung truong, khong spread: `transportCore` co the nhan them truong noi bo sau nay va
    // khong truong nao duoc lang le di ra trinh duyet chi vi no duoc them vao chinh sach.
    ...(config.policies.transportCore?.timeZone
      ? { transport: { timeZone: config.policies.transportCore.timeZone } }
      : {}),
  };
}
