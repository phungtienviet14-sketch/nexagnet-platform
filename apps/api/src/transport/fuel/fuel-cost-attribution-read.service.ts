import { Injectable } from '@nestjs/common';
import { TRANSPORT_CURRENCY } from '../money.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  attributedTotal,
  type FuelCostAttribution,
  type FuelCostAttributionLine,
  type FuelEntryCostAttributionView,
  type FuelRunCostAttributionReport,
} from './fuel-cost-attribution.js';
import { FuelCostAttributionRepository } from './fuel-cost-attribution.repository.js';
import { FuelRunContextFacts } from './fuel-run-context.port.js';
import { TransportFuelCoreFacts } from './fuel.ports.js';
import { FuelRepository } from './fuel.repository.js';

/**
 * PHAN BO GIA THANH NHIEN LIEU — duong DOC, `#364`. Khong mot loi goi ghi nao trong ca tep.
 *
 * Hai cau hoi, hai ham:
 *
 *   · `viewForEntry`  "tien cua PHIEU NAY dang nam o dau"  — cho man duyet phieu cua ke toan;
 *   · `reportForRun`  "VONG CHAY NAY nhan bao nhieu tien dau" — bao cao Run/Leg (`#364` test 26).
 *
 * Moi con so o day la PHEP CONG tren chinh cac dong cua bang phan bo, lam o may chu. Man hinh chi
 * ve — hai ban sao cua mot phep tinh tien som muon lech nhau.
 */
@Injectable()
export class FuelCostAttributionReadService {
  constructor(
    private readonly entries: FuelRepository,
    private readonly attributions: FuelCostAttributionRepository,
    private readonly runs: FuelRunContextFacts,
    private readonly core: TransportFuelCoreFacts,
  ) {}

  /**
   * PHAN BO CUA MOT PHIEU.
   *
   * Phieu CHUYEN v1: so cai cua no la `TX-03` — o day chi noi chuyen nao nhan va dong gia thanh
   * nao da ghi; `attributedAmount` la `null` vi con so THAT (ke ca lan dao o `TX-03`) thuoc bao cao
   * gia thanh chuyen, va chep no sang day la mot nguon su that thu hai.
   */
  async viewForEntry(entryId: string): Promise<FuelEntryCostAttributionView> {
    const entry = await this.entries.findEntry(entryId);
    if (!entry) {
      throw TransportDomainError.notFound(
        'FUEL_ENTRY_NOT_FOUND',
        `Khong tim thay phieu ${entryId}`,
      );
    }

    const rows = await this.attributions.listForEntry(entry.id);
    const runIds = [...rows.map((row) => row.runId), ...(entry.runId ? [entry.runId] : [])];
    const legIds = [
      ...rows.map((row) => row.legId).filter((id): id is string => id !== null),
      ...(entry.legId ? [entry.legId] : []),
    ];
    const [runs, legs, trip] = await Promise.all([
      this.runs.listRunsByIds(runIds),
      this.runs.listLegsByIds(legIds),
      entry.tripId === null ? Promise.resolve(null) : this.core.findTrip(entry.tripId),
    ]);
    const runCode = new Map(runs.map((run) => [run.id, run.code]));
    const legSequence = new Map(legs.map((leg) => [leg.id, leg.sequence]));

    const legacy = entry.tripId !== null;
    const attributed = legacy ? null : attributedTotal(rows);

    return {
      fuelEntryId: entry.id,
      amount: entry.amount,
      currencyCode: entry.currencyCode,
      verificationStatus: entry.verificationStatus,
      businessDate: entry.businessDate,
      vehicleId: entry.vehicleId,
      ledger: legacy ? 'LEGACY_TRIP_EXPENSE' : 'FUEL_COST_ATTRIBUTION',
      legacyTrip:
        entry.tripId === null
          ? null
          : {
              tripId: entry.tripId,
              tripCode: trip?.code ?? null,
              projectedExpenseId: entry.costExpenseId,
            },
      context: {
        runId: entry.runId,
        runCode: entry.runId === null ? null : (runCode.get(entry.runId) ?? null),
        legId: entry.legId,
        legSequence: entry.legId === null ? null : (legSequence.get(entry.legId) ?? null),
      },
      attributedAmount: attributed,
      unattributedAmount: attributed === null ? null : entry.amount - attributed,
      lines: toLines(rows, runCode, legSequence),
    };
  }

  /**
   * BAO CAO NHIEN LIEU CUA MOT VONG CHAY — cong cac dong DANG HIEU LUC co dich trong vong chay nay.
   *
   * Dong dich `LEG` cong vao ca CHANG lan VONG CHAY (chang thuoc vong chay). Mot cap phat da bi dao
   * cong `+x` roi `-x`, tuc bang 0 — khong ai phai nho loai tru no.
   */
  async reportForRun(runId: string): Promise<FuelRunCostAttributionReport> {
    const run = await this.runs.findRun(runId);
    if (!run) {
      throw TransportDomainError.notFound('RUN_NOT_FOUND', `Khong tim thay vong chay ${runId}`);
    }

    const [rows, legs] = await Promise.all([
      this.attributions.listForRun(run.id),
      this.runs.listLegs(run.id),
    ]);
    const sequenceOf = new Map(legs.map((leg) => [leg.id, leg.sequence]));

    const byLeg = new Map<string, number>();
    const byEntry = new Map<string, number>();
    let runLevelAmount = 0;
    for (const row of rows) {
      byEntry.set(row.fuelEntryId, (byEntry.get(row.fuelEntryId) ?? 0) + row.signedAmount);
      if (row.legId === null) runLevelAmount += row.signedAmount;
      else byLeg.set(row.legId, (byLeg.get(row.legId) ?? 0) + row.signedAmount);
    }

    const entryIds = [...byEntry.keys()].sort();
    const entries = await Promise.all(entryIds.map((id) => this.entries.findEntry(id)));
    const businessDateOf = new Map(
      entries
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .map((entry) => [entry.id, entry.businessDate]),
    );

    return {
      runId: run.id,
      runCode: run.code,
      vehicleId: run.vehicleId,
      currencyCode: TRANSPORT_CURRENCY,
      totalAmount: attributedTotal(rows),
      runLevelAmount,
      legs: [...byLeg.entries()]
        .map(([legId, amount]) => ({ legId, sequence: sequenceOf.get(legId) ?? null, amount }))
        .sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0)),
      entries: entryIds.map((fuelEntryId) => ({
        fuelEntryId,
        businessDate: businessDateOf.get(fuelEntryId) ?? null,
        amount: byEntry.get(fuelEntryId) ?? 0,
      })),
      legacyTripExpenseIncluded: false,
    };
  }
}

/** Dong -> dong doc duoc, kem MA vong chay, SO THU TU chang, va dong DAO no (neu co). */
function toLines(
  rows: readonly FuelCostAttribution[],
  runCode: ReadonlyMap<string, string>,
  legSequence: ReadonlyMap<string, number>,
): FuelCostAttributionLine[] {
  const reversedBy = new Map(
    rows
      .filter((row) => row.reversalOfId !== null)
      .map((row) => [row.reversalOfId as string, row.id]),
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    targetKind: row.targetKind,
    runId: row.runId,
    runCode: runCode.get(row.runId) ?? null,
    legId: row.legId,
    legSequence: row.legId === null ? null : (legSequence.get(row.legId) ?? null),
    signedAmount: row.signedAmount,
    reversalOfId: row.reversalOfId,
    reversedById: reversedBy.get(row.id) ?? null,
    note: row.note,
    recordedBy: row.recordedBy,
    createdAt: row.createdAt,
  }));
}
