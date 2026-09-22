import { beforeEach, describe, expect, it } from 'vitest';
import { TransportDomainError } from '../transport.errors.js';
import {
  LEGACY_TRIP,
  VEHICLE_A,
  buildRunFirstWorld,
  runFirstCommand,
  type RunFirstWorld,
} from './__tests__/run-first-harness.js';
import { evaluateFuelCostAllocation } from './fuel-cost-attribution.js';
import { recordFuelCostAttributionSchema } from './fuel.schemas.js';
import type { FuelEntry } from './fuel.types.js';

/**
 * `#364` §3 — PHAN BO GIA THANH la mot LOP RIENG, do tren kho trong bo nho qua DICH VU that.
 *
 * Tep nay chung minh LUAT (tu choi co ma, phat lai, dao giu lich su, mot phieu mot so cai, khong
 * cham su that cua phieu / `TX-03` / Quy lai xe). Hai lan cap phat dong thoi tren Postgres THAT — cho
 * duy nhat chung minh duoc "khong the cung vuot" — nam o `transport-fuel-run-first.int.spec.ts`.
 */

let world: RunFirstWorld;
let native: FuelEntry;

const attribute = (
  target: { kind: 'RUN'; runId: string } | { kind: 'LEG'; legId: string },
  amount: number,
  correlationKey: string,
  entryId: string = native.id,
) =>
  world.attribution.attribute(
    entryId,
    { target, amount, note: 'ke toan phan bo', correlationKey },
    'ke-toan',
  );

const reasonOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TransportDomainError) return `${error.kind}:${error.reason}`;
    throw error;
  }
  throw new Error('lenh le ra phai bi tu choi');
};

beforeEach(async () => {
  world = await buildRunFirstWorld();
  const submitted = await world.fuel.submitFuelEntry(
    runFirstCommand(world, { amount: 2_100_000, legId: world.loadedLeg.id }),
    'lx.binh',
  );
  native = await world.fuel.verifyFuelEntry(submitted.id, 'ke-toan');
});

describe('#364 test 19/20 — phieu TON TAI truoc phan bo; phan bo khong doi su that cua phieu', () => {
  it('phieu Run-first da duyet: so cai la bang phan bo, CHUA phan bo dong nao', async () => {
    const view = await world.attributionRead.viewForEntry(native.id);

    expect(view).toMatchObject({
      fuelEntryId: native.id,
      amount: 2_100_000,
      ledger: 'FUEL_COST_ATTRIBUTION',
      legacyTrip: null,
      attributedAmount: 0,
      unattributedAmount: 2_100_000,
      lines: [],
      // Ngu canh chi la GOI Y: co vong chay + chang, nhung khong mot dong nao tu dong sinh ra.
      context: {
        runId: world.run.id,
        runCode: 'RUN-364-A',
        legId: world.loadedLeg.id,
        legSequence: 2,
      },
    });
  });

  it('cap phat mot phan vao VONG CHAY — phieu, `TX-03` va Quy lai xe KHONG doi', async () => {
    const before = await world.fuelRepo.findEntry(native.id);
    const view = await attribute({ kind: 'RUN', runId: world.run.id }, 1_500_000, 'phan-bo-364-1');

    expect(view).toMatchObject({ attributedAmount: 1_500_000, unattributedAmount: 600_000 });
    expect(view.lines).toEqual([
      expect.objectContaining({
        kind: 'ALLOCATION',
        targetKind: 'RUN',
        runId: world.run.id,
        runCode: 'RUN-364-A',
        legId: null,
        signedAmount: 1_500_000,
        reversedById: null,
        recordedBy: 'ke-toan',
      }),
    ]);
    expect(await world.fuelRepo.findEntry(native.id)).toEqual(before);
    expect(world.costing.commands).toHaveLength(0);
  });

  it('cap phat vao CHANG: may chu doi chang -> vong chay cua chinh no', async () => {
    const view = await attribute(
      { kind: 'LEG', legId: world.emptyLeg.id },
      700_000,
      'phan-bo-364-2',
    );
    expect(view.lines[0]).toMatchObject({
      targetKind: 'LEG',
      runId: world.run.id,
      legId: world.emptyLeg.id,
      legSequence: 1,
    });
  });
});

describe('#364 §3.1 — tong phan bo DANG HIEU LUC khong vuot so tien phieu', () => {
  it('cap phat vuot phan con lai -> tu choi co ma, khong ghi gi', async () => {
    await attribute({ kind: 'RUN', runId: world.run.id }, 2_000_000, 'phan-bo-364-3');
    expect(
      await reasonOf(
        attribute({ kind: 'LEG', legId: world.loadedLeg.id }, 100_001, 'phan-bo-364-4'),
      ),
    ).toBe('DENIED:FUEL_COST_ATTRIBUTION_EXCEEDS_ENTRY');
    expect((await world.attributionRead.viewForEntry(native.id)).attributedAmount).toBe(2_000_000);
  });

  it('dung bang so tien phieu la hop le (bien dong)', async () => {
    await attribute({ kind: 'RUN', runId: world.run.id }, 2_100_000, 'phan-bo-364-5');
    const view = await world.attributionRead.viewForEntry(native.id);
    expect(view).toMatchObject({ attributedAmount: 2_100_000, unattributedAmount: 0 });
  });

  it('HAI cap phat song song khong cung vuot duoc (hang doi khoa theo phieu)', async () => {
    const outcomes = await Promise.allSettled([
      attribute({ kind: 'RUN', runId: world.run.id }, 1_200_000, 'song-song-1'),
      attribute({ kind: 'LEG', legId: world.loadedLeg.id }, 1_200_000, 'song-song-2'),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    expect(rejected && (rejected as PromiseRejectedResult).reason).toMatchObject({
      reason: 'FUEL_COST_ATTRIBUTION_EXCEEDS_ENTRY',
    });
    expect((await world.attributionRead.viewForEntry(native.id)).attributedAmount).toBe(1_200_000);
  });

  it('luat thuan: bien 0, bien so tien, va vuot mot dong', () => {
    const entry = { tripId: null, verificationStatus: 'VERIFIED' as const, amount: 1_000 };
    expect(evaluateFuelCostAllocation({ entry, attributedSoFar: 0, amount: 1_000 }).allowed).toBe(
      true,
    );
    expect(evaluateFuelCostAllocation({ entry, attributedSoFar: 1, amount: 1_000 })).toEqual({
      allowed: false,
      reason: 'FUEL_COST_ATTRIBUTION_EXCEEDS_ENTRY',
    });
    expect(evaluateFuelCostAllocation({ entry, attributedSoFar: 0, amount: 0 }).allowed).toBe(
      false,
    );
  });
});

describe('#364 §3.1 — gui lai khong sinh dong thu hai', () => {
  it('cung khoa cung noi dung -> cung mot dong', async () => {
    await attribute({ kind: 'RUN', runId: world.run.id }, 900_000, 'phan-bo-lap');
    const again = await attribute({ kind: 'RUN', runId: world.run.id }, 900_000, 'phan-bo-lap');

    expect(again.lines).toHaveLength(1);
    expect(again.attributedAmount).toBe(900_000);
  });

  it('hai lan gui SONG SONG cung khoa -> van mot dong', async () => {
    const [left, right] = await Promise.all([
      attribute({ kind: 'RUN', runId: world.run.id }, 900_000, 'phan-bo-song-song'),
      attribute({ kind: 'RUN', runId: world.run.id }, 900_000, 'phan-bo-song-song'),
    ]);
    expect(left.lines).toHaveLength(1);
    expect(right.lines).toHaveLength(1);
  });

  it('cung khoa KHAC so tien -> va cham co ten truong', async () => {
    await attribute({ kind: 'RUN', runId: world.run.id }, 900_000, 'phan-bo-dung-lai');
    await expect(
      attribute({ kind: 'RUN', runId: world.run.id }, 800_000, 'phan-bo-dung-lai'),
    ).rejects.toThrow(/amount/);
    expect(
      await reasonOf(
        attribute({ kind: 'LEG', legId: world.emptyLeg.id }, 900_000, 'phan-bo-dung-lai'),
      ),
    ).toBe('CONFLICT:FUEL_COST_ATTRIBUTION_KEY_REUSED');
  });

  it('schema BAT BUOC khoa chong ghi trung — mot lan gui lai khong khoa la mot dong thu hai', () => {
    const body = { target: { kind: 'RUN', runId: world.run.id }, amount: 1_000 };
    expect(recordFuelCostAttributionSchema.safeParse(body).success).toBe(false);
    expect(
      recordFuelCostAttributionSchema.safeParse({ ...body, correlationKey: 'khoa-du-dai' }).success,
    ).toBe(true);
    // Dich `LEG` KHONG mang `runId`: may chu tu doi, khong nhan mot su that mau thuan tu client.
    expect(
      recordFuelCostAttributionSchema.safeParse({
        target: { kind: 'LEG', legId: 'chang', runId: 'vong' },
        amount: 1_000,
        correlationKey: 'khoa-du-dai',
      }).success,
    ).toBe(false);
  });
});

describe('#364 §3.1 test 24 — sua bang DAO, lich su con nguyen', () => {
  it('dao giu dong cu, tong giam, cap phat lai duoc; dao lan hai tra lai CHINH dong dao', async () => {
    const first = await attribute({ kind: 'RUN', runId: world.run.id }, 2_100_000, 'cap-phat-sai');
    const allocationId = first.lines[0]?.id as string;

    const reversed = await world.attribution.reverse(allocationId, 'nham vong chay', 'ke-toan');
    expect(reversed).toMatchObject({ attributedAmount: 0, unattributedAmount: 2_100_000 });
    expect(reversed.lines).toEqual([
      expect.objectContaining({ id: allocationId, kind: 'ALLOCATION', signedAmount: 2_100_000 }),
      expect.objectContaining({
        kind: 'REVERSAL',
        signedAmount: -2_100_000,
        reversalOfId: allocationId,
        note: 'nham vong chay',
      }),
    ]);
    expect(reversed.lines[0]?.reversedById).toBe(reversed.lines[1]?.id);

    const again = await world.attribution.reverse(allocationId, 'bam lai', 'ke-toan');
    expect(again.lines).toHaveLength(2);

    const reallocated = await attribute(
      { kind: 'LEG', legId: world.loadedLeg.id },
      2_100_000,
      'cap-phat-dung',
    );
    expect(reallocated).toMatchObject({ attributedAmount: 2_100_000, unattributedAmount: 0 });
    expect(reallocated.lines).toHaveLength(3);
  });

  it('dao mot dong DAO -> tu choi co ma; dao mot id khong co -> 404', async () => {
    const first = await attribute({ kind: 'RUN', runId: world.run.id }, 1_000_000, 'cap-phat-a');
    const reversed = await world.attribution.reverse(
      first.lines[0]?.id as string,
      'sai',
      'ke-toan',
    );
    const reversalId = reversed.lines[1]?.id as string;

    expect(await reasonOf(world.attribution.reverse(reversalId, 'dao cua dao', 'ke-toan'))).toBe(
      'DENIED:FUEL_COST_ATTRIBUTION_NOT_REVERSIBLE',
    );
    expect(await reasonOf(world.attribution.reverse('khong-co', 'x', 'ke-toan'))).toBe(
      'NOT_FOUND:FUEL_COST_ATTRIBUTION_NOT_FOUND',
    );
  });
});

describe('#364 §3.2 test 25 — phieu chuyen v1: MOT phieu, MOT so cai', () => {
  it('phieu chuyen v1 da duyet -> khong phan bo duoc; khung nhin chi tro sang `TX-03`', async () => {
    const legacy = await world.fuel.submitFuelEntry(
      { ...runFirstCommand(world), runId: null, tripId: LEGACY_TRIP, vehicleId: VEHICLE_A },
      'ke-toan',
    );
    await world.fuel.verifyFuelEntry(legacy.id, 'ke-toan');

    expect(
      await reasonOf(
        attribute({ kind: 'RUN', runId: world.run.id }, 1_000, 'phan-bo-chuyen-cu', legacy.id),
      ),
    ).toBe('DENIED:FUEL_COST_ATTRIBUTION_LEGACY_TRIP_PROJECTED');

    const view = await world.attributionRead.viewForEntry(legacy.id);
    expect(view).toMatchObject({
      ledger: 'LEGACY_TRIP_EXPENSE',
      legacyTrip: {
        tripId: LEGACY_TRIP,
        tripCode: 'CH-CU-01',
        projectedExpenseId: `expense-of-fuel:${legacy.id}`,
      },
      // Con so THAT cua phieu chuyen v1 thuoc bao cao gia thanh chuyen — khong chep sang day.
      attributedAmount: null,
      unattributedAmount: null,
      lines: [],
    });
    // Dung MOT lenh `TX-03` — cua chinh lan duyet, khong them lan nao tu lop phan bo.
    expect(world.costing.commands).toHaveLength(1);
  });
});

describe('#364 §3 — cac cong con lai cua lenh cap phat', () => {
  it('phieu CHUA duyet -> tu choi', async () => {
    const declared = await world.fuel.submitFuelEntry(runFirstCommand(world), 'lx.binh');
    expect(
      await reasonOf(
        attribute({ kind: 'RUN', runId: world.run.id }, 1_000, 'chua-duyet', declared.id),
      ),
    ).toBe('DENIED:FUEL_COST_ATTRIBUTION_ENTRY_NOT_VERIFIED');
  });

  it('vong chay cua XE KHAC -> tu choi (dau xe A khong la gia thanh cua xe B)', async () => {
    expect(
      await reasonOf(attribute({ kind: 'RUN', runId: world.otherRun.id }, 1_000, 'xe-khac')),
    ).toBe('DENIED:FUEL_COST_ATTRIBUTION_TARGET_VEHICLE_MISMATCH');
    expect(
      await reasonOf(attribute({ kind: 'LEG', legId: world.otherLeg.id }, 1_000, 'chang-xe-khac')),
    ).toBe('DENIED:FUEL_COST_ATTRIBUTION_TARGET_VEHICLE_MISMATCH');
  });

  it('dich khong ton tai -> 404', async () => {
    expect(await reasonOf(attribute({ kind: 'RUN', runId: 'khong-co' }, 1_000, 'khong-co-1'))).toBe(
      'NOT_FOUND:FUEL_COST_ATTRIBUTION_TARGET_NOT_FOUND',
    );
    expect(await reasonOf(attribute({ kind: 'LEG', legId: 'khong-co' }, 1_000, 'khong-co-2'))).toBe(
      'NOT_FOUND:FUEL_COST_ATTRIBUTION_TARGET_NOT_FOUND',
    );
  });

  it('dich KHONG buoc la ngu canh: phieu khai o chang 2 duoc phan bo vao chang 1 cung xe', async () => {
    const view = await attribute(
      { kind: 'LEG', legId: world.emptyLeg.id },
      500_000,
      'khac-ngu-canh',
    );
    expect(view.context.legId).toBe(world.loadedLeg.id);
    expect(view.lines[0]?.legId).toBe(world.emptyLeg.id);
  });
});

describe('#364 test 26 — bao cao vong chay doc DUNG phan bo', () => {
  it('cong dich RUN + dich LEG, dong da dao bang 0, tach theo chang va theo phieu', async () => {
    await attribute({ kind: 'RUN', runId: world.run.id }, 600_000, 'bao-cao-1');
    await attribute({ kind: 'LEG', legId: world.emptyLeg.id }, 400_000, 'bao-cao-2');
    const withLeg = await attribute(
      { kind: 'LEG', legId: world.loadedLeg.id },
      500_000,
      'bao-cao-3',
    );
    const loadedAllocation = withLeg.lines.find((line) => line.legId === world.loadedLeg.id);
    await world.attribution.reverse(loadedAllocation?.id as string, 'chia lai', 'ke-toan');

    const report = await world.attributionRead.reportForRun(world.run.id);
    expect(report).toMatchObject({
      runId: world.run.id,
      runCode: 'RUN-364-A',
      vehicleId: VEHICLE_A,
      totalAmount: 1_000_000,
      runLevelAmount: 600_000,
      legacyTripExpenseIncluded: false,
    });
    expect(report.legs).toEqual([
      { legId: world.emptyLeg.id, sequence: 1, amount: 400_000 },
      { legId: world.loadedLeg.id, sequence: 2, amount: 0 },
    ]);
    expect(report.entries).toEqual([
      { fuelEntryId: native.id, businessDate: '2026-09-22', amount: 1_000_000 },
    ]);

    // Vong chay khong nhan phan bo nao -> tong 0, khong phai loi.
    const other = await world.attributionRead.reportForRun(world.otherRun.id);
    expect(other).toMatchObject({ totalAmount: 0, legs: [], entries: [] });
  });
});
