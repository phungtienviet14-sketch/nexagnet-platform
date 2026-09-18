import { MediaStore } from '../media/media-store.js';
import {
  FileBlobStore,
  type FileBlob,
  type FileBlobStat,
  type FileBlobStoreHealth,
} from './file-blob.port.js';
import type { FileStorageProvider } from './file.types.js';

/**
 * HIEN THUC DUY NHAT cua `FileBlobStore` — mot LOP BOC quanh `MediaStore` da co. `#287` P4/P10.
 *
 * ============================================================================================
 * TAI SAO BOC chu khong VIET LAI
 * ============================================================================================
 *
 * `#287` P4 cam fork mot chong client thu hai, va P10 doi *"existing objects remain readable
 * through compatibility path"*. Ca hai dieu do chi dung duoc neu BYTE CUA NEN TANG TEP VA BYTE CU
 * NAM TRONG CUNG MOT KHO, duoc chon boi cung mot `MEDIA_STORE`.
 *
 * Nen lop nay khong biet gi ve HTTP, ve chu ky, ve bucket. No doi mot chuoi khoa lay mot chuoi
 * khoa, va moi quyet dinh ve nha cung cap van nam o `createMediaStore()` — dung mot cho, nhu truoc.
 *
 * ============================================================================================
 * TEN KHO -> NHA CUNG CAP: mot bang, khong mot phep doan
 * ============================================================================================
 *
 * `MediaStore.name` la mot chuoi tu do cua tang duoi. Doi chieu no bang mot bang TUONG MINH, va
 * `UNKNOWN_PROVIDER_FALLBACK` la `NONE` chu khong phai `S3`: mot kho la khong nhan ra phai duoc ghi
 * vao hang la "khong xac dinh duoc" chu khong duoc doan thanh mot nha cung cap that. Mot hang ghi
 * sai nha cung cap se lam lan don byte ve sau tim nham cho.
 */
const PROVIDER_BY_STORE_NAME: Readonly<Record<string, FileStorageProvider>> = {
  none: 'NONE',
  local: 'LOCAL',
  s3: 'S3',
  gcs: 'GCS',
};

export class MediaFileBlobStore extends FileBlobStore {
  readonly provider: FileStorageProvider;

  constructor(private readonly store: MediaStore) {
    super();
    this.provider = PROVIDER_BY_STORE_NAME[store.name] ?? 'NONE';
  }

  get enabled(): boolean {
    return this.store.enabled;
  }

  get supportsRemove(): boolean {
    return this.store.supportsRemove;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.store.put(key, body, contentType);
  }

  async read(key: string): Promise<FileBlob | null> {
    if (!this.store.enabled) return null;
    return this.store.get(key);
  }

  /**
   * `MediaStore` khong co phep HEAD, nen phep nay TAI BYTE VE roi do do dai.
   *
   * Viet ra thay vi giau di: tren mot lan quet mo coi dien rong day la mot chi phi that. No chap
   * nhan duoc hom nay vi phep quet chay o che do THU KHONG (`#287` P8 *"cleanup dry-run first"*) va
   * tren mot lo co chan, con mot phep HEAD that su thuoc tang nha cung cap — tuc `#227`.
   *
   * `UNSUPPORTED` khi kho dang tat: dem mot kho `none` thanh "mat byte" se bao TOAN BO ho so la mo
   * coi moi lan chay CI, tuc bien mot phep do thanh mot nguon bao dong gia.
   */
  async stat(key: string): Promise<FileBlobStat> {
    if (!this.store.enabled) return { kind: 'UNSUPPORTED' };
    const object = await this.store.get(key);
    return object ? { kind: 'PRESENT', byteSize: object.body.byteLength } : { kind: 'MISSING' };
  }

  /**
   * `false` KHONG PHAI LOI — cung hop dong voi `TransportEvidenceService.remove()`.
   *
   * `MEDIA_STORE=none` va cac kho chua hien thuc `remove` deu tra `false`. Luc do tep DA bien mat
   * khoi ho so dung nhu nguoi dung yeu cau, chi con lai mot object khong ai tro toi. Nem se lam ca
   * thao tac don that bai SAU KHI no da thanh cong mot nua.
   */
  async remove(key: string): Promise<boolean> {
    if (!this.store.enabled || !this.store.supportsRemove) return false;
    await this.store.remove(key);
    return true;
  }

  async check(): Promise<FileBlobStoreHealth> {
    return this.store.check();
  }
}
