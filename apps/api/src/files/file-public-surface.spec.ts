import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { toFileDescriptor, toFileLinkDescriptor } from './file.dto.js';
import type { FileLink, FileRecord } from './file.types.js';

/**
 * BE MAT CONG KHAI cua nen tang tep, doc CHINH MA NGUON — `#287` P1/P4/P7/P11, bai 1/2 cua P12.
 *
 * ============================================================================================
 * VI SAO DOC MA NGUON, khong chi goi ham
 * ============================================================================================
 *
 * Mot bai kiem hanh vi ("goi `toFileDescriptor` roi xem co `storageKey` khong") chi chung minh duoc
 * HOM NAY. No xanh tro lai ngay sau khi ai do them mot truong `locator` vao `FileDescriptor` va mot
 * dong `locator: file.storageKey` vao ham — vi bai kiem do khong biet phai hoi ve mot truong chua
 * ton tai luc no duoc viet.
 *
 * Bai o day doc chinh cac tep va tu choi nhung TEN. Cung ly le voi
 * `transport-operational-document-storage.spec.ts` va `document-file.port.ts` cua Lane O.
 *
 * ============================================================================================
 * CHUAN HOA XUONG DONG TRUOC KHI SO
 * ============================================================================================
 *
 * Worktree tren Windows co the co CRLF trong khi blob cua git la LF. Mot moc so bang `'\n'` se
 * khong khop va bai kiem do GIA — dung tinh huong da tung xay ra that o mot spec quet schema.
 */
const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

/**
 * MA NGUON KHONG KEM CHU THICH.
 *
 * Cac phep quet ben duoi cam mot so TEN xuat hien trong ma. Nhung chinh cac khoi chu thich la cho
 * GIAI THICH vi sao nhung ten do vang mat — `file-blob.port.ts` trich nguyen van cau cua `#287` ve
 * *"a second GCS/S3/local client stack"*, va `file-decisions.ts` neu `FILE_NOT_A_TRANSPORT_DOCUMENT`
 * lam mot vi du PHAN VI DU.
 *
 * Quet ca chu thich se bat dung nhung cau do, va cach "sua" re nhat la xoa loi giai thich di. Nen
 * phep quet chay tren MA, va tai lieu duoc de yen.
 */
const codeOf = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');

const sourceFiles = (): readonly { name: string; text: string }[] =>
  readdirSync(fileURLToPath(new URL('.', import.meta.url)))
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
    .filter((name) => name !== 'file-test-doubles.ts')
    .map((name) => ({ name, text: read(`./${name}`) }));

const FILE: FileRecord = {
  id: 'ma-tep',
  purpose: 'OPERATIONAL_DOCUMENT',
  originalFilename: '../../etc/passwd',
  safeFilename: 'passwd.jpg',
  declaredMimeType: 'image/jpeg',
  detectedMimeType: 'image/jpeg',
  byteSize: 12,
  sha256: 'a'.repeat(64),
  storageProvider: 'GCS',
  storageKey: 'media/platform-file/2026/09/ma-tep.jpg',
  createdBy: 'user-1',
  state: 'ACTIVE',
  scanState: 'NOT_SCANNED',
  scannedAt: null,
  retainUntil: null,
  legalHold: false,
  captureMetadata: { gps: 'bi mat' },
  createdAt: new Date('2026-09-18T02:00:00.000Z'),
  activatedAt: new Date('2026-09-18T02:00:00.000Z'),
  withdrawnAt: null,
  withdrawnBy: null,
  quarantinedAt: null,
  purgeRequestedAt: null,
  purgedAt: null,
  purgeAttempts: 0,
  purgeFailedAt: null,
  purgeFailureCode: null,
};

const LINK: FileLink = {
  id: 'ma-lien-ket',
  fileId: 'ma-tep',
  businessOwnerType: 'FAKE_OWNER',
  businessOwnerId: 'DOC-1',
  purpose: 'OPERATIONAL_DOCUMENT',
  state: 'ACTIVE',
  createdBy: 'user-1',
  createdAt: new Date('2026-09-18T02:00:00.000Z'),
  withdrawnBy: null,
  withdrawnAt: null,
};

describe('Khong mot dinh vi tho nao ra khoi may chu — PF-040 (`#287` P12 bai 1)', () => {
  it('ban cong khai khong mang khoa luu tru, ten nha cung cap, hay ten goc', () => {
    const serialised = JSON.stringify(toFileDescriptor(FILE));

    expect(serialised).not.toContain('media/platform-file');
    expect(serialised).not.toContain('storageKey');
    expect(serialised).not.toContain('GCS');
    // Ten nguoi dung gui len cung khong ra: no la du lieu ben ngoai.
    expect(serialised).not.toContain('etc/passwd');
    // Su tich lan ghi nhan thuoc ve MIEN ghi no, khong phai be mat chung cua nen tang.
    expect(serialised).not.toContain('bi mat');

    expect(toFileDescriptor(FILE)).toEqual({
      id: 'ma-tep',
      purpose: 'OPERATIONAL_DOCUMENT',
      filename: 'passwd.jpg',
      contentType: 'image/jpeg',
      byteSize: 12,
      sha256: 'a'.repeat(64),
      state: 'ACTIVE',
      scanState: 'NOT_SCANNED',
      createdAt: '2026-09-18T02:00:00.000Z',
      activatedAt: '2026-09-18T02:00:00.000Z',
      withdrawnAt: null,
    });
  });

  it('ban cong khai cua lien ket khong mang ma tep nao khac ngoai chinh no', () => {
    expect(toFileLinkDescriptor(LINK)).toEqual({
      id: 'ma-lien-ket',
      fileId: 'ma-tep',
      businessOwnerType: 'FAKE_OWNER',
      businessOwnerId: 'DOC-1',
      purpose: 'OPERATIONAL_DOCUMENT',
      state: 'ACTIVE',
      createdAt: '2026-09-18T02:00:00.000Z',
      withdrawnAt: null,
    });
  });

  /**
   * DOC CHINH MA NGUON: mot truong ten `locator`/`bucket`/`url`/`path`/`storageKey` them vao
   * `FileDescriptor` se do o day, ngay ca khi khong bai kiem hanh vi nao hoi ve no.
   *
   * Chi doc TEN TRUONG, khong ca khoi van ban: chu thich cua tep NHAC toi `storageKey` de giai
   * thich vi sao no vang mat, va mot phep quet ca khoi se bat chinh cau giai thich do.
   */
  it('kieu `FileDescriptor` chi khai nhung truong da liet ke, khong mot dinh vi nao', () => {
    const dto = read('./file.dto.ts');
    const body = dto.slice(
      dto.indexOf('export interface FileDescriptor {'),
      dto.indexOf('}', dto.indexOf('export interface FileDescriptor {')),
    );
    const fields = [...body.matchAll(/readonly (\w+)[?]?:/g)].map((match) => match[1]);

    expect(fields).toEqual([
      'id',
      'purpose',
      'filename',
      'contentType',
      'byteSize',
      'sha256',
      'state',
      'scanState',
      'createdAt',
      'activatedAt',
      'withdrawnAt',
    ]);
    for (const field of fields) {
      expect(field).not.toMatch(/storage|locator|bucket|url|path|key/i);
    }
  });
});

describe('Khong mot URL cong khai vinh vien nao — PF-041 (`#287` P12 bai 2)', () => {
  /**
   * `#287` P3 bat bien 9: *"old raw locator cannot bypass lifecycle because no permanent public URL
   * exists"*. Bat bien do khong kiem duoc bang mot lan goi ham — no la mot khang dinh ve NHUNG GI
   * KHONG CO trong ma nguon.
   *
   * `MediaStore`/`FileBlobStore` khong co phep ky URL nao, nen duong duy nhat byte ra ngoai la
   * `FilesController.content` — mot tuyen CO XAC THUC, di qua `FileAuthorizationService`.
   */
  it('khong tep nao trong mien nay ky URL hay dung mot duong dan cong khai', () => {
    for (const { name, text } of sourceFiles()) {
      const code = codeOf(text);

      expect(code, name).not.toMatch(/getSignedUrl|signUrl|createSignedUrl|presign/i);
      expect(code, name).not.toContain('storage.googleapis.com');
      expect(code, name).not.toContain('publicUrl');
      expect(code, name).not.toContain('makePublic');
    }
  });
});

describe('Nen tang trung lap nha cung cap — PF-042 (`#287` P4, muc 11 nghiem thu cuoi)', () => {
  /**
   * `#223`, duoc `#287` nhac lai o dau hop dong: *"GCS is NOT the architectural default. It is one
   * provider."* va P4: *"Provider-neutral business code must not contain GCS-only semantics."*
   *
   * Nen mien nay khong duoc mang mot khai niem rieng cua mot nha cung cap nao. `GCS` chi duoc phep
   * xuat hien nhu MOT GIA TRI trong danh sach bon nha cung cap, khong nhu mot nhanh xu ly.
   */
  it('khong nghiep vu nao re nhanh theo mot nha cung cap cu the', () => {
    for (const { name, text } of sourceFiles()) {
      if (name === 'file.types.ts' || name === 'media-file-blob.store.ts') continue;
      const code = codeOf(text);
      expect(code, name).not.toMatch(/\bGCS\b/);
      expect(code, name).not.toMatch(/\bS3\b/);
    }
  });

  /**
   * `media-file-blob.store.ts` duoc PHEP nhac ten bon nha cung cap, vi no la cho doi ten kho thanh
   * gia tri. Nhung no phai lam dieu do bang mot BANG, khong bang mot chuoi `if` — mot bang thi
   * khong co cho de nhet mot nhanh xu ly rieng cho mot nha cung cap.
   */
  it('doi ten kho -> nha cung cap bang mot bang, khong mot chuoi re nhanh', () => {
    const store = read('./media-file-blob.store.ts');
    expect(store).toContain('const PROVIDER_BY_STORE_NAME');
    expect(store).not.toMatch(/if \(.*(gcs|s3).*\)/i);
  });

  /** Kho byte duy nhat la lop BOC quanh `MediaStore` — `#287` P4 cam fork mot chong client thu hai. */
  it('khong mot client luu tru thu hai nao duoc dung len', () => {
    for (const { name, text } of sourceFiles()) {
      expect(text, name).not.toContain('@aws-sdk/');
      expect(text, name).not.toContain('@google-cloud/storage');
    }
    expect(read('./media-file-blob.store.ts')).toContain("from '../media/media-store.js'");
  });
});

describe('Nen tang khong biet ten mot mien nao — PF-043 (`#287` P11)', () => {
  /**
   * Quyet dinh kien truc #6 va `#287` P11 (*"business taxonomy remains Lane O"*).
   *
   * Phep quet nay la cai giu cho `businessOwnerType` that su la mot CHUOI CUA MIEN: khoanh khac
   * `files/` biet chuoi `TRANSPORT_OPERATIONAL_DOCUMENT` la khoanh khac no khong con la nen tang.
   */
  it('khong ten khach, ten mien hay taxonomy nghiep vu nao trong `files/`', () => {
    for (const { name, text } of sourceFiles()) {
      expect(text, name).not.toMatch(/\bULTTY\b|\bAMICO\b|\bWATA\b/i);
      const code = codeOf(text);
      expect(code, name).not.toMatch(/DELIVERY_RECEIPT|GATE_PASS|WEIGH_TICKET|LOADING_SLIP/);
      expect(code, name).not.toMatch(/TRANSPORT_[A-Z_]+/);
      expect(code, name).not.toContain("from '../transport/");
    }
  });
});

describe('Khong dinh vi nao vao dau vet hay telemetry — PF-044 (`#287` P7)', () => {
  /**
   * *"Never log raw bytes, credentials, signed URLs, private storage paths or secret env dumps."*
   *
   * Phep quet nay doc tung lan goi `telemetry.decision`/`audit.append` va tu choi `storageKey` xuat
   * hien trong than chung. Mot dong `detail: { storageKey }` them vao se do ngay.
   */
  it('khong lan goi telemetry/dau vet nao mang khoa luu tru', () => {
    for (const { name, text } of sourceFiles()) {
      const calls = [
        ...text.matchAll(/this\.telemetry\?\.decision\(\{[\s\S]*?\n {4}\}\);/g),
        ...text.matchAll(/this\.audit\.append\(\{[\s\S]*?\n {4}\}\);/g),
        ...text.matchAll(/detail: \{[^}]*\}/g),
      ].map((match) => match[0]);

      // MOT PHEP QUET KHONG KHOP GI LA MOT BAI KIEM XANH GIA. Prettier co the doi thut dong, va
      // khuon o tren doc theo thut dong — nen phai khang dinh rang no THAT SU tim thay lan goi.
      if (name === 'file.service.ts' || name === 'file-purge.service.ts') {
        expect(
          calls.length,
          `${name}: khong khop mot lan goi telemetry/dau vet nao`,
        ).toBeGreaterThanOrEqual(4);
      }

      for (const call of calls) {
        expect(call, `${name}: ${call.slice(0, 80)}`).not.toContain('storageKey');
      }
    }
  });

  /** Than loi HTTP cung vay: mot loi tra ra ngoai la duong de ro ri de nhat. */
  it('than loi HTTP chi mang bon truong da liet ke', () => {
    const errors = read('./file.errors.ts');
    const body = errors.slice(
      errors.indexOf('export interface FileErrorBody {'),
      errors.indexOf('}', errors.indexOf('export interface FileErrorBody {')),
    );
    const fields = [...body.matchAll(/readonly (\w+)[?]?:/g)].map((match) => match[1]);
    expect(fields).toEqual(['statusCode', 'error', 'message', 'reason']);
  });
});
