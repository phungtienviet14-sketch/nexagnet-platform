import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * TANG LUU TRU cua `#398` — nhung thu `schema.prisma` khong noi duoc.
 *
 * Muoi `CHECK` va hai trigger song trong SQL tho. `prisma migrate dev` diff schema voi DB se sinh
 * lenh XOA ca bon — he thong van chay, chi khong con chan gi: mot chang doi don `X -> Y`, mot phan
 * thuong mai quay nguoc tu `ORDER_BOUND` ve `PENDING`, mot nua khoi diem giao gia lam su that vi tri.
 * Bai nay do NGAY khi mot trong nhung dong do bien mat khoi migration.
 */

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../prisma/migrations');
const COMMERCIAL_DIR = join(MIGRATIONS, '20260926100100_transport_site_intake_commercial');
const commercial = readFileSync(join(COMMERCIAL_DIR, 'migration.sql'), 'utf8');
const adopted = readFileSync(
  join(MIGRATIONS, '20260926100000_transport_run_plan_outcome_adopted', 'migration.sql'),
  'utf8',
);

/** Bo chu thich `--` de khang dinh ve SQL THAT, khong ve loi giai thich. */
const sqlOf = (text: string): string =>
  text
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');

const commercialSql = sqlOf(commercial);

describe('tang luu tru cua viec tai xe nhan truc tiep -> don (#398)', () => {
  it('`ADOPTED` la MOT gia tri enum, o MOT migration rieng va khong gi khac', () => {
    expect(sqlOf(adopted).trim()).toBe(
      `ALTER TYPE "TransportRunPlanOutcome" ADD VALUE IF NOT EXISTS 'ADOPTED';`,
    );
  });

  it.each([
    'TransportSiteIntakeCommercial_destination_complete',
    'TransportSiteIntakeCommercial_known_place_has_ref',
    'TransportSiteIntakeCommercial_destination_label_not_blank',
    'TransportSiteIntakeCommercial_destination_latitude_range',
    'TransportSiteIntakeCommercial_destination_longitude_range',
    'TransportSiteIntakeCommercial_destination_not_null_island',
    'TransportSiteIntakeCommercial_origin_attestation_paired',
    'TransportSiteIntakeCommercial_binding_shape',
    'TransportSiteIntakeCommercial_exception_shape',
    'TransportSiteIntakeCommercial_rejected_has_reason',
  ])('migration van khai CHECK `%s`', (name) => {
    expect(commercialSql).toMatch(new RegExp(`ADD CONSTRAINT "${name}"\\s+CHECK`));
  });

  it('MOT hang thuong mai cho MOT lan xac nhan, MOT don cho MOT lan nhan viec', () => {
    expect(commercialSql).toContain(
      'CREATE UNIQUE INDEX "TransportSiteIntakeCommercial_intakeId_key" ON "TransportSiteIntakeCommercial"("intakeId")',
    );
    expect(commercialSql).toContain(
      'CREATE UNIQUE INDEX "TransportSiteIntakeCommercial_orderId_key" ON "TransportSiteIntakeCommercial"("orderId")',
    );
  });

  it('ca hai khoa ngoai deu RESTRICT — huy thay xoa', () => {
    const fkeys = [
      ...commercialSql.matchAll(
        /ADD CONSTRAINT "(TransportSiteIntakeCommercial_\w+_fkey)"\s+FOREIGN KEY \("(\w+)"\) REFERENCES "(\w+)"\("id"\) ON DELETE (\w+)/g,
      ),
    ].map((match) => [match[2], match[3], match[4]]);
    expect(fkeys).toEqual([
      ['intakeId', 'TransportRunSiteIntake', 'RESTRICT'],
      ['orderId', 'TransportOrder', 'RESTRICT'],
    ]);
    expect(commercialSql).not.toMatch(/ON DELETE (CASCADE|SET NULL)/);
  });

  it('trigger phan thuong mai chan XOA va chan quay nguoc, gan don MOT lan', () => {
    expect(commercialSql).toContain('CREATE TRIGGER "transport_site_intake_commercial_guard"');
    expect(commercialSql).toContain('BEFORE UPDATE OR DELETE ON "TransportSiteIntakeCommercial"');
    expect(commercialSql).toMatch(/IF TG_OP = 'DELETE' THEN\s+RAISE EXCEPTION/);
    expect(commercialSql).toContain(
      `IF OLD."orderId" IS NOT NULL AND NEW."orderId" IS DISTINCT FROM OLD."orderId" THEN`,
    );
    expect(commercialSql).toContain(
      `IF OLD."status" <> 'PENDING' AND NEW."status" IS DISTINCT FROM OLD."status" THEN`,
    );
  });

  /**
   * CHANG GAN DON MOT LAN: `X -> Y` bi cam. `X -> NULL` KHONG bi cam, co y — khoa ngoai `SET NULL`
   * cua lane A can no. Bai nay khoa ca hai chieu cua dieu kien.
   */
  it('trigger chang: `orderId` X -> Y bi cam, X -> NULL van qua', () => {
    expect(commercialSql).toContain('CREATE TRIGGER "transport_run_leg_order_binding_once"');
    expect(commercialSql).toContain('BEFORE UPDATE ON "TransportRunLeg"');
    expect(commercialSql).toMatch(
      /IF OLD\."orderId" IS NOT NULL AND NEW\."orderId" IS NOT NULL\s+AND NEW\."orderId" IS DISTINCT FROM OLD\."orderId" THEN/,
    );
  });

  it('`siteMatch` la cot NULLABLE (hang truoc #398 = khong biet), khong mac dinh doan', () => {
    expect(commercialSql).toContain(
      'ALTER TABLE "TransportRunSiteIntake" ADD COLUMN "siteMatch" "TransportSiteIntakeSiteMatch";',
    );
    expect(commercialSql).toContain(
      `CREATE TYPE "TransportSiteIntakeSiteMatch" AS ENUM ('UNIQUE_INSIDE', 'CHOSEN_AMONG_SEVERAL', 'NO_LOCATION');`,
    );
  });

  it('khong sua kieu, khong go rang buoc, khong xoa cot/bang nao dang ton tai', () => {
    expect(commercialSql).not.toMatch(/ALTER COLUMN/i);
    expect(commercialSql).not.toMatch(/DROP (TABLE|COLUMN|CONSTRAINT|TRIGGER|INDEX)/i);
    const altered = new Set(
      [...commercialSql.matchAll(/ALTER TABLE "([A-Za-z]+)"/g)].map((match) => match[1]),
    );
    expect(altered).toEqual(new Set(['TransportRunSiteIntake', 'TransportSiteIntakeCommercial']));
  });

  /** KHONG mot cot tien, khach, dieu khoan: phan thuong mai KHONG phai mot mo hinh don thu hai. */
  it('bang thuong mai khong mang mot cot tien/khach nao', () => {
    const table = commercialSql.slice(
      commercialSql.indexOf('CREATE TABLE "TransportSiteIntakeCommercial"'),
      commercialSql.indexOf('CREATE UNIQUE INDEX'),
    );
    const columns = [...table.matchAll(/^\s+"(\w+)"/gm)].map((match) => match[1]?.toLowerCase());
    expect(columns.length).toBeGreaterThan(20);
    for (const money of [
      'amount',
      'price',
      'currency',
      'freight',
      'fee',
      'cost',
      'customer',
      'payment',
      'vat',
      'tax',
    ]) {
      expect(columns.filter((column) => column?.includes(money))).toEqual([]);
    }
  });

  it('co duong lui viet san', () => {
    const rollback = join(COMMERCIAL_DIR, 'README-rollback.sql');
    expect(existsSync(rollback)).toBe(true);
    const text = readFileSync(rollback, 'utf8');
    expect(text).toContain('transport_run_leg_order_binding_once');
    expect(text).toContain('TransportSiteIntakeCommercial');
  });
});
