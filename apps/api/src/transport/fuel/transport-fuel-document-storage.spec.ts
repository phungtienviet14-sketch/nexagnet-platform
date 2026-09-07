import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * CAC DOI TUONG DB CUA C2 KHONG BIEU DIEN DUOC BANG `schema.prisma`.
 *
 * Cung ly le voi `transport-fuel-station-storage.spec.ts`: `prisma migrate dev` sinh migration
 * bang cach diff schema voi DB va SE sinh lenh xoa moi `CHECK` duoi day. He thong van chay sau do,
 * chi khong con chan gi ca — va lan dau tien co nguoi biet la khi mot chung tu `PARSED` khong co
 * ung vien nao, hoac mot ung vien `NO_MATCH` lai mang mot `stationId`.
 */

const MIGRATION_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../prisma/migrations/20260908150000_transport_fuel_document',
);

const migration = readFileSync(join(MIGRATION_DIR, 'migration.sql'), 'utf8');
const rollback = readFileSync(join(MIGRATION_DIR, 'README-rollback.sql'), 'utf8');

const CHECK_CONSTRAINTS: ReadonlyArray<readonly [string, string]> = [
  ['TransportFuelDocument_reject_reason_paired', 'REJECTED <=> co ly do tu choi'],
  ['TransportFuelDocument_duplicate_link_paired', 'DUPLICATE <=> tro ve ban da nhap'],
  ['TransportFuelDocument_candidate_count_matches_status', 'chi PARSED moi co ung vien'],
  ['TransportFuelDocument_byteSize_positive', 'tep rong khong duoc ghi'],
  ['TransportFuelDocument_contentDigest_shape', 'dau van tay la SHA-256 viet thuong'],
  ['TransportFuelCandidate_lineNumber_positive', 'so dong dem tu 1'],
  ['TransportFuelCandidate_liters_positive', 'so lit > 0, NULL la "khong doc duoc"'],
  ['TransportFuelCandidate_unitPrice_positive', 'don gia > 0'],
  ['TransportFuelCandidate_amount_money_range', 'thanh tien duong va trong khoang bieu dien duoc'],
  ['TransportFuelCandidate_issuedDate_iso', 'ngay hoa don dang YYYY-MM-DD'],
  ['TransportFuelCandidate_odometerHint_non_negative', 'goi y odo khong am'],
  ['TransportFuelCandidate_plate_hint_paired', 'mot goi y phai biet no den tu dau'],
  ['TransportFuelCandidate_station_match_paired', 'RESOLVED la ket cuc DUY NHAT co tram'],
  ['TransportFuelStation_not_null_island', 'dong bo luat Null Island cua Lane B'],
];

const INDEXES: ReadonlyArray<readonly [string, boolean]> = [
  ['TransportFuelDocument_contentDigest_key', true],
  ['TransportFuelCandidate_documentId_lineNumber_key', true],
  ['TransportFuelCandidate_sellerTaxCode_invoiceSymbol_invoiceNo_lineNumber_key', true],
  ['TransportFuelDocument_supplierId_receivedAt_idx', false],
  ['TransportFuelDocument_status_receivedAt_idx', false],
  ['TransportFuelCandidate_stationId_idx', false],
  ['TransportFuelCandidate_issuedDate_idx', false],
];

describe('Rang buoc C2 phai con nguyen trong migration', () => {
  it.each(CHECK_CONSTRAINTS)('%s — %s', (name) => {
    expect(migration).toContain(`ADD CONSTRAINT "${name}"`);
  });

  it('dem du so `CHECK` — them mot cai moi ma quen bo test nay se do o day', () => {
    const declared = migration.match(/ADD CONSTRAINT "TransportFuel[^"]+"\s+CHECK/g) ?? [];
    expect(declared).toHaveLength(CHECK_CONSTRAINTS.length);
  });

  it.each(INDEXES)('chi so %s duoc tao', (name, unique) => {
    expect(migration).toContain(`CREATE ${unique ? 'UNIQUE ' : ''}INDEX "${name}"`);
  });

  /**
   * `INV-C2-DUP` lop HAI. Bon cot cua khoa nay deu `NOT NULL` — do la ly do
   * `MISSING_INVOICE_IDENTITY` tu choi ca chung tu thay vi nhap no voi cac o rong: Postgres coi hai
   * `NULL` la khac nhau, nen mot khoa co `NULL` khong chan duoc gi.
   */
  it('bon cot cua khoa chong trung deu NOT NULL', () => {
    for (const column of ['sellerTaxCode', 'invoiceSymbol', 'invoiceNo', 'lineNumber']) {
      expect(migration).toMatch(new RegExp(`"${column}" (TEXT|INTEGER) NOT NULL`));
    }
  });

  /** Chung tu la BANG CHUNG: xoa mot nha cung cap khong duoc keo theo lich su nhap cua no. */
  it('chung tu khong bi xoa lay theo nha cung cap; ung vien thi di theo chung tu', () => {
    expect(migration).toContain(
      'REFERENCES "TransportFuelSupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE',
    );
    expect(migration).toContain(
      'REFERENCES "TransportFuelDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE',
    );
  });
});

describe('Duong lui go dung nhung gi migration dat vao', () => {
  it.each(['TransportFuelCandidate', 'TransportFuelDocument'])('bang %s duoc go', (table) => {
    expect(migration).toContain(`CREATE TABLE "${table}"`);
    expect(rollback).toContain(`DROP TABLE IF EXISTS "${table}";`);
  });

  it.each([
    'TransportFuelDocumentKind',
    'TransportFuelDocumentStatus',
    'TransportFuelDocumentRejectReason',
    'TransportFuelStationMatch',
    'TransportFuelHintSource',
  ])('kieu enum %s duoc tao roi duoc go', (name) => {
    expect(migration).toContain(`CREATE TYPE "${name}"`);
    expect(rollback).toContain(`DROP TYPE IF EXISTS "${name}";`);
  });

  /** Bang con truoc bang cha — `CASCADE` cua khoa ngoai lo phan xoa HANG, khong lo phan xoa BANG. */
  it('go bang con truoc bang cha', () => {
    expect(rollback.indexOf('DROP TABLE IF EXISTS "TransportFuelCandidate"')).toBeLessThan(
      rollback.indexOf('DROP TABLE IF EXISTS "TransportFuelDocument"'),
    );
  });

  /**
   * Duong lui PHAI canh bao truoc khi go rang buoc Null Island: go no di la lech khoi luat cua
   * `apps/api/src/transport/geo/geo-point.ts` (Lane B), va lan lech do se im lang.
   */
  it('duong lui noi ro hau qua cua viec go rang buoc dong bo voi Lane B', () => {
    expect(rollback).toContain('TransportFuelStation_not_null_island');
    expect(rollback).toContain('geo-point.ts');
  });
});

/**
 * ENUM chi mang nhung gia tri DA CO NGUOI DOC.
 *
 * `EXTENSION_FIELD` va `BUYER_NAME` deu co mot duong doc THAT trong `fuel-candidate-normalize.ts`.
 * Mot gia tri thu ba khong co nguoi doc se la mot loi hua tren luoc do ma khong ma nao giu — va se
 * bi doc nham thanh "he thong co doc cho do".
 */
describe('Enum khong mang gia tri nao chua co nguoi doc', () => {
  it('nguon goi y dung hai gia tri', () => {
    expect(migration).toContain(
      `CREATE TYPE "TransportFuelHintSource" AS ENUM ('EXTENSION_FIELD', 'BUYER_NAME');`,
    );
  });

  it('loai chung tu dung mot gia tri — duong anh (C3) se them bang `ALTER TYPE`', () => {
    expect(migration).toContain(
      `CREATE TYPE "TransportFuelDocumentKind" AS ENUM ('EINVOICE_XML');`,
    );
  });
});
