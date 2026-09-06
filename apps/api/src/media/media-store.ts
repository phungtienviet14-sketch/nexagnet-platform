/**
 * Tang luu anh — moi kho (none / local / s3) trien khai interface nay.
 * Cung khuon `channels/channel-adapter.ts`: pipeline khong phu thuoc nha cung cap cu the, nen doi
 * GCP -> OVHcloud chi la doi `MEDIA_ENDPOINT`/`MEDIA_BUCKET`/khoa, khong sua dong code nao.
 */
export abstract class MediaStore {
  abstract readonly name: string;
  /**
   * false = khong luu gi ca (MEDIA_STORE=none — MAC DINH cho demo/CI). MediaFetcher doc co nay de
   * bo qua HAN: khong tai byte nao, khong ghi mediaError gia. Nho vay CI khong phu thuoc mang.
   */
  abstract readonly enabled: boolean;
  /** Ghi mot object. `key` la duong dan trong bucket, vd `media/2026/08/<cuid>.webp`. */
  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;

  /**
   * Doc mot object ra. Truoc 15/08/2026 kho nay CHI GHI duoc: no sinh ra de tai anh Zalo ve truoc
   * khi link chet (<=35 ngay). Nhung tai lieu khach (muc 1.1) con yeu cau GUI anh san pham DI, ma
   * Zalo phai fetch duoc mot URL — nen phai doc nguoc ra duoc.
   *
   * Mac dinh tra `null` (cung khuon `check()`): kho khong ho tro doc thi route catalog tra 404
   * chu khong lam sap API.
   */
  async get(key: string): Promise<MediaObject | null> {
    void key;
    return null;
  }

  /**
   * XOA mot object — NANG LUC HEP, mo dung du cho #222 P1-C (go mot chung tu tai nham).
   *
   * ===========================================================================
   * BA DIEU CUA HOP DONG NAY, va moi dieu la mot quyet dinh chu khong mot chi tiet
   *
   *  1. IDEMPOTENT. Khoa khong ton tai KHONG phai loi — xoa hai lan, hoac xoa mot khoa ma object
   *     da bi vong doi bucket quet di, deu ket thuc o cung mot trang thai: khong con byte. Nem o
   *     day se buoc moi ben goi tu bat roi tu nuot, va cho nao nuot khong dung se giau mat mot
   *     loi quyen that.
   *  2. `supportsRemove` la mot CO DOC DUOC, khong phai mot phep thu. Ben goi phai biet TRUOC khi
   *     go mot dong metadata rang kho co don duoc byte hay khong — neu khong, duong "go chung tu"
   *     se xoa dau vet trong Postgres roi de lai mot object mo coi khong ai tim lai duoc.
   *  3. MAC DINH la `false` + khong lam gi. Mot kho moi khong tu dung duoc quyen xoa; no phai VIET
   *     RA rang minh xoa duoc. Cung khuon `get()` mac dinh tra `null`.
   *
   * ===========================================================================
   * VI SAO KHONG PHAI MOT LAN TAI CAU TRUC KHO ANH
   *
   * #223 giu phan nen tang tep dung nghia (vong doi, quota, quet rac, ky URL). O day chi mo DUNG
   * mot phep: bo mot khoa da biet. Khong duong liet ke, khong xoa theo tien to, khong xoa hang
   * loat — ba thu do la duong bien mot lan go nham thanh mot lan mat du lieu.
   */
  async remove(key: string): Promise<void> {
    void key;
  }

  /** Kho nay CO don duoc byte khong. Xem khoi chu thich cua `remove()`. */
  get supportsRemove(): boolean {
    return false;
  }

  /**
   * Kho CO THAT SU dung duoc khong — kiem bang mot request that toi noi luu, khong phai doc lai
   * bien moi truong.
   *
   * Vi sao can: cong readiness `media.production` truoc day chi doc co `enabled` cua kho, ma co do
   * la HANG SO `true` cua S3MediaStore. Nghia la dat du bon bien MEDIA_* la cong chuyen xanh — ke
   * ca khi bucket go nham ten, khoa HMAC het han, hay bucket nam o project khac. Cong go-live bao
   * xanh trong khi anh dau tien se ROT: dung mot loi bao sai nguy hiem.
   *
   * Mac dinh o day danh cho kho khong co I/O mang (none/local): trang thai tinh la du.
   */
  async check(): Promise<MediaStoreHealth> {
    return this.enabled
      ? { healthy: true, detail: `${this.name}: san sang` }
      : { healthy: false, detail: `${this.name}: khong luu anh` };
  }
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  pdf: 'application/pdf',
};

/**
 * Suy content-type tu duoi khoa. Kho S3/GCS co luu content-type luc ghi, nhung khong phai kho nao
 * cung tra lai duoc (LocalMediaStore ghi thang ra dia, khong co cho de luu metadata) — nen suy tu
 * duoi file la cach DUY NHAT dung chung cho ca ba kho.
 */
export function contentTypeForKey(key: string): string {
  const extension = key.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPES[extension] ?? 'application/octet-stream';
}

/** Mot object doc ra tu kho. `contentType` de route tra dung header cho Zalo. */
export interface MediaObject {
  readonly body: Buffer;
  readonly contentType: string;
}

export interface MediaStoreHealth {
  readonly healthy: boolean;
  /** Mo ta ngan cho nguoi van hanh doc. KHONG duoc chua khoa/secret hay URL co chu ky. */
  readonly detail: string;
}
