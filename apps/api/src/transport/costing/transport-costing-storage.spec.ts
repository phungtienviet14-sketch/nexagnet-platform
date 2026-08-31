import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MONEY_MAX_AMOUNT, MONEY_MIN_AMOUNT } from '../money.js';
import {
  CORRELATION_INDEXES,
  FUND_PERIOD_NO_OVERLAP,
  REVERSAL_ONCE_INDEXES,
} from './costing-storage-conflict.js';

/**
 * HOP DONG LUU TRU cua `TX-03` — doi chieu SQL voi hang so TypeScript, KHONG can DB.
 *
 * Cung ly le voi `storage-contract.spec.ts` cua T2.1: bai o day doc CHINH TEP SQL, nen mot lech se
 * lo ra o job `verify` (chay tren moi PR, khong co Postgres) chu khong doi toi job `integration`.
 * Bang chung tren Postgres THAT nam o `transport-costing.int.spec.ts`; hai bo bo tro nhau, khong
 * thay the nhau.
 *
 * Bai nay con la LUOI AN TOAN cho mot kieu hong rat de xay ra: `prisma migrate dev` sinh lai
 * migration tu `schema.prisma` se KHONG mang theo mot `CHECK` hay `EXCLUDE` nao (Prisma khong co cu
 * phap cho chung). He thong van chay binh thuong sau do — chi khong con chan gi ca.
 */

const migrationDir = (file: string): string =>
  fileURLToPath(
    new URL(`../../../prisma/migrations/20260830140000_transport_costing/${file}`, import.meta.url),
  );

const migrationSql = readFileSync(migrationDir('migration.sql'), 'utf8');
const rollbackSql = readFileSync(migrationDir('README-rollback.sql'), 'utf8');

/**
 * Moi `CHECK`/`EXCLUDE` migration THEM vao, doc tu chinh SQL — khong phai mot danh sach go tay.
 *
 * CO Y bo qua khoa ngoai (`ADD CONSTRAINT ... FOREIGN KEY`): chung bien mat cung bang o buoc 2 cua
 * duong lui, nen bat chung phai co mot dong `DROP CONSTRAINT` rieng se la mot doi hoi vo nghia —
 * va mot bai test doi hoi vo nghia se bi tat, roi keo theo ca phan co nghia.
 */
const addedConstraints = [
  ...migrationSql.matchAll(/ADD CONSTRAINT "([^"]+)"\s+(?:CHECK|EXCLUDE)/g),
].map((match) => match[1]!);

describe('ten rang buoc la HOP DONG giua SQL va TypeScript', () => {
  it('bon unique ma kho dung de dich loi deu co that trong migration', () => {
    for (const index of [...CORRELATION_INDEXES, ...REVERSAL_ONCE_INDEXES]) {
      // Prisma tu dat ten unique index theo `<Model>_<cot>_key`; hang so TypeScript phai khop DUNG
      // ten do, neu khong thi `isUniqueViolationOn` khong nhan ra va nguoi dung nhan 500 thay vi 409.
      expect(migrationSql, index.indexName).toContain(`CREATE UNIQUE INDEX "${index.indexName}"`);
      expect(migrationSql, index.column).toContain(`("${index.column}")`);
    }
  });

  it('EXCLUDE chan chong lap ky mang dung ten ma kho doi chieu trong thong diep loi', () => {
    // EXCLUDE khong phai unique nen Prisma KHONG mo ra `P2002`; thu duy nhat con doi chieu duoc la
    // ten constraint trong chuoi loi. Lech ten thi va cham bien thanh mot loi 500 khong ten.
    expect(migrationSql).toContain(`ADD CONSTRAINT "${FUND_PERIOD_NO_OVERLAP}"`);
    expect(migrationSql).toContain('EXCLUDE USING gist');
  });
});

describe('khoang tien cua so cai trung khoang cua `money()`', () => {
  it('ba cot tien deu bi bo hep ve dung hai hang so cua mien', () => {
    const bound = `BETWEEN ${MONEY_MIN_AMOUNT} AND ${MONEY_MAX_AMOUNT}`;
    expect(migrationSql).toContain(`"signedAmount" ${bound}`);
    expect(migrationSql).toContain(`"openingBalance" ${bound}`);
    expect(migrationSql).toContain(`"closingBalance" ${bound}`);
  });

  it('anh chup phai TU NHAT QUAN — mot `UPDATE` tay khong de lai duoc mot anh "gan dung"', () => {
    expect(migrationSql).toContain('"closingBalance" = "openingBalance" + "periodNet"');
  });
});

describe('EXCLUDE chong lap ky — hai chi tiet de sai, ca hai khoa lai', () => {
  /**
   * Bai nay khoa MOT LOI DA XAY RA THAT (30/08/2026, lan chay dau cua T3).
   *
   * Ban dau bieu thuc dung `to_date("startDate", 'YYYY-MM-DD')`. Postgres tu choi ca migration:
   * `ERROR: functions in index expression must be marked IMMUTABLE` (42P17), vi `to_date` la STABLE
   * (`pg_proc.provolatile = 's'`), khong phai IMMUTABLE. `make_date` + `substr` deu IMMUTABLE.
   *
   * Neu ai do "don dep" ve `to_date` cho de doc, migration se do — nhung chi do o job co Postgres.
   * Dong nay lam no do ngay o `verify`.
   */
  it('KHONG dung `to_date` trong bieu thuc EXCLUDE — no la STABLE, khong dung duoc trong index', () => {
    const excludeBlock = migrationSql.slice(migrationSql.indexOf('EXCLUDE USING gist'));
    expect(excludeBlock).not.toContain('to_date');
    expect(excludeBlock).toContain('make_date');
  });

  /**
   * `'[]'` — khoang DONG CA HAI DAU.
   *
   * Voi `'[)'`, ky 01/08..31/08 va ky 31/08..30/09 se KHONG bi coi la chong lap, trong khi mot but
   * toan ngay 31/08 roi vao ca hai — tuc bat bien rong dung o cho de sai nhat. `fund-period.spec.ts`
   * khoa cung mot y o tang TypeScript (`periodsOverlap`).
   */
  it('khoang ngay DONG ca hai dau, de hai ky cham nhau mot ngay van la chong lap', () => {
    const excludeBlock = migrationSql.slice(migrationSql.indexOf('EXCLUDE USING gist'));
    expect(excludeBlock).toContain("'[]'");
  });

  it('extension duoc tao TRUOC khi co lenh nao can toi no', () => {
    const extension = migrationSql.indexOf('CREATE EXTENSION IF NOT EXISTS btree_gist');
    expect(extension).toBeGreaterThanOrEqual(0);
    expect(extension).toBeLessThan(migrationSql.indexOf('EXCLUDE USING gist'));
  });
});

describe('duong lui phai dao nguoc DU nhung gi migration them (bai hoc T2.1R/R2)', () => {
  /*
   * Danh sach duoc DOC RA tu chinh migration, khong go tay.
   *
   * T2.1R da bat mot lech dung kieu nay: mot danh sach viet tay dem thieu mot doi tuong, va khong
   * ai thay vi khong co gi doi chieu no voi su that. Doc tu SQL thi them mot `CHECK` moi ma quen
   * duong lui se lam dong nay do ngay.
   */
  it('moi rang buoc trong migration deu co mot lenh go tuong ung o duong lui', () => {
    expect(addedConstraints.length).toBeGreaterThan(0);
    for (const name of addedConstraints) {
      expect(rollbackSql, name).toContain(`DROP CONSTRAINT IF EXISTS "${name}"`);
    }
  });

  /**
   * Khac han duong lui cua T2.1: o do khong dong nao mat, o day BUOC 2 xoa CHINH SO CAI.
   *
   * Nen no phai o dang comment. Mot nguoi truc dang voi se dan ca tep vao `psql`, va neu lenh xoa
   * bang chay duoc thi moi but toan quy bien mat — `INV-20` khong dung lai duoc tu mot ban rong.
   */
  it('buoc xoa bang de o dang COMMENT, khong chay duoc khi dan ca tep', () => {
    for (const line of rollbackSql.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.includes('DROP TABLE')) continue;
      expect(trimmed.startsWith('--'), `dong nay chay duoc: ${trimmed}`).toBe(true);
    }
  });

  it('duong lui bat nguoi truc DEM du lieu truoc khi xoa', () => {
    expect(rollbackSql).toContain('SELECT count(*) FROM "TransportDriverFundEntry"');
    expect(rollbackSql).toContain('SELECT count(*) FROM "TransportTripExpense"');
  });

  /**
   * Extension co the dang phuc vu mot rang buoc khac ma nguoi truc khong biet — vd
   * `TransportTripAssignment` sau nay cung siet bang EXCLUDE. Go no tu dong se pha mot bat bien
   * khong lien quan gi toi T3.
   */
  it('KHONG go `btree_gist` tu dong — co the co nguoi khac dang dung', () => {
    for (const line of rollbackSql.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.includes('DROP EXTENSION')) continue;
      expect(trimmed.startsWith('--'), `dong nay chay duoc: ${trimmed}`).toBe(true);
    }
  });
});

describe('migration nay chi THEM, khong doi hinh dang cai gi dang co', () => {
  /**
   * Bat bien "chi them" la thu lam migration nay AN TOAN tien len tren mot DB dang chay.
   *
   * `prisma migrate diff` co sinh ra hai lenh `ALTER TABLE ... DROP DEFAULT` cho `DealerPriceOverride`
   * va `User` — do la DRIFT CO SAN giua migration da commit va `schema.prisma`, khong lien quan gi
   * toi T3. Chung da bi loai khoi tep nay co chu dich: mot PR cua mien van tai khong duoc lang le
   * sua hinh dang bang cua mien ban hang. Dong nay giu cho quyet dinh do khong bi dao nguoc bang
   * mot lan sinh lai migration.
   */
  it('khong `ALTER`/`DROP` bang nao dang co', () => {
    expect(migrationSql).not.toMatch(/ALTER TABLE "(?!Transport(DriverFund|TripExpense))/);
    expect(migrationSql).not.toContain('DROP TABLE');
    expect(migrationSql).not.toContain('DROP COLUMN');
  });

  it('khong cham vao bang cua mien ban hang', () => {
    for (const foreign of ['DealerPriceOverride', '"User"', '"Order"', '"Product"']) {
      expect(migrationSql, foreign).not.toContain(foreign);
    }
  });
});
