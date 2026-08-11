import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { MediaStore } from './media-store.js';

/**
 * Kho tren dia may — CHI cho dev/test. Production dung `S3MediaStore`: ke hoach ghi ro anh
 * "khong bao gio cham dia VM" de khong bao gio phai lo day dia (gd1.md §4 CHAN E).
 */
export class LocalMediaStore extends MediaStore {
  readonly name = 'local';
  readonly enabled = true;
  private readonly root: string;

  constructor(root: string) {
    super();
    this.root = resolve(root);
  }

  // `contentType` khong dung o day (duoi file da mang duoi .webp) nhung van giu du chu ky cua
  // MediaStore: mot ban cai dat hep hon interface se lam ben goi vo kieu khi doi kho.
  async put(key: string, body: Buffer, _contentType?: string): Promise<void> {
    const target = resolve(this.root, key);
    // Kiem LAN HAI (buildMediaKey da kiem id): day la bien gioi ghi dia, mot khoa la kem `../`
    // la duong ghi de file bat ky ngoai thu muc goc.
    if (!target.startsWith(this.root + sep)) {
      throw new Error(`Khoa vuot ra ngoai thu muc goc, tu choi ghi: "${key}"`);
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
  }
}
