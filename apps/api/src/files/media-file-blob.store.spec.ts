import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { LocalMediaStore } from '../media/local-media.store.js';
import { buildMediaKey } from '../media/media-policy.js';
import { NoopMediaStore } from '../media/noop-media.store.js';
import { buildEvidenceKey } from '../transport/evidence/evidence-policy.js';
import { buildPlatformFileKey, isPlatformFileKey } from './file-policy.js';
import { MediaFileBlobStore } from './media-file-blob.store.js';

/**
 * TUONG THICH VOI KHO ANH DA CO — `#287` P4/P10, bai 14 cua P12.
 *
 * ============================================================================================
 * CAI BO NAY KHANG DINH, VA CAI NO KHONG KHANG DINH
 * ============================================================================================
 *
 * KHANG DINH: nen tang tep dung CHUNG mot kho voi anh tin nhan Zalo va bang chung nhien lieu, nen
 * doi `MEDIA_STORE` van la doi mot bien moi truong va khong mot byte cu nao mat duong doc.
 *
 * KHONG KHANG DINH: rang moi tep cu DA duoc chuyen sang nen tang. Chung chua. `#287` P10 cho phep
 * dung mot lop tuong thich co chan kem mot lo trinh con lai duoc noi ro, va do la dung trang thai
 * hom nay: `TransportFuelReceiptEvidence.locator` VAN la duong doc cua bang chung nhien lieu cu, va
 * `#225` khong bi dung toi.
 */

const dir = mkdtempSync(join(tmpdir(), 'lane-p-media-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const AT = new Date('2026-09-18T04:00:00.000Z');

describe('Mot kho duy nhat cho ca ba khu — PF-070', () => {
  /**
   * BAI 14 CUA P12: *"existing MediaStore compatibility remains readable"*.
   *
   * Ghi bang `MediaStore` (duong cu), doc bang `FileBlobStore` (duong moi) — cung mot byte. Neu
   * nen tang tep dung mot chong client thu hai, bai nay se khong the xanh.
   */
  it('object ghi bang duong CU doc duoc bang duong MOI', async () => {
    const media = new LocalMediaStore(dir);
    const blobs = new MediaFileBlobStore(media);

    const zaloKey = buildMediaKey('tin-nhan-1', AT);
    const evidenceKey = buildEvidenceKey('bang-chung-1', 'image/jpeg', AT);
    await media.put(zaloKey, Buffer.from('anh zalo'), 'image/webp');
    await media.put(evidenceKey, Buffer.from('bien lai'), 'image/jpeg');

    expect((await blobs.read(zaloKey))?.body.toString()).toBe('anh zalo');
    expect((await blobs.read(evidenceKey))?.body.toString()).toBe('bien lai');
  });

  /**
   * Tep cua nen tang nam DUOI `media/`, nen rule vong doi cua bucket (quet dung chuoi do) van thay
   * chung — khong phai dung mot rule thu hai cho mot khu moi.
   */
  it('tep cua nen tang nam duoi cung mot goc `media/`, o mot doan RIENG', async () => {
    const platformKey = buildPlatformFileKey('ma-tep-1', 'image/jpeg', AT, 'OPERATIONAL_DOCUMENT');

    expect(platformKey.startsWith('media/')).toBe(true);
    expect(platformKey).toContain('media/platform-file/');

    // Va ba khu KHONG lan vao nhau: rao cua nen tang tu choi ca hai khu cu.
    expect(isPlatformFileKey(buildMediaKey('tin-nhan-1', AT))).toBe(false);
    expect(isPlatformFileKey(buildEvidenceKey('bang-chung-1', 'image/jpeg', AT))).toBe(false);
    expect(isPlatformFileKey(platformKey)).toBe(true);
  });

  it('doi ten kho -> nha cung cap dung mot bang, khong mot phep doan', () => {
    expect(new MediaFileBlobStore(new LocalMediaStore(dir)).provider).toBe('LOCAL');
    expect(new MediaFileBlobStore(new NoopMediaStore()).provider).toBe('NONE');
  });
});

describe('Hop dong cua kho khong doi — PF-071', () => {
  /**
   * `MEDIA_STORE=none` la MAC DINH cua demo/CI. Neu lop boc am tham bao "da don" thi mot lo tep se
   * duoc danh dau `PURGED` trong khi byte chua bao gio ton tai — mot ho so noi doi.
   */
  it('kho tat: khong doc duoc, khong don duoc, va `stat` KHONG KET LUAN', async () => {
    const blobs = new MediaFileBlobStore(new NoopMediaStore());

    expect(blobs.enabled).toBe(false);
    expect(blobs.supportsRemove).toBe(false);
    expect(await blobs.read('media/platform-file/2026/09/x.jpg')).toBeNull();
    expect(await blobs.remove('media/platform-file/2026/09/x.jpg')).toBe(false);
    expect(await blobs.stat('media/platform-file/2026/09/x.jpg')).toEqual({ kind: 'UNSUPPORTED' });
  });

  /** Don hai lan, va don mot khoa chua bao gio ton tai, deu ket thuc o cung mot trang thai. */
  it('don byte la IDEMPOTENT — khoa khong ton tai KHONG phai loi', async () => {
    const media = new LocalMediaStore(dir);
    const blobs = new MediaFileBlobStore(media);
    const key = buildPlatformFileKey('ma-tep-2', 'image/jpeg', AT, 'GENERIC_ATTACHMENT');
    await blobs.put(key, Buffer.from('byte'), 'image/jpeg');

    expect(await blobs.stat(key)).toEqual({ kind: 'PRESENT', byteSize: 4 });
    expect(await blobs.remove(key)).toBe(true);
    expect(await blobs.stat(key)).toEqual({ kind: 'MISSING' });
    // Lan hai: khong nem, va khong doi gi.
    expect(await blobs.remove(key)).toBe(true);
    expect(
      await blobs.remove(
        buildPlatformFileKey('chua-bao-gio-co', 'image/jpeg', AT, 'GENERIC_ATTACHMENT'),
      ),
    ).toBe(true);
  });
});
