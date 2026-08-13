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

export interface MediaStoreHealth {
  readonly healthy: boolean;
  /** Mo ta ngan cho nguoi van hanh doc. KHONG duoc chua khoa/secret hay URL co chu ky. */
  readonly detail: string;
}
