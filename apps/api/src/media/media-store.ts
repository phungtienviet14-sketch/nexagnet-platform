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
}
