import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MONEY_MAX_AMOUNT,
  MONEY_MIN_AMOUNT,
  MoneyError,
  fromStoredAmount,
  money,
  toStoredAmount,
} from './money.js';
import {
  ACTIVE_TRIP_ASSIGNMENT,
  ACTIVE_VEHICLE_ASSIGNMENT,
  isActiveAssignmentConflict,
} from './storage-conflict.js';
import { createVehicleSchema, planTripSchema } from './transport.schemas.js';

/**
 * HOP DONG LUU TRU cua mien van tai — T2.1 (Issue #79).
 *
 * Bo test nay giu mot thu ma khong tang le nao giu duoc: SU KHOP NHAU giua bon tang.
 *
 *     HTTP (zod)  ->  mien (`money()`)  ->  kho (Prisma)  ->  Postgres (kieu cot + CHECK)
 *
 * Truoc T2.1 bon tang do KHONG khop: zod va `money()` nhan toi `2^53-1`, con cot la `INTEGER` nen
 * dung o `2^31-1`. Hau qua khong phai "mot bai test do" ma la mot LOAI loi: co mot khoang gia tri
 * duoc CA HAI cua kiem cho qua roi chet o cau lenh `INSERT` — nguoi dung nhap dung dinh dang va
 * nhan ve 500.
 *
 * Cach chung minh o day CO Y khong dung DB: bai test DOC CHINH TEP SQL cua migration va doi chieu
 * con so trong `CHECK` voi hang so TypeScript. Nho vay lech se lo ra o job `verify` (khong co
 * Postgres, chay tren moi PR) chu khong doi toi job `integration`. Bang chung tren Postgres THAT
 * nam o `transport-repository.int.spec.ts`; hai bo bo tro nhau, khong thay the nhau.
 */

const migrationDir = (file: string): string =>
  fileURLToPath(
    new URL(
      `../../prisma/migrations/20260830090000_transport_storage_invariants/${file}`,
      import.meta.url,
    ),
  );

const migrationSql = readFileSync(migrationDir('migration.sql'), 'utf8');
const rollbackSql = readFileSync(migrationDir('README-rollback.sql'), 'utf8');

/**
 * Khoang cua `INTEGER` PostgreSQL — CO DAU. Duong lui `BIGINT -> INTEGER` bi bo boi khoang nay.
 */
const PG_INT32_MIN = -2_147_483_648;
const PG_INT32_MAX = 2_147_483_647;

describe('Hop dong khoang tien — bon tang cung MOT khoang (T2.1/F1)', () => {
  it('bien cua mien DUNG BANG khoang nguyen an toan cua JavaScript', () => {
    expect(MONEY_MAX_AMOUNT).toBe(Number.MAX_SAFE_INTEGER);
    expect(MONEY_MIN_AMOUNT).toBe(-Number.MAX_SAFE_INTEGER);
  });

  it('gia tri BIEN duoc chap nhan; gia tri KE TIEP bi tu choi', () => {
    expect(money(MONEY_MAX_AMOUNT).amount).toBe(MONEY_MAX_AMOUNT);
    expect(money(MONEY_MIN_AMOUNT).amount).toBe(MONEY_MIN_AMOUNT);
    expect(() => money(MONEY_MAX_AMOUNT + 1)).toThrow(MoneyError);
    expect(() => money(MONEY_MIN_AMOUNT - 1)).toThrow(MoneyError);
  });

  it('bien gioi HTTP nhan dung nhung gi mien nhan — khong rong hon', () => {
    const base = {
      code: 'CH-1',
      kind: 'OWN_DIRECT' as const,
      originLabel: 'Ha Noi',
      destinationLabel: 'Thai Nguyen',
    };

    // Gia tri tung LOT qua HTTP roi chet o DB vi `INTEGER` tran — nay van qua HTTP, va nay DB
    // cung nhan that (cot la `BIGINT`).
    expect(planTripSchema.safeParse({ ...base, freightAmount: 3_000_000_000 }).success).toBe(true);
    expect(planTripSchema.safeParse({ ...base, freightAmount: MONEY_MAX_AMOUNT }).success).toBe(
      true,
    );

    // Ngoai bien: HTTP tu choi TRUOC, nen khong bao gio den luot kho.
    expect(planTripSchema.safeParse({ ...base, freightAmount: MONEY_MAX_AMOUNT + 1 }).success).toBe(
      false,
    );
    expect(planTripSchema.safeParse({ ...base, freightAmount: 1.5 }).success).toBe(false);
    expect(planTripSchema.safeParse({ ...base, freightAmount: Number.NaN }).success).toBe(false);
    expect(
      planTripSchema.safeParse({ ...base, freightAmount: Number.POSITIVE_INFINITY }).success,
    ).toBe(false);
    expect(planTripSchema.safeParse({ ...base, freightAmount: -1 }).success).toBe(false);
  });

  it('CHECK trong migration mang DUNG con so cua hang so TypeScript', () => {
    // Neu ai do noi bien o mot tang ma quen tang kia, dong nay do — do la toan bo ly do no ton tai.
    expect(migrationSql).toContain(`BETWEEN ${MONEY_MIN_AMOUNT} AND ${MONEY_MAX_AMOUNT}`);
    expect(migrationSql).toContain('"TransportTrip_freightAmount_money_range"');
    expect(migrationSql).toContain('ALTER COLUMN "freightAmount" TYPE BIGINT');
  });

  it('bien gioi luu tru doi qua lai khong mat gia tri, ke ca o BIEN', () => {
    for (const amount of [0, 1, 1_150_000, 3_000_000_000, MONEY_MAX_AMOUNT, MONEY_MIN_AMOUNT]) {
      expect(fromStoredAmount(toStoredAmount(amount))).toBe(amount);
    }
    expect(toStoredAmount(null)).toBeNull();
    expect(fromStoredAmount(null)).toBeNull();
  });

  it('so thuc bi chan o bien gioi luu tru bang MoneyError, khong phai RangeError cua BigInt', () => {
    // Khac biet nay quan trong: `RangeError` khong mang ten mien nen tang tren khong doi duoc no
    // thanh `MONEY_INVALID`/400 — no se ra ngoai thanh 500.
    expect(() => toStoredAmount(1.5)).toThrow(MoneyError);
    expect(() => toStoredAmount(Number.NaN)).toThrow(MoneyError);
  });

  it('hang DB vuot bien bi tu choi luc DOC, khong lang le mat chinh xac', () => {
    const beyond = BigInt(MONEY_MAX_AMOUNT) + 1n;
    expect(() => fromStoredAmount(beyond)).toThrow(MoneyError);
    expect(() => fromStoredAmount(-beyond)).toThrow(MoneyError);
  });
});

describe('So DEM van la INTEGER, va bien gioi HTTP biet dieu do (T2.1/F1)', () => {
  it('tu choi so vuot INTEGER cho km/kg/odo — 400 chu khong phai 500 o INSERT', () => {
    const base = {
      code: 'CH-2',
      kind: 'OWN_DIRECT' as const,
      originLabel: 'A',
      destinationLabel: 'B',
    };

    expect(planTripSchema.safeParse({ ...base, distanceKm: PG_INT32_MAX }).success).toBe(true);
    expect(planTripSchema.safeParse({ ...base, distanceKm: PG_INT32_MAX + 1 }).success).toBe(false);

    const vehicle = { registrationPlate: '29A-00001', vehicleClass: 'Xe tai' };
    expect(createVehicleSchema.safeParse({ ...vehicle, currentOdoKm: PG_INT32_MAX }).success).toBe(
      true,
    );
    expect(
      createVehicleSchema.safeParse({ ...vehicle, currentOdoKm: PG_INT32_MAX + 1 }).success,
    ).toBe(false);
    expect(
      createVehicleSchema.safeParse({ ...vehicle, allowedPayloadKg: PG_INT32_MAX + 1 }).success,
    ).toBe(false);
  });
});

describe('Bat bien MOT ban phan cong dang hieu luc song o DB (T2.1/F2)', () => {
  it('migration tao unique MOT PHAN, va ten index khop hang so ma kho dung de dich loi', () => {
    // Ten index la mot HOP DONG giua SQL va TypeScript: `storage-conflict.ts` doi chieu ten nay de
    // biet mot `P2002` la va cham phan cong hay la trung ma chuyen. Lech ten thi loi bi dich sai,
    // va nguoi dung nhan mot cau tra loi khong lien quan.
    expect(migrationSql).toContain(`CREATE UNIQUE INDEX "${ACTIVE_TRIP_ASSIGNMENT.indexName}"`);
    expect(migrationSql).toContain(`CREATE UNIQUE INDEX "${ACTIVE_VEHICLE_ASSIGNMENT.indexName}"`);

    // Cot khoa cung la mot phan cua hop dong: no la thu `isActiveAssignmentConflict()` doi chieu
    // khi Prisma bao ten TRUONG thay vi ten index — duong that su xay ra tren Postgres.
    expect(migrationSql).toContain(`("${ACTIVE_TRIP_ASSIGNMENT.column}")`);
    expect(migrationSql).toContain(`("${ACTIVE_VEHICLE_ASSIGNMENT.column}")`);

    // Menh de mot phan la thu bien "dang hieu luc" thanh khoa duy nhat — thieu no thi unique nay
    // cam luon ca lich su, tuc cam dung cai `GD-06` bat phai giu.
    const partialClauses = migrationSql.match(/WHERE "effectiveTo" IS NULL/g) ?? [];
    expect(partialClauses).toHaveLength(2);
  });
});

describe('Ngay-chi-co-ngay: giu chuoi, siet bang CHECK (T2.1/F3)', () => {
  it('migration rang buoc CA HAI cot ngay ve dang YYYY-MM-DD', () => {
    expect(migrationSql).toContain('"TransportTrip_businessDate_iso"');
    expect(migrationSql).toContain('"TransportDriver_licenceExpiry_iso"');
  });

  it('KHONG doi sang kieu ngay/thoi gian nao — do la ca noi dung cua quyet dinh F3', () => {
    // `INV-25` cam suy nguoc ngay tu mot khoanh khac. Doi cot sang `DATE` se dua mot doi tuong
    // `Date` tro lai tang ung dung va lam phep suy nguoc do KHA THI tro lai. Dong nay khoa quyet
    // dinh do lai o dang may doc duoc.
    expect(migrationSql).not.toMatch(/ALTER COLUMN "(businessDate|licenceExpiry)" TYPE/);
  });
});

describe('Nhan dien va cham ghi (T2.1/F2)', () => {
  /** Dung hinh dang loi cua Prisma, khong dung lop that: tang nay CO Y khong phu thuoc ban sinh. */
  const prismaError = (code: string, meta: unknown, message = 'Unique constraint failed'): unknown =>
    Object.assign(new Error(message), { code, meta });

  it('nhan ra dang THAT SU xay ra tren Postgres: Prisma doi ten index thanh ten TRUONG', () => {
    // Do duoc o CI 29/08/2026: Postgres bao `..._activeTrip_key`, Prisma mo ra thanh
    // `{ modelName: 'TransportTripAssignment', target: ['tripId'] }`. Ten index BIEN MAT.
    const real = prismaError(
      'P2002',
      { modelName: 'TransportTripAssignment', target: ['tripId'] },
      'Unique constraint failed on the fields: (`tripId`)',
    );
    expect(isActiveAssignmentConflict(real, ACTIVE_TRIP_ASSIGNMENT)).toBe(true);

    const realVehicle = prismaError(
      'P2002',
      { modelName: 'TransportVehicleAssignment', target: ['vehicleId'] },
      'Unique constraint failed on the fields: (`vehicleId`)',
    );
    expect(isActiveAssignmentConflict(realVehicle, ACTIVE_VEHICLE_ASSIGNMENT)).toBe(true);
  });

  it('van nhan ra dang co TEN INDEX, cho ban/driver nao bao kieu do', () => {
    const shapes: unknown[] = [
      prismaError('P2002', { target: [ACTIVE_TRIP_ASSIGNMENT.indexName] }),
      prismaError('P2002', { target: ACTIVE_TRIP_ASSIGNMENT.indexName }),
      prismaError('P2002', { constraint: ACTIVE_TRIP_ASSIGNMENT.indexName }),
      prismaError(
        'P2002',
        {},
        `duplicate key value violates unique constraint "${ACTIVE_TRIP_ASSIGNMENT.indexName}"`,
      ),
    ];
    for (const shape of shapes) {
      expect(isActiveAssignmentConflict(shape, ACTIVE_TRIP_ASSIGNMENT)).toBe(true);
    }
  });

  it('KHONG nham va cham KHOA CHINH thanh va cham phan cong', () => {
    // `'id'` la chuoi con cua `'tripId'`. Neu phep doi chieu chay tren mot chuoi hoa thay vi tren
    // tung phan tu, dong nay se xanh sai — va mot va cham `id` se duoc bao cho nguoi dung thanh
    // "co nguoi vua phan cong truoc ban".
    const pkClash = prismaError(
      'P2002',
      { modelName: 'TransportTripAssignment', target: ['id'] },
      'Unique constraint failed on the fields: (`id`)',
    );
    expect(isActiveAssignmentConflict(pkClash, ACTIVE_TRIP_ASSIGNMENT)).toBe(false);
  });

  it('KHONG nhan nham unique cua bang khac, du trung ten cot', () => {
    const otherModel = prismaError('P2002', {
      modelName: 'TransportTrip',
      target: ['code'],
    });
    expect(isActiveAssignmentConflict(otherModel, ACTIVE_TRIP_ASSIGNMENT)).toBe(false);

    // Hai index cua hai bang khong duoc lan sang nhau.
    const vehicleClash = prismaError('P2002', {
      modelName: 'TransportVehicleAssignment',
      target: ['vehicleId'],
    });
    expect(isActiveAssignmentConflict(vehicleClash, ACTIVE_TRIP_ASSIGNMENT)).toBe(false);
    expect(isActiveAssignmentConflict(vehicleClash, ACTIVE_VEHICLE_ASSIGNMENT)).toBe(true);
  });

  it('bo qua moi loi khong phai vi pham unique', () => {
    const notUnique = prismaError('P2025', {
      modelName: 'TransportTripAssignment',
      target: ['tripId'],
    });
    expect(isActiveAssignmentConflict(notUnique, ACTIVE_TRIP_ASSIGNMENT)).toBe(false);
    expect(isActiveAssignmentConflict(new Error('mat ket noi'), ACTIVE_TRIP_ASSIGNMENT)).toBe(false);
    expect(isActiveAssignmentConflict(null, ACTIVE_TRIP_ASSIGNMENT)).toBe(false);
    expect(isActiveAssignmentConflict(undefined, ACTIVE_TRIP_ASSIGNMENT)).toBe(false);
  });
});

describe('Duong lui phai kiem CA HAI phia cua khoang INTEGER (T2.1R/R2)', () => {
  /*
   * Vi sao bai nay ton tai: precheck dau tien cua `README-rollback.sql` chi hoi
   * `WHERE "freightAmount" > 2147483647`. Nhung khoang tien cua mien la +-(2^53-1) — CO PHIA AM —
   * nen mot hang `-3.000.000.000` di lot qua precheck do roi lam chinh buoc `ALTER` phia sau chet.
   * Precheck bo sot dung nua so hang chan duong lui, va chi lo ra giua luc su co.
   *
   * Do tren PostgreSQL 16.15 (30/08/2026) voi bang co ca hang duong lan hang am vuot `INTEGER`:
   *   precheck cu  -> dem duoc 1 hang   (bo sot hang am)
   *   precheck moi -> dem duoc 2 hang   (dung)
   *   `ALTER ... TYPE INTEGER` -> `ERROR: integer out of range`, bang GIU NGUYEN ca 4 hang
   * Tuc Postgres KHONG im lang cat bot; precheck la de NHIN THAY rui ro truoc, khong phai de chan
   * mot phep cat bot lang le.
   */
  it('precheck bo CA khoang `INTEGER` co dau, khong chi bien duong', () => {
    expect(rollbackSql).toContain(`NOT BETWEEN ${PG_INT32_MIN} AND ${PG_INT32_MAX}`);
  });

  it('KHONG con phep so sanh mot phia — do dung la loi da bi review bat', () => {
    // `> 2147483647` don doc la hinh dang cu. Neu no quay lai, dong nay do.
    expect(rollbackSql).not.toMatch(/"freightAmount"\s*>\s*2147483647/);
  });

  it('duong lui van dao nguoc DU ca nam doi tuong DB', () => {
    for (const name of [
      ACTIVE_TRIP_ASSIGNMENT.indexName,
      ACTIVE_VEHICLE_ASSIGNMENT.indexName,
      'TransportTrip_freightAmount_money_range',
      'TransportTrip_businessDate_iso',
      'TransportDriver_licenceExpiry_iso',
    ]) {
      expect(rollbackSql).toContain(`"${name}"`);
    }
    expect(rollbackSql).toContain('ALTER COLUMN "freightAmount" TYPE INTEGER');
  });
});

describe('NAM doi tuong DB, khong phai bon (T2.1R/R3)', () => {
  /*
   * Con so nay tung bi dem sai thanh "bon" trong bao cao, schema va hop dong mien — vi hai `CHECK`
   * ngay bi gop lam mot dong. Dem tu chinh tep SQL thi khong ai dem nham duoc nua.
   */
  it('migration khai dung 2 unique MOT PHAN va 3 rang buoc CHECK', () => {
    const partialUniques = migrationSql.match(/CREATE UNIQUE INDEX/g) ?? [];
    const checks = migrationSql.match(/ADD CONSTRAINT "[^"]+"\s+CHECK/g) ?? [];

    expect(partialUniques).toHaveLength(2);
    expect(checks).toHaveLength(3);
    expect(partialUniques.length + checks.length).toBe(5);
  });
});
