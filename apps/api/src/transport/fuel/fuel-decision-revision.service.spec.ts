import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { TransportDomainError } from '../transport.errors.js';
import { DEFAULT_FUEL_STATEMENT_COLUMNS, type TransportFuelPolicy } from './fuel-policy.js';
import { FuelReadService } from './fuel-read.service.js';
import { MovementFuelRunContextAdapter } from './fuel-run-context.port.js';
import { InMemoryFuelStationRepository } from './fuel-station.repository.js';
import { InMemoryMovementRepository } from '../movement/movement.repository.js';
import { FuelReconciliationService } from './fuel-reconciliation.service.js';
import { reviseDiscrepancySchema } from './fuel.schemas.js';
import { TransportFuelCoreFacts } from './fuel.ports.js';
import type { FuelDiscrepancy } from './fuel.types.js';
import { InMemoryFuelRepository } from './in-memory-fuel.repository.js';

/**
 * `#317` G0 — DOI Y SAU KHI MO LAI KY, do tren kho trong bo nho qua DICH VU that.
 *
 * Tep nay chung minh LUAT va CHUOI THAO TAC: dong ky -> mo lai -> doi `ACCEPT` thanh `IGNORE` ->
 * dong lai -> ban giao moi mang tong NHO HON; quyet dinh cu van nguyen ven; lan gui lai khong ghi
 * them; sua ban cu bi tu choi co ma. Tinh chi-ghi-them o tang CSDL, ghi dong thoi va chung tu DIEU
 * CHINH o Settlement nam o `transport-fuel-decision-revision.int.spec.ts`, tren Postgres THAT.
 */

const VEHICLE = 'xe-g0';
const ACTOR = 'ke-toan-g0';

const FUEL_POLICY: TransportFuelPolicy = {
  matching: { amountVnd: 1_000, businessDateDays: 1 },
  statement: { columns: DEFAULT_FUEL_STATEMENT_COLUMNS, dateFormat: 'iso' },
  consumption: { normsByVehicleClass: {}, tolerancePercent: 10 },
};

/** Phep doi soat khong doc `transport-core` — chi `FuelReadService` can, va chi o bai workspace. */
class NoCoreFacts extends TransportFuelCoreFacts {
  async findTrip() {
    return null;
  }
  async findTripByCode() {
    return null;
  }
  override async listTripsByIds() {
    return [];
  }
  async findVehicle() {
    return null;
  }
  async listDrivers() {
    return [];
  }
  async listVehicles() {
    return [];
  }
  async findDriver() {
    return null;
  }
  async findDriverByAuthUserId() {
    return null;
  }
  async wasDriverEverAssignedToTrip() {
    return true;
  }
  async wasVehicleEverAssignedToTrip() {
    return true;
  }
}

let repository: InMemoryFuelRepository;
let audit: InMemoryAuditLogRepository;
let reconciliation: FuelReconciliationService;
let reconciliationId: string;
let lineOrphanId: string;
let clockMs: number;

/** Dong ho TANG DAN: moi lan doc tien mot giay, de `resolvedAt` cua hai quyet dinh khac nhau. */
const clock = (): Date => {
  clockMs += 1_000;
  return new Date(clockMs);
};

async function createVerifiedEntry(key: string, amount: number, businessDate: string) {
  const entry = await repository.createEntry({
    tripId: 'chuyen-g0',
    runId: null,
    legId: null,
    vehicleId: VEHICLE,
    driverId: 'lai-xe-g0',
    supplierId: 'cay-xang-g0',
    businessDate,
    stationId: null,
    occurredAt: new Date(`${businessDate}T01:00:00Z`),
    litersUnits: 100_000,
    amount,
    odometerKm: 1_000,
    previousOdometerKm: null,
    consumptionUnits: null,
    reviewReasons: [],
    paymentMethod: 'SUPPLIER_ACCOUNT',
    sourceStatementId: null,
    correlationKey: `g0-${key}`,
    invoiceNo: null,
    note: null,
    declaredBy: ACTOR,
    at: new Date('2026-09-01T00:00:00Z'),
  });
  await repository.setEntryVerification(entry.id, 'DECLARED', {
    to: 'VERIFIED',
    actor: ACTOR,
    reviewNote: null,
    at: new Date('2026-09-01T00:00:00Z'),
  });
  return entry;
}

const line = (rowNumber: number, businessDate: string, amount: number) => ({
  rowNumber,
  status: 'ACCEPTED' as const,
  rejectReason: null,
  vehiclePlateRaw: '29C-000.99',
  vehicleId: VEHICLE,
  businessDate,
  litersUnits: 100_000,
  amount,
  invoiceNo: null,
  note: null,
  rawValues: {},
});

const discrepancies = () => repository.listDiscrepancies(reconciliationId);
const pendingFor = async (statementLineId: string): Promise<FuelDiscrepancy> => {
  const found = (await discrepancies()).find(
    (item) => item.status === 'PENDING' && item.statementLineId === statementLineId,
  );
  if (!found) throw new Error(`Khong co chenh lech PENDING cho dong ${statementLineId}`);
  return found;
};

async function acceptOrphanAndClose() {
  const pending = await pendingFor(lineOrphanId);
  await reconciliation.resolveDiscrepancy(
    pending.id,
    { resolution: 'ACCEPT_SUPPLIER_AMOUNT', note: 'chap nhan so cay xang' },
    ACTOR,
  );
  const closed = await reconciliation.closeReconciliation(reconciliationId, ACTOR);
  return { decision: pending, closed };
}

beforeEach(async () => {
  clockMs = Date.parse('2026-09-30T00:00:00Z');
  repository = new InMemoryFuelRepository();
  audit = new InMemoryAuditLogRepository();
  reconciliation = new FuelReconciliationService(
    repository,
    new AuditLogService(audit),
    FUEL_POLICY,
    undefined,
    clock,
  );

  await createVerifiedEntry('khop', 4_200_000, '2026-09-05');
  const created = await repository.createStatementWithReconciliation({
    supplierId: 'cay-xang-g0',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    format: 'CSV',
    sourceRef: 'g0.csv',
    sourceDigest: 'g0-digest',
    lines: [line(1, '2026-09-05', 4_200_000), line(2, '2026-09-20', 2_000_000)],
    importedBy: ACTOR,
    at: new Date('2026-09-25T00:00:00Z'),
  });
  reconciliationId = created.reconciliation.id;
  lineOrphanId = created.lines.find((item) => item.rowNumber === 2)?.id as string;

  await reconciliation.runMatching(reconciliationId, ACTOR);
});

describe('G0 — ACCEPT roi mo lai va IGNORE: tong duoc chap nhan GIAM', () => {
  it('lenh sua THEM mot quyet dinh, quyet dinh cu nguyen ven, lan dong sau phat ban giao nho hon', async () => {
    const { decision, closed } = await acceptOrphanAndClose();
    expect(closed.handoff).toMatchObject({ revision: 1, acceptedAmount: 6_200_000 });

    await reconciliation.reopenReconciliation(
      reconciliationId,
      'cay xang rut dong 20/09',
      'giam-doc',
    );
    const revised = await reconciliation.reviseDiscrepancyDecision(
      decision.id,
      { resolution: 'IGNORE_WITH_REASON', reason: 'cay xang xac nhan ghi nham' },
      ACTOR,
    );

    expect(revised.replayed).toBe(false);
    expect(revised.revision).toMatchObject({
      status: 'RESOLVED',
      resolution: 'IGNORE_WITH_REASON',
      resolutionNote: 'cay xang xac nhan ghi nham',
      resolvedBy: ACTOR,
      supersedesId: decision.id,
      statementLineId: lineOrphanId,
    });
    // Lich su KHONG bi viet lai: quyet dinh cu van mang dung noi dung luc no duoc ghi.
    const history = await discrepancies();
    expect(history.find((item) => item.id === decision.id)).toMatchObject({
      status: 'RESOLVED',
      resolution: 'ACCEPT_SUPPLIER_AMOUNT',
      supersedesId: null,
    });
    expect(
      (await repository.listStatementLines(closed.reconciliation.statementId)).find(
        (item) => item.id === lineOrphanId,
      )?.reconciliationStatus,
    ).toBe('IGNORED');

    const closedAgain = await reconciliation.closeReconciliation(reconciliationId, ACTOR);
    expect(closedAgain.handoff).toMatchObject({
      revision: 2,
      supersedesId: closed.handoff.id,
      acceptedAmount: 4_200_000,
      acceptedLineCount: 1,
    });
    expect(closedAgain.handoff.acceptedLineIds).not.toContain(lineOrphanId);

    const [entry] = await audit.list({ action: 'transport.fuel.discrepancy.revise' });
    expect(entry).toMatchObject({ actor: ACTOR, entityId: revised.revision.id });
  });

  it('GUI LAI dung lenh vua ghi -> tra lai CHINH quyet dinh do, khong them hang', async () => {
    const { decision } = await acceptOrphanAndClose();
    await reconciliation.reopenReconciliation(reconciliationId, 'mo lai', 'giam-doc');
    const command = { resolution: 'IGNORE_WITH_REASON' as const, reason: 'ghi nham' };

    const first = await reconciliation.reviseDiscrepancyDecision(decision.id, command, ACTOR);
    const retry = await reconciliation.reviseDiscrepancyDecision(decision.id, command, ACTOR);

    expect(retry.replayed).toBe(true);
    expect(retry.revision.id).toBe(first.revision.id);
    expect(await discrepancies()).toHaveLength(2);
    expect(await audit.list({ action: 'transport.fuel.discrepancy.revise' })).toHaveLength(1);
  });

  it('sua QUYET DINH CU (da bi thay the) bang noi dung khac -> DECISION_NOT_CURRENT, khong ghi gi', async () => {
    const { decision } = await acceptOrphanAndClose();
    await reconciliation.reopenReconciliation(reconciliationId, 'mo lai', 'giam-doc');
    const first = await reconciliation.reviseDiscrepancyDecision(
      decision.id,
      { resolution: 'IGNORE_WITH_REASON', reason: 'ghi nham' },
      ACTOR,
    );

    await expect(
      reconciliation.reviseDiscrepancyDecision(
        decision.id,
        { resolution: 'REJECT_SUPPLIER_LINE', reason: 'mot nguoi khac, mot y khac' },
        'ke-toan-khac',
      ),
    ).rejects.toMatchObject({ kind: 'CONFLICT', reason: 'DECISION_NOT_CURRENT' });
    expect((await discrepancies()).map((item) => item.id).sort()).toEqual(
      [decision.id, first.revision.id].sort(),
    );
  });

  it('ky DA DONG -> RECONCILIATION_FROZEN; phai mo lai (quyen rieng) truoc', async () => {
    const { decision } = await acceptOrphanAndClose();

    await expect(
      reconciliation.reviseDiscrepancyDecision(
        decision.id,
        { resolution: 'IGNORE_WITH_REASON', reason: 'thu sua khi ky dong' },
        ACTOR,
      ),
    ).rejects.toMatchObject({ reason: 'RECONCILIATION_FROZEN' });
  });

  /**
   * DUONG THU HAI den cung ket qua: mo lai -> CHAY LAI so khop -> quyet chenh lech MOI cua dong do.
   * Lan quyet nay noi chuoi vao quyet dinh cu, nen `ACCEPT` cu KHONG con keo dong vao tong.
   */
  it('chay lai so khop roi quyet chenh lech moi -> noi chuoi, tong giam y nhu lenh sua', async () => {
    const { decision } = await acceptOrphanAndClose();
    await reconciliation.reopenReconciliation(reconciliationId, 'mo lai', 'giam-doc');
    await reconciliation.runMatching(reconciliationId, ACTOR);

    const fresh = await pendingFor(lineOrphanId);
    const resolved = await reconciliation.resolveDiscrepancy(
      fresh.id,
      { resolution: 'IGNORE_WITH_REASON', note: 'bo qua sau khi mo lai' },
      ACTOR,
    );
    expect(resolved.supersedesId).toBe(decision.id);

    const closedAgain = await reconciliation.closeReconciliation(reconciliationId, ACTOR);
    expect(closedAgain.handoff).toMatchObject({ revision: 2, acceptedAmount: 4_200_000 });
  });

  it('chieu TANG van chay: IGNORE roi sua thanh ACCEPT -> tong tang, dong quay ve MISMATCHED', async () => {
    const pending = await pendingFor(lineOrphanId);
    await reconciliation.resolveDiscrepancy(
      pending.id,
      { resolution: 'IGNORE_WITH_REASON', note: 'chua ro' },
      ACTOR,
    );
    const first = await reconciliation.closeReconciliation(reconciliationId, ACTOR);
    expect(first.handoff.acceptedAmount).toBe(4_200_000);

    await reconciliation.reopenReconciliation(reconciliationId, 'cay xang gui hoa don', 'giam-doc');
    await reconciliation.reviseDiscrepancyDecision(
      pending.id,
      { resolution: 'ACCEPT_SUPPLIER_AMOUNT', reason: 'da co hoa don goc' },
      ACTOR,
    );
    const second = await reconciliation.closeReconciliation(reconciliationId, ACTOR);
    expect(second.handoff).toMatchObject({ revision: 2, acceptedAmount: 6_200_000 });
  });

  it('dong lai ma quyet dinh hieu luc khong doi tien -> phat lai ban giao, khong them ban moi', async () => {
    const { decision, closed } = await acceptOrphanAndClose();
    await reconciliation.reopenReconciliation(reconciliationId, 'mo lai', 'giam-doc');
    // REJECT va IGNORE deu khong tinh tien — doi tu cai nay sang cai kia khong doi ket qua kinh te.
    await reconciliation.reviseDiscrepancyDecision(
      decision.id,
      { resolution: 'IGNORE_WITH_REASON', reason: 'buoc 1' },
      ACTOR,
    );
    const second = await reconciliation.closeReconciliation(reconciliationId, ACTOR);
    await reconciliation.reopenReconciliation(reconciliationId, 'mo lai lan 2', 'giam-doc');
    const current = (await discrepancies()).find((item) => item.supersedesId === decision.id);
    await reconciliation.reviseDiscrepancyDecision(
      current?.id as string,
      { resolution: 'REJECT_SUPPLIER_LINE', reason: 'buoc 2' },
      ACTOR,
    );
    const third = await reconciliation.closeReconciliation(reconciliationId, ACTOR);

    expect(closed.handoff.revision).toBe(1);
    expect(second.handoff.revision).toBe(2);
    expect(third.handoff.id).toBe(second.handoff.id);
  });
});

describe('G0 — nhung duong sua bi tu choi, moi duong mot ma', () => {
  it('sua thanh CHINH quyet dinh dang co -> DECISION_REVISION_NO_CHANGE (403)', async () => {
    const { decision } = await acceptOrphanAndClose();
    await reconciliation.reopenReconciliation(reconciliationId, 'mo lai', 'giam-doc');

    const attempt = reconciliation.reviseDiscrepancyDecision(
      decision.id,
      { resolution: 'ACCEPT_SUPPLIER_AMOUNT', reason: 'khong doi gi' },
      ACTOR,
    );
    await expect(attempt).rejects.toBeInstanceOf(TransportDomainError);
    await expect(attempt).rejects.toMatchObject({
      kind: 'DENIED',
      reason: 'DECISION_REVISION_NO_CHANGE',
    });
  });

  it('chenh lech con PENDING -> DECISION_NOT_RESOLVED (409)', async () => {
    const pending = await pendingFor(lineOrphanId);
    await expect(
      reconciliation.reviseDiscrepancyDecision(
        pending.id,
        { resolution: 'IGNORE_WITH_REASON', reason: 'chua quyet ma da sua' },
        ACTOR,
      ),
    ).rejects.toMatchObject({ kind: 'CONFLICT', reason: 'DECISION_NOT_RESOLVED' });
  });

  it('quyet dinh ve mot phieu le (khong dong bang ke) -> DECISION_WITHOUT_STATEMENT_LINE', async () => {
    await createVerifiedEntry('le', 900_000, '2026-09-11');
    await reconciliation.runMatching(reconciliationId, ACTOR);
    const entryOnly = (await discrepancies()).find((item) => item.kind === 'FUEL_ENTRY_ONLY');
    await reconciliation.resolveDiscrepancy(
      entryOnly?.id as string,
      { resolution: 'IGNORE_WITH_REASON', note: 'phieu cua ky khac' },
      ACTOR,
    );

    await expect(
      reconciliation.reviseDiscrepancyDecision(
        entryOnly?.id as string,
        { resolution: 'ENTRY_CORRECTION_REQUIRED', reason: 'doi y' },
        ACTOR,
      ),
    ).rejects.toMatchObject({ reason: 'DECISION_WITHOUT_STATEMENT_LINE' });
  });

  it('quyet dinh MATCH_CONFIRMED -> DECISION_MATCH_LOCKED (sua se phai xoa cap khop tay)', async () => {
    // Hai phieu cung xe/ngay/tien voi dong le -> nhap nhang -> nguoi xac nhan mot cap.
    const left = await createVerifiedEntry('nhap-nhang-a', 2_000_000, '2026-09-20');
    await createVerifiedEntry('nhap-nhang-b', 2_000_000, '2026-09-20');
    await reconciliation.runMatching(reconciliationId, ACTOR);
    const ambiguous = await pendingFor(lineOrphanId);
    expect(ambiguous.kind).toBe('AMBIGUOUS_CANDIDATES');
    await reconciliation.resolveDiscrepancy(
      ambiguous.id,
      {
        resolution: 'MATCH_CONFIRMED',
        statementLineId: lineOrphanId,
        fuelEntryId: left.id,
      },
      ACTOR,
    );

    await expect(
      reconciliation.reviseDiscrepancyDecision(
        ambiguous.id,
        { resolution: 'IGNORE_WITH_REASON', reason: 'doi y ve cap khop' },
        ACTOR,
      ),
    ).rejects.toMatchObject({ kind: 'DENIED', reason: 'DECISION_MATCH_LOCKED' });
  });

  it('schema: `MATCH_CONFIRMED` khong phai dich sua, va ly do la BAT BUOC', () => {
    expect(
      reviseDiscrepancySchema.safeParse({ resolution: 'MATCH_CONFIRMED', reason: 'x' }).success,
    ).toBe(false);
    expect(reviseDiscrepancySchema.safeParse({ resolution: 'IGNORE_WITH_REASON' }).success).toBe(
      false,
    );
    expect(
      reviseDiscrepancySchema.safeParse({ resolution: 'IGNORE_WITH_REASON', reason: '   ' })
        .success,
    ).toBe(false);
    expect(
      reviseDiscrepancySchema.safeParse({ resolution: 'IGNORE_WITH_REASON', reason: 'ghi nham' })
        .success,
    ).toBe(true);
  });
});

describe('G0 — ban lam viec doi soat noi ro quyet dinh nao da bi thay the', () => {
  it('`supersededDiscrepancyIds` chua quyet dinh cu, khong chua quyet dinh hieu luc', async () => {
    const { decision } = await acceptOrphanAndClose();
    await reconciliation.reopenReconciliation(reconciliationId, 'mo lai', 'giam-doc');
    const revised = await reconciliation.reviseDiscrepancyDecision(
      decision.id,
      { resolution: 'IGNORE_WITH_REASON', reason: 'ghi nham' },
      ACTOR,
    );

    const workspace = await new FuelReadService(
      repository,
      new NoCoreFacts(),
      new InMemoryFuelStationRepository(),
      new MovementFuelRunContextAdapter(new InMemoryMovementRepository()),
    ).reconciliationWorkspace(reconciliationId);
    expect(workspace.supersededDiscrepancyIds).toEqual([decision.id]);
    expect(workspace.supersededDiscrepancyIds).not.toContain(revised.revision.id);
  });
});
