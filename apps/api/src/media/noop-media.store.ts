import { MediaStore } from './media-store.js';

/**
 * Kho MAC DINH (MEDIA_STORE=none): khong I/O gi ca — demo/CI chay offline nhu truoc Task 2,
 * khong can bucket, khong can khoa. Song song `channels/mock.adapter.ts`.
 */
export class NoopMediaStore extends MediaStore {
  readonly name = 'none';
  readonly enabled = false;

  // Giu du chu ky cua MediaStore du khong dung tham so nao — ban cai dat hep hon interface
  // se lam ben goi vo kieu khi doi kho.
  async put(_key?: string, _body?: Buffer, _contentType?: string): Promise<void> {}
}
