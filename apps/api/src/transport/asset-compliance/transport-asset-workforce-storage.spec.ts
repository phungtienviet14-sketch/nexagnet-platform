import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PAYROLL_PERIOD_NO_OVERLAP_CONSTRAINT,
  PAYSLIP_COMPONENT_FROZEN_TRIGGER,
  PAYSLIP_POSTED_IMMUTABLE_TRIGGER,
  WORKFORCE_UNIQUE_INDEXES,
} from '../workforce/workforce-storage-conflict.js';
import {
  ASSET_COMPLIANCE_UNIQUE_INDEXES,
  MAINTENANCE_PLAN_VEHICLE_IMMUTABLE_TRIGGER,
  MAINTENANCE_WORK_ORDER_PLAN_SAME_VEHICLE_TRIGGER,
} from './asset-compliance-storage-conflict.js';

/**
 * DOI CHIEU VAN BAN giua migration va cac hang so cua mien.
 *
 * Bai nay khong chay SQL. No ton tai vi mot lop bat bien nam O DUOI Prisma: `CHECK`, `EXCLUDE`,
 * unique mot phan va trigger deu khong sinh ra tu `schema.prisma`, nen mot lan `migrate diff` vo y
 * se lam chung bien mat MA KHONG mot bai test nao do — cho den khi mot hang sai lot vao DB that.
 *
 * Cung khuon `transport-fuel-storage.spec.ts` cua T4.
 */

const migrationDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../prisma/migrations/20260903090000_transport_asset_workforce',
);
const migration = readFileSync(join(migrationDir, 'migration.sql'), 'utf8');
const rollback = readFileSync(join(migrationDir, 'README-rollback.sql'), 'utf8');

/**
 * CHI CAC CAU LENH — bo moi dong chu thich.
 *
 * Can thiet chu khong tien nghi: cac chu thich cua chinh migration nay GIAI THICH vi sao khong dung
 * `"startDate"::date`, nen mot phep kiem "khong duoc chua `::date`" chay tren van ban tho se do vi
 * dung cai cau giai thich rang no khong lam dieu do.
 */
const statements = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

/** Gop moi khoang trang lien tiep — de mot cau lenh xuong dong doc duoc bang mot chuoi phang. */
const flat = statements.replace(/\s+/g, ' ');

const CHECK_CONSTRAINTS = [
  'TransportMaintenancePlan_interval_matches_trigger',
  'TransportMaintenancePlan_interval_positive',
  'TransportMaintenancePlan_baseline_odo_range',
  'TransportMaintenancePlan_baselineDate_iso',
  'TransportMaintenanceWorkOrder_dates_iso',
  'TransportMaintenanceWorkOrder_odo_range',
  'TransportMaintenanceWorkOrder_completion_fields',
  'TransportMaintenanceWorkOrder_cancellation_fields',
  'TransportMaintenanceWorkOrder_cost_money_range',
  'TransportComplianceDocument_dates_iso',
  'TransportComplianceDocument_subject_shape',
  'TransportPayrollPeriod_dates_iso',
  'TransportPayrollPeriod_closed_fields',
  'TransportPayrollRun_sequence_positive',
  'TransportPayslip_money_range',
  'TransportPayslip_net_is_gross_minus_deductions',
  'TransportPayslip_counts_range',
  'TransportPayslip_correction_shape',
  'TransportPayslip_no_self_correction',
  'TransportPayslip_posted_fields',
  'TransportPayslipComponent_money_range',
  'TransportPayslipComponent_deduction_manual_only',
  'TransportPayslipComponent_manual_needs_signer',
];

/**
 * MOI TRIGGER cua migration nay.
 *
 * Hai cai dau giu lich su phieu luong bat bien (`INV-20`, acceptance 12); hai cai sau giu mot
 * lenh sua va ke hoach cua no noi ve CUNG mot xe — mot bat bien khong `CHECK` nao dat duoc, vi
 * `CHECK` chi doc duoc hang cua chinh no.
 */
const ALL_TRIGGERS = [
  PAYSLIP_POSTED_IMMUTABLE_TRIGGER,
  PAYSLIP_COMPONENT_FROZEN_TRIGGER,
  MAINTENANCE_WORK_ORDER_PLAN_SAME_VEHICLE_TRIGGER,
  MAINTENANCE_PLAN_VEHICLE_IMMUTABLE_TRIGGER,
] as const;

/** Doan tu mot `CREATE ...` den dau cham phay ke tiep, tren ban da gop khoang trang. */
function statementStartingWith(needle: string): string {
  const start = flat.indexOf(needle);
  if (start < 0) return '';
  const end = flat.indexOf(';', start);
  return flat.slice(start, end < 0 ? undefined : end + 1);
}

describe('bat bien tang luu tru cua T6 — doi chieu van ban migration', () => {
  it('moi rang buoc CHECK duoc khai, va SO LUONG khop danh sach cuc bo', () => {
    for (const name of CHECK_CONSTRAINTS) {
      expect(migration, name).toContain(`ADD CONSTRAINT "${name}"`);
    }
    const declared = migration.match(/ADD CONSTRAINT "[^"]+"\s+CHECK/g) ?? [];
    expect(declared).toHaveLength(CHECK_CONSTRAINTS.length);
  });

  it('moi unique mot phan cua mien co mot CREATE UNIQUE INDEX co menh de WHERE', () => {
    for (const index of [...ASSET_COMPLIANCE_UNIQUE_INDEXES, ...WORKFORCE_UNIQUE_INDEXES]) {
      const statement = statementStartingWith(`CREATE UNIQUE INDEX "${index.indexName}"`);
      expect(statement, index.indexName).not.toBe('');
      expect(statement, `${index.indexName} phai la unique MOT PHAN`).toContain(' WHERE ');
    }
  });

  /**
   * KY LUONG KHONG CHONG LAP la mot `EXCLUDE`, khong mot unique.
   *
   * Unique khong bieu dien duoc "hai khoang ngay cham nhau". Neu ai do doi no thanh unique tren
   * `(startDate, endDate)` thi hai ky 01/08..31/08 va 15/08..15/09 se cung ton tai — va mot chuyen
   * ngay 20/08 duoc tra cong hai lan.
   */
  it('ky luong khong chong lap duoc cuong che bang EXCLUDE + btree_gist', () => {
    expect(statements).toContain('CREATE EXTENSION IF NOT EXISTS btree_gist');
    expect(statements).toContain(`ADD CONSTRAINT "${PAYROLL_PERIOD_NO_OVERLAP_CONSTRAINT}"`);
    expect(statements).toContain('EXCLUDE USING gist');
    expect(statements).toContain("'[]'");
  });

  /**
   * `make_date` la IMMUTABLE; `"startDate"::date` thi khong (no phu thuoc `DateStyle` cua phien),
   * nen Postgres tu choi dung no trong mot bieu thuc index.
   */
  it('khoang ngay dung make_date, khong dung ep kieu ::date', () => {
    expect(statements).toContain('make_date(');
    expect(statements).not.toContain('::date');
  });
});

describe('trigger — bat bien duy nhat CHECK khong lam duoc', () => {
  /**
   * Mot `CHECK` chi nhin duoc hang MOI. Cau hoi "hang CU dang o trang thai nao" chi trigger tra loi
   * duoc, va do la toan bo ly do hai trigger nay ton tai.
   */
  it('bon trigger duoc tao cung ham cua chung', () => {
    for (const name of ALL_TRIGGERS) {
      expect(statements, name).toContain(`CREATE TRIGGER "${name}"`);
    }
    for (const fn of [
      'transport_payslip_posted_immutable',
      'transport_payslip_component_frozen',
      'transport_work_order_plan_same_vehicle',
      'transport_plan_vehicle_immutable',
    ]) {
      expect(statements, fn).toContain(`CREATE OR REPLACE FUNCTION "${fn}"()`);
    }
  });

  /**
   * B1 — CHA CUA MOT DONG LA DANH TINH, KHONG PHAI MOT O SUA DUOC.
   *
   * Trigger cu chi hoi "phieu o `NEW.payslipId` co phai DRAFT khong", nen mot `UPDATE` doi chinh
   * `payslipId` tu mot phieu DA CHOT sang mot ban nhap lot qua: cau hoi duoc dat ve phia phieu
   * DEN. Bang chung chay that o `B1 (P7)` cua `transport-workforce.int.spec.ts`; bai nay giu cau
   * lenh khoi bien mat trong mot lan sinh lai migration.
   */
  it('trigger dong luong CHAN phep doi `payslipId` cua mot dong da co', () => {
    const fn = flat.slice(
      flat.indexOf('CREATE OR REPLACE FUNCTION "transport_payslip_component_frozen"()'),
      flat.indexOf('CREATE TRIGGER "TransportPayslip_component_frozen"'),
    );
    expect(fn).toContain(`TG_OP = 'UPDATE' AND NEW."payslipId" IS DISTINCT FROM OLD."payslipId"`);
  });

  /**
   * B2 — LICH SU cua mot phieu da chot cung dong bang, khong chi cac con so tien.
   *
   * Bang canh trang thai cua chinh trigger nay CHAP NHAN canh `X -> X`, nen mot `UPDATE` khong
   * doi trang thai di qua duoc — va neu cac cot duoi de ngo thi nguoi da duyet, moc da tra va ly
   * do sua cua mot phieu da chot viet lai duoc bang mot lenh ghi thang.
   */
  it('trigger phieu da chot dong bang ca CAC COT LICH SU, khong chi tien', () => {
    const fn = flat.slice(
      flat.indexOf('CREATE OR REPLACE FUNCTION "transport_payslip_posted_immutable"()'),
      flat.indexOf('CREATE TRIGGER "TransportPayslip_posted_immutable"'),
    );
    for (const column of ['approvedAt', 'approvedBy', 'correctionReason', 'createdAt', 'id']) {
      expect(fn, column).toContain(`NEW."${column}" IS DISTINCT FROM OLD."${column}"`);
    }
    // Moc da tra chi ghi duoc tren DUNG MOT canh.
    expect(fn).toContain(`OLD."status" = 'APPROVED' AND NEW."status" = 'PAID'`);
    expect(fn).toContain(`NEW."paidAt" IS DISTINCT FROM OLD."paidAt"`);
    expect(fn).toContain(`NEW."paidBy" IS DISTINCT FROM OLD."paidBy"`);
  });

  /**
   * B2 (bis) — MOT PHIEU DA TRA PHAI DAO DUOC.
   *
   * `..._posted_fields` tung viet ve thu hai la mot DANG THUC, va dang thuc do lam canh
   * `PAID -> REVERSED` bat kha thi o DB trong khi may trang thai van hua co no. Bai nay giu cho
   * dang thuc do khong quay lai.
   */
  it('`..._posted_fields` KHONG rang buoc moc da tra bang mot dang thuc', () => {
    const posted = statementStartingWith(
      'ALTER TABLE "TransportPayslip" ADD CONSTRAINT "TransportPayslip_posted_fields"',
    );
    expect(posted).not.toBe('');
    expect(posted).not.toContain(`("status" = 'PAID') = (`);
    expect(posted).toContain(`("paidAt" IS NULL) = ("paidBy" IS NULL)`);
    expect(posted).toContain(`"status" <> 'PAID' OR "paidAt" IS NOT NULL`);
    expect(posted).toContain(`"status" NOT IN ('DRAFT', 'APPROVED') OR "paidAt" IS NULL`);
  });

  /**
   * B3 — LENH SUA VA KE HOACH PHAI NOI VE CUNG MOT XE.
   *
   * Hai khoa ngoai doc lap deu tro toi hang co that trong khi cap doi van sai, va `CHECK` khong
   * doc duoc `vehicleId` cua mot bang khac. Trigger la thu duy nhat lam duoc, va CO Y khong dung
   * khoa ngoai gop `(planId, vehicleId)`: Prisma khong bieu dien duoc no nen mot lan
   * `migrate diff` sau nay se sinh cau lenh xoa no.
   */
  it('cap ke hoach/xe cua lenh sua duoc cuong che bang trigger, KHONG bang khoa ngoai gop', () => {
    expect(flat).toContain(
      `CREATE TRIGGER "${MAINTENANCE_WORK_ORDER_PLAN_SAME_VEHICLE_TRIGGER}" BEFORE INSERT OR UPDATE ON "TransportMaintenanceWorkOrder"`,
    );
    expect(flat).toContain(
      `CREATE TRIGGER "${MAINTENANCE_PLAN_VEHICLE_IMMUTABLE_TRIGGER}" BEFORE UPDATE ON "TransportMaintenancePlan"`,
    );
    expect(flat).not.toMatch(/FOREIGN KEY \("planId", *"vehicleId"\)/);
  });

  /**
   * TEN TRIGGER PHAI NAM TRONG CAU THONG BAO.
   *
   * Prisma khong cho ra ma loi co cau truc cho mot `RAISE EXCEPTION` cua plpgsql, nen cach duy nhat
   * `isPostedPayslipMutation()` nhan ra loi la doc van ban. Doi cau thong bao ma quen ten trigger se
   * lam ham do luon tra `false` — mot cong im lang mo toang.
   */
  it('cau RAISE EXCEPTION mang TEN TRIGGER de tang mien nhan dien duoc', () => {
    for (const name of ALL_TRIGGERS) {
      expect(flat, name).toContain(`RAISE EXCEPTION '${name}:`);
    }
  });

  it('trigger phieu chan BEFORE UPDATE, trigger dong chan ca INSERT/UPDATE/DELETE', () => {
    expect(flat).toContain(
      `CREATE TRIGGER "${PAYSLIP_POSTED_IMMUTABLE_TRIGGER}" BEFORE UPDATE ON "TransportPayslip"`,
    );
    expect(flat).toContain(
      `CREATE TRIGGER "${PAYSLIP_COMPONENT_FROZEN_TRIGGER}" BEFORE INSERT OR UPDATE OR DELETE ON "TransportPayslipComponent"`,
    );
  });
});

describe('migration CHI THEM — khong dong vao bang cua capability khac', () => {
  /**
   * BAI NAY DA BAT DUOC MOT LOI THAT.
   *
   * Ban dau migration duoc sinh bang `prisma migrate diff --from-url`, va phep so sanh do keo theo
   * DO LECH CO SAN giua DB va `schema.prisma` o hai bang cua mien BAN HANG (`DealerPriceOverride`,
   * `User`) — hai cau `ALTER COLUMN ... DROP DEFAULT` khong lien quan gi den T6. Chung da bi go bo.
   *
   * Do lech do VAN CON tren `main`; sua no la viec cua mot task khac. Cai bai nay giu la: mot
   * migration cua T6 khong duoc mang theo no.
   */
  it('khong go bo hay doi kieu mot cot nao dang ton tai', () => {
    expect(statements).not.toMatch(/\bDROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)\b/i);
    expect(statements).not.toMatch(/ALTER COLUMN/i);
  });

  it('chi tao bay bang moi cua T6, khong dung vao bang cua mien khac', () => {
    const created = statements.match(/CREATE TABLE "([^"]+)"/g) ?? [];
    expect(created).toHaveLength(7);
    for (const table of created) expect(table).toContain('"Transport');

    for (const foreign of ['DealerPriceOverride', '"User"', '"Order"', 'TransportTrip"']) {
      expect(statements, foreign).not.toContain(`ALTER TABLE ${foreign}`);
    }
  });
});

describe('duong lui', () => {
  it('go duoc moi rang buoc, unique va trigger ma migration tao ra', () => {
    for (const name of CHECK_CONSTRAINTS) {
      expect(rollback, name).toContain(`DROP CONSTRAINT IF EXISTS "${name}"`);
    }
    for (const index of [...ASSET_COMPLIANCE_UNIQUE_INDEXES, ...WORKFORCE_UNIQUE_INDEXES]) {
      expect(rollback, index.indexName).toContain(`DROP INDEX IF EXISTS "${index.indexName}"`);
    }
    for (const name of ALL_TRIGGERS) {
      expect(rollback, name).toContain(`DROP TRIGGER IF EXISTS "${name}"`);
    }
    expect(rollback).toContain(
      `DROP CONSTRAINT IF EXISTS "${PAYROLL_PERIOD_NO_OVERLAP_CONSTRAINT}"`,
    );
  });

  /**
   * Bay bang nay giu lich su luong da tra va bang chung giay to. Mot duong lui chay het mot mach se
   * xoa chung trong khi nguoi truc dang tim cach quay ve mot phien ban code — hai viec khong lien
   * quan gi den nhau. Nen buoc do phai la mot hanh dong CO Y THUC.
   */
  it('moi lenh xoa bang / kieu deu nam duoi dang chu thich', () => {
    for (const line of rollback.split('\n')) {
      if (/\bDROP\s+(TABLE|TYPE)\b/i.test(line)) {
        expect(line.trimStart(), line).toMatch(/^--/);
      }
    }
  });

  it('KHONG bo `btree_gist` — T3 va T5 van dang dung', () => {
    expect(rollback).not.toMatch(/^\s*DROP EXTENSION/m);
  });
});
