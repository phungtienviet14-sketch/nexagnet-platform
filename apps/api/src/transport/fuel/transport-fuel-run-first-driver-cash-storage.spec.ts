import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FUND_ENTRY_LEG_RUN,
  isFundEntryLegRunViolation,
} from '../costing/costing-storage-conflict.js';
import {
  FUEL_ENTRY_DRIVER_CASH_NEEDS_TRIP,
  FUEL_ENTRY_DRIVER_FUND_LEG,
  FUEL_ENTRY_DRIVER_FUND_LEG_SHAPE,
  FUEL_ENTRY_DRIVER_FUND_ONCE,
  driverFundLegOnIneligibleEntry,
  isDriverFundLegShapeViolation,
  isDriverFundLegViolation,
} from './fuel-storage-conflict.js';
import { fuelCostCorrelationKey } from './fuel.ports.js';

/**
 * `#369` R-4 — CAC DOI TUONG DB cua duong Quy lai xe Run-first KHONG bieu dien duoc bang `schema.prisma`.
 *
 * Cung ly do voi `transport-fuel-run-first-storage.spec.ts`: `prisma migrate dev` diff schema voi DB
 * se sinh lenh XOA moi `CHECK` va trigger viet tay — he thong van chay, chi khong con chan gi, va
 * "mot phieu, toi da MOT chan Quy" bien mat trong im lang. Tep nay doc CHINH hai migration va do neu
 * mot ten khong con. Hieu luc THAT do `transport-fuel-run-first-driver-cash.int.spec.ts` chung minh.
 *
 * Doc qua `replace(/\r\n/g, '\n')`: worktree Windows co the la CRLF, blob git la LF.
 */

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../prisma/migrations');

const read = (dir: string, name: string): string =>
  readFileSync(join(MIGRATIONS, dir, name), 'utf8').replace(/\r\n/g, '\n');

/** Bo dong chu thich SQL — chu thich GIAI THICH vi sao khong lam dieu bi cam. */
const stripComments = (sql: string): string =>
  sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

const kindMigration = stripComments(
  read('20260923100000_transport_driver_fund_run_expense_kind', 'migration.sql'),
);
const code = stripComments(
  read('20260923110000_transport_fuel_run_first_driver_cash', 'migration.sql'),
);
const rollback = read('20260923110000_transport_fuel_run_first_driver_cash', 'README-rollback.sql');
const rollbackCode = stripComments(rollback);

describe('#369 R-4 — gia tri enum tach RIENG mot migration', () => {
  /**
   * `ALTER TYPE ... ADD VALUE` khong dung duoc gia tri moi trong CHINH giao dich do, va Prisma boc moi
   * tep trong mot giao dich. Gop voi lenh viet lai `CHECK` se lam Postgres tu choi ca tep.
   */
  it('chi MOT cau lenh, co `IF NOT EXISTS`', () => {
    const statements = kindMigration
      .split(';')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);
    expect(statements).toEqual([
      `ALTER TYPE "TransportDriverFundEntryKind" ADD VALUE IF NOT EXISTS 'RUN_EXPENSE'`,
    ]);
  });
});

describe('#369 R-4 — so Quy lai xe: loai `RUN_EXPENSE` va ngu canh vong chay', () => {
  it('hai cot ngu canh moi, khoa ngoai RESTRICT, co index', () => {
    expect(code).toContain('ALTER TABLE "TransportDriverFundEntry" ADD COLUMN     "legId" TEXT');
    expect(code).toContain('ADD COLUMN     "runId" TEXT;');
    expect(code).toMatch(
      /"TransportDriverFundEntry_runId_fkey" FOREIGN KEY \("runId"\) REFERENCES "TransportVehicleRun"\("id"\) ON DELETE RESTRICT/,
    );
    expect(code).toMatch(
      /"TransportDriverFundEntry_legId_fkey" FOREIGN KEY \("legId"\) REFERENCES "TransportRunLeg"\("id"\) ON DELETE RESTRICT/,
    );
    expect(code).toContain(
      'CREATE INDEX "TransportDriverFundEntry_runId_idx" ON "TransportDriverFundEntry"("runId")',
    );
    expect(code).toContain(
      'CREATE INDEX "TransportDriverFundEntry_legId_idx" ON "TransportDriverFundEntry"("legId")',
    );
  });

  /**
   * Viet lai `sign_by_kind` = CONG THEM mot ve. Sau ve cu phai con NGUYEN VAN — mot ve bi sot se lam
   * mot loai but toan cu hoac khong ghi duoc nua, hoac ghi duoc voi dau sai.
   */
  it('`sign_by_kind` giu nguyen sau ve cu va them `RUN_EXPENSE` AM', () => {
    const rewrite = code.slice(
      code.indexOf('ADD CONSTRAINT "TransportDriverFundEntry_sign_by_kind"'),
    );
    expect(code).toContain('DROP CONSTRAINT "TransportDriverFundEntry_sign_by_kind"');
    for (const branch of [
      `("kind" = 'ADVANCE' AND "signedAmount" > 0)`,
      `OR ("kind" = 'RETURN' AND "signedAmount" < 0)`,
      `OR ("kind" = 'TRIP_EXPENSE' AND "signedAmount" < 0)`,
      `OR ("kind" = 'ADJUSTMENT' AND "signedAmount" <> 0)`,
      `OR ("kind" = 'REVERSAL' AND "signedAmount" <> 0)`,
      `OR ("kind" = 'REIMBURSEMENT' AND "signedAmount" > 0)`,
      `OR ("kind" = 'RUN_EXPENSE' AND "signedAmount" < 0)`,
    ]) {
      expect(rewrite, branch).toContain(branch);
    }
  });

  it('ba `CHECK` hinh dang + trigger chang/vong chay mang ten TRONG thong diep', () => {
    expect(code).toContain('ADD CONSTRAINT "TransportDriverFundEntry_one_context_kind"');
    expect(code).toContain('CHECK (num_nonnulls("tripId", "runId") <= 1)');
    expect(code).toContain('ADD CONSTRAINT "TransportDriverFundEntry_leg_needs_run"');
    expect(code).toContain('CHECK ("legId" IS NULL OR "runId" IS NOT NULL)');
    expect(code).toContain('ADD CONSTRAINT "TransportDriverFundEntry_run_expense_shape"');
    expect(code).toContain(`CHECK ("kind" <> 'RUN_EXPENSE' OR "runId" IS NOT NULL)`);

    expect(code).toContain('CREATE TRIGGER "transport_driver_fund_entry_run_context"');
    expect(code).toContain(
      'BEFORE INSERT OR UPDATE OF "runId", "legId" ON "TransportDriverFundEntry"',
    );
    expect(code).toContain(`'${FUND_ENTRY_LEG_RUN}: chang %`);
  });
});

describe('#369 R-4 — phieu Run-first noi toi chan Quy cua no', () => {
  it('go `CHECK` cua `#364`: `DRIVER_CASH` thoi can chuyen v1', () => {
    expect(code).toContain(`DROP CONSTRAINT "${FUEL_ENTRY_DRIVER_CASH_NEEDS_TRIP}"`);
  });

  it('cot `driverFundEntryId` UNIQUE, KHONG khoa ngoai sang `TX-03` — doi xung `costExpenseId`', () => {
    expect(code).toContain(
      'ALTER TABLE "TransportFuelEntry" ADD COLUMN     "driverFundEntryId" TEXT',
    );
    expect(code).toContain(
      `CREATE UNIQUE INDEX "${FUEL_ENTRY_DRIVER_FUND_ONCE.indexName}" ON "TransportFuelEntry"("driverFundEntryId")`,
    );
    expect(code).not.toContain('TransportFuelEntry_driverFundEntryId_fkey');
  });

  it('`CHECK` hinh dang: chan Quy CHI tren phieu Run-first `DRIVER_CASH` da duyet', () => {
    expect(code).toContain(
      [
        'ALTER TABLE "TransportFuelEntry"',
        `  ADD CONSTRAINT "${FUEL_ENTRY_DRIVER_FUND_LEG_SHAPE}"`,
        '  CHECK (',
        '    "driverFundEntryId" IS NULL',
        `    OR ("tripId" IS NULL AND "paymentMethod" = 'DRIVER_CASH' AND "verificationStatus" = 'VERIFIED')`,
        '  );',
      ].join('\n'),
    );
  });

  /**
   * Trigger doi CHINH khoa `fuel:<id>` — cung chuoi ma `fuelCostCorrelationKey` sinh ra. Doi dinh dang
   * khoa o TypeScript ma quen trigger se lam MOI lan gan chan Quy bi CSDL tu choi.
   */
  it('trigger doi dung hinh dang but toan, va khoa khop `fuelCostCorrelationKey`', () => {
    expect(code).toContain('CREATE TRIGGER "transport_fuel_entry_driver_fund_leg"');
    expect(code).toContain(`'${FUEL_ENTRY_DRIVER_FUND_LEG}: but toan %`);
    for (const condition of [
      `fund."kind" <> 'RUN_EXPENSE'`,
      'fund."signedAmount" <> -NEW."amount"',
      'fund."currencyCode" IS DISTINCT FROM NEW."currencyCode"',
      'fund."businessDate" <> NEW."businessDate"',
      'fund."driverId" <> NEW."driverId"',
      'fund."runId" IS DISTINCT FROM NEW."runId"',
      'fund."legId" IS DISTINCT FROM NEW."legId"',
    ]) {
      expect(code, condition).toContain(condition);
    }
    expect(code).toContain(`fund."correlationKey" <> 'fuel:' || NEW."id"`);
    expect(fuelCostCorrelationKey('phieu-1')).toBe('fuel:phieu-1');
    // Trigger chay ca khi mot cot ma but toan PHU THUOC bi doi — khong chi luc gan.
    expect(code).toContain(
      'BEFORE INSERT OR UPDATE OF "driverFundEntryId", "amount", "currencyCode", "businessDate",\n    "driverId", "runId", "legId" ON "TransportFuelEntry"',
    );
  });
});

describe('#369 R-4 — migration chi cham so Quy va phieu dau, co duong lui', () => {
  it('moi `ALTER TABLE` / `CREATE INDEX` / trigger chi nham `TransportDriverFund*` / `TransportFuel*`', () => {
    const targets = [
      ...code.matchAll(/ALTER TABLE "([^"]+)"/g),
      ...code.matchAll(/CREATE (?:UNIQUE )?INDEX "[^"]+" ON "([^"]+)"/g),
      ...code.matchAll(/CREATE TABLE "([^"]+)"/g),
      ...code.matchAll(/ON "([^"]+)"\s+FOR EACH ROW/g),
    ].map((match) => match[1]);

    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) expect(target).toMatch(/^Transport(DriverFund|Fuel)/);
  });

  it('KHONG backfill, KHONG viet lai hang cu, DROP chi o hai rang buoc co chu dich', () => {
    expect(code).not.toMatch(/^\s*UPDATE\s/m);
    expect(code).not.toMatch(/^\s*INSERT\s/m);
    expect(code).not.toMatch(/^\s*DELETE\s/m);
    expect([...code.matchAll(/DROP\s+(\w+)\s+"?([^"\s;]+)/g)].map((match) => match[2])).toEqual([
      'TransportDriverFundEntry_sign_by_kind',
      FUEL_ENTRY_DRIVER_CASH_NEEDS_TRIP,
    ]);
    expect(code).not.toMatch(/ALTER COLUMN "[^"]+" (?:SET DATA )?TYPE/);
    expect(code).not.toContain('CREATE EXTENSION');
  });

  it('duong lui go moi doi tuong, tra `CHECK` cua `#364`, va CHET chu khong xoa tien that', () => {
    for (const fragment of [
      'DROP TRIGGER IF EXISTS "transport_fuel_entry_driver_fund_leg"',
      `DROP CONSTRAINT IF EXISTS "${FUEL_ENTRY_DRIVER_FUND_LEG_SHAPE}"`,
      'DROP COLUMN IF EXISTS "driverFundEntryId"',
      `ADD CONSTRAINT "${FUEL_ENTRY_DRIVER_CASH_NEEDS_TRIP}"`,
      'DROP TRIGGER IF EXISTS "transport_driver_fund_entry_run_context"',
      'DROP CONSTRAINT IF EXISTS "TransportDriverFundEntry_run_expense_shape"',
      'DROP CONSTRAINT IF EXISTS "TransportDriverFundEntry_leg_needs_run"',
      'DROP CONSTRAINT IF EXISTS "TransportDriverFundEntry_one_context_kind"',
      'DROP COLUMN IF EXISTS "legId"',
      'DROP COLUMN IF EXISTS "runId"',
      '20260923110000_transport_fuel_run_first_driver_cash',
      '20260923100000_transport_driver_fund_run_expense_kind',
    ]) {
      expect(rollback, fragment).toContain(fragment);
    }
    // Thu hep `sign_by_kind` KHONG con ve `RUN_EXPENSE` — va chet neu con hang, thay vi xoa hang.
    const narrowed = rollbackCode.slice(
      rollbackCode.indexOf('ADD CONSTRAINT "TransportDriverFundEntry_sign_by_kind"'),
    );
    expect(narrowed).not.toContain('RUN_EXPENSE');
    expect(rollbackCode).not.toMatch(/DELETE FROM "TransportDriverFundEntry"/);
    expect(rollbackCode).not.toMatch(/DELETE FROM "TransportFuelEntry"/);
  });
});

describe('#369 R-4 — tang kho nhan ra loi CSDL bang ten, va khong nhan nham loi khac', () => {
  it.each([
    [isFundEntryLegRunViolation, `${FUND_ENTRY_LEG_RUN}: chang a khong thuoc vong chay b`],
    [isDriverFundLegViolation, `${FUEL_ENTRY_DRIVER_FUND_LEG}: but toan a khong phai chan Quy`],
    [
      isDriverFundLegShapeViolation,
      `new row violates check constraint "${FUEL_ENTRY_DRIVER_FUND_LEG_SHAPE}"`,
    ],
  ])('%o', (detector, message) => {
    expect(detector(new Error(message))).toBe(true);
    expect(detector(new Error('mot loi mang binh thuong'))).toBe(false);
    expect(detector(null)).toBe(false);
  });

  it('loi cua TANG KHO khi gan chan Quy vao phieu khong du dieu kien MO DAU bang ten `CHECK`', () => {
    const error = driverFundLegOnIneligibleEntry('phieu-1');
    expect(error.message).toMatch(
      new RegExp(`^${FUEL_ENTRY_DRIVER_FUND_LEG_SHAPE}: phieu phieu-1 `),
    );
    expect(isDriverFundLegShapeViolation(error)).toBe(true);
  });
});
