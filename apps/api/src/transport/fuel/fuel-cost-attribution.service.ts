import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { decisionReasonLabel } from '../../observability/decision-vocabulary.js';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { MoneyError, nonNegativeMoney } from '../money.js';
import { TRANSPORT_CLOCK } from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import { FuelCostAttributionReadService } from './fuel-cost-attribution-read.service.js';
import {
  allocationIdentityDifferences,
  allocationIdentityOf,
  type FuelCostAllocationIdentity,
  type FuelCostAttributionTarget,
  type FuelCostTargetKind,
  type FuelEntryCostAttributionView,
} from './fuel-cost-attribution.js';
import { FuelCostAttributionRepository } from './fuel-cost-attribution.repository.js';
import { TRANSPORT_FUEL_DECISIONS, type FuelCostAttributionReason } from './fuel-decisions.js';
import { FuelRunContextFacts } from './fuel-run-context.port.js';
import { FuelRepository } from './fuel.repository.js';
import type { FuelEntry } from './fuel.types.js';

export interface RecordFuelCostAttributionCommand {
  readonly target: FuelCostAttributionTarget;
  /** So tien CAP PHAT — duong, SO NGUYEN DONG, khong vuot phan con lai cua phieu. */
  readonly amount: number;
  readonly note?: string | null;
  /** BAT BUOC: tien la mot quyet dinh chi duoc ghi DUNG MOT LAN (`#364` §3.1 "retry khong sinh dong thu hai"). */
  readonly correlationKey: string;
}

/**
 * PHAN BO GIA THANH NHIEN LIEU — duong GHI, `#364`.
 *
 * ===========================================================================
 * NAM DIEU TEP NAY KHONG LAM, va moi dieu la mot bat bien cua `#364` §3.1:
 *
 *   1. KHONG sua su that cua phieu — khong mot lenh ghi nao vao `TransportFuelEntry`;
 *   2. KHONG cham cong no nha cung cap, bang ke, cap khop hay chenh lech — khong tiem kho cua chung;
 *   3. KHONG cham Quy lai xe — tep nay khong tiem `CostingService`, va no van dung sau `#369` R-4:
 *      mot phieu Run-first `DRIVER_CASH` co chan Quy RIENG (`RUN_EXPENSE`, ghi luc DUYET), con phan
 *      bo gia thanh la mot quyet dinh KHAC cua ke toan. Hai su that ve cung mot lan do dau — "lai xe
 *      da bo bao nhieu" va "cong viec nao chiu bao nhieu" — khong duoc tron;
 *   4. KHONG xoa, KHONG sua mot dong — sua la mot dong DAO roi mot cap phat moi;
 *   5. KHONG tu phan bo — moi dong do MOT NGUOI quyet (`recordedBy`), khong co lan phan bo "mac dinh
 *      100% vao vong chay cua ngu canh".
 *
 * Khong phan bo nao bien thanh "loi cua lai xe": bang nay khong co cot `driverId`, va khong duong
 * nao tu no di toi phieu luong.
 */
@Injectable()
export class FuelCostAttributionService {
  constructor(
    private readonly entries: FuelRepository,
    private readonly attributions: FuelCostAttributionRepository,
    private readonly runs: FuelRunContextFacts,
    private readonly read: FuelCostAttributionReadService,
    private readonly audit: AuditLogService,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  /**
   * CAP PHAT mot phan tien cua phieu vao MOT vong chay hoac MOT chang.
   *
   * Cong o day tu choi SOM voi ly do co ma (phieu chua duyet, phieu chuyen v1, dich sai xe); cong
   * QUYET DINH ve so tien thi chay trong kho, tren hang phieu DA KHOA — vi chi o do tong da phan bo
   * moi khong the cu.
   */
  async attribute(
    entryId: string,
    command: RecordFuelCostAttributionCommand,
    actor: string,
  ): Promise<FuelEntryCostAttributionView> {
    const amount = this.parseAmount(command.amount);
    const entry = await this.requireEntry(entryId);

    if (entry.tripId !== null) {
      this.deny('FUEL_COST_ATTRIBUTION_LEGACY_TRIP_PROJECTED', {
        fuelEntryId: entry.id,
        tripId: entry.tripId,
      });
    }
    if (entry.verificationStatus !== 'VERIFIED') {
      this.deny('FUEL_COST_ATTRIBUTION_ENTRY_NOT_VERIFIED', {
        fuelEntryId: entry.id,
        verificationStatus: entry.verificationStatus,
      });
    }

    const target = await this.resolveTarget(entry, command.target);
    const identity: FuelCostAllocationIdentity = { fuelEntryId: entry.id, ...target, amount };

    const replay = await this.replayOf(command.correlationKey, identity);
    if (replay) return replay;

    const outcome = await this.attributions.recordAllocation({
      fuelEntryId: entry.id,
      ...target,
      amount,
      correlationKey: command.correlationKey,
      note: command.note ?? null,
      recordedBy: actor,
      at: this.now(),
    });

    if (outcome.kind === 'ENTRY_NOT_FOUND') throw this.entryNotFound(entryId);
    if (outcome.kind === 'CORRELATION_TAKEN') {
      // Mot lan gui song song vua ghi dung khoa nay — doc lai va phan xu y het lan doc truoc.
      const converged = await this.replayOf(command.correlationKey, identity);
      if (converged) return converged;
      throw TransportDomainError.conflict(
        'FUEL_COST_ATTRIBUTION_KEY_REUSED',
        decisionReasonLabel('FUEL_COST_ATTRIBUTION_KEY_REUSED'),
      );
    }
    if (outcome.kind === 'DENIED') {
      this.deny(outcome.reason, {
        fuelEntryId: entry.id,
        amount,
        attributedSoFar: outcome.attributedSoFar,
        entryAmount: outcome.entryAmount,
      });
    }

    const attribution = outcome.attribution;
    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel.cost_attribution',
      outcome: 'allowed',
      reason: 'FUEL_COST_ATTRIBUTED',
      detail: {
        fuelEntryId: entry.id,
        attributionId: attribution.id,
        targetKind: attribution.targetKind,
        runId: attribution.runId,
        legId: attribution.legId,
        amount,
      },
    });
    await this.audit.append({
      actor,
      action: 'transport.fuel.cost_attribution.record',
      entityType: 'TransportFuelCostAttribution',
      entityId: attribution.id,
      after: attribution,
    });
    return this.read.viewForEntry(entry.id);
  }

  /**
   * DAO mot cap phat — them MOT dong am, KHONG xoa, KHONG sua. Gui lai (hoac hai nguoi cung bam)
   * nhan lai CHINH dong dao da co: `reversalOfId` UNIQUE, khoa tat dinh.
   */
  async reverse(
    attributionId: string,
    reason: string,
    actor: string,
  ): Promise<FuelEntryCostAttributionView> {
    const outcome = await this.attributions.recordReversal({
      attributionId,
      note: reason,
      recordedBy: actor,
      at: this.now(),
    });

    if (outcome.kind === 'NOT_FOUND') {
      this.deny('FUEL_COST_ATTRIBUTION_NOT_FOUND', { attributionId });
    }
    if (outcome.kind === 'NOT_REVERSIBLE') {
      this.deny('FUEL_COST_ATTRIBUTION_NOT_REVERSIBLE', { attributionId });
    }
    if (outcome.kind === 'ALREADY_REVERSED') {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_FUEL_DECISIONS,
        point: 'fuel.cost_attribution',
        outcome: 'allowed',
        reason: 'FUEL_COST_ATTRIBUTION_ALREADY_REVERSED',
        detail: { attributionId, reversalId: outcome.reversal.id },
      });
      return this.read.viewForEntry(outcome.reversal.fuelEntryId);
    }

    const reversal = outcome.reversal;
    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel.cost_attribution',
      outcome: 'allowed',
      reason: 'FUEL_COST_ATTRIBUTION_REVERSED',
      detail: {
        attributionId,
        reversalId: reversal.id,
        fuelEntryId: reversal.fuelEntryId,
        amount: reversal.signedAmount,
      },
    });
    await this.audit.append({
      actor,
      action: 'transport.fuel.cost_attribution.reverse',
      entityType: 'TransportFuelCostAttribution',
      entityId: reversal.id,
      after: reversal,
    });
    return this.read.viewForEntry(reversal.fuelEntryId);
  }

  /* ---------------------------- Noi bo ---------------------------- */

  /**
   * DICH -> `(vong chay, chang)` da chung minh. Chang thi doi ra vong chay cua CHINH no.
   *
   * MOT dieu kien nghiep vu: vong chay dich phai la cua CHINH xe tren phieu — dau do vao binh xe A
   * khong the la gia thanh cong viec cua xe B. Dich KHONG buoc phai la ngu canh cua phieu: dau mua
   * trong vong chay X co the chay het o vong chay ke tiep cua cung xe (`#364` §2.2).
   */
  private async resolveTarget(
    entry: FuelEntry,
    target: FuelCostAttributionTarget,
  ): Promise<{ targetKind: FuelCostTargetKind; runId: string; legId: string | null }> {
    let runId: string;
    let legId: string | null = null;
    if (target.kind === 'LEG') {
      const leg = await this.runs.findLeg(target.legId);
      if (!leg) this.denyTargetNotFound({ legId: target.legId });
      runId = leg.runId;
      legId = leg.id;
    } else {
      runId = target.runId;
    }

    const run = await this.runs.findRun(runId);
    if (!run) this.denyTargetNotFound({ runId, legId });

    if (run.vehicleId !== entry.vehicleId) {
      this.deny('FUEL_COST_ATTRIBUTION_TARGET_VEHICLE_MISMATCH', {
        fuelEntryId: entry.id,
        vehicleId: entry.vehicleId,
        runId: run.id,
        runVehicleId: run.vehicleId,
      });
    }
    return { targetKind: target.kind, runId: run.id, legId };
  }

  /**
   * PHAT LAI hay DUNG LAI KHOA — cung khuon voi `FuelService.replayOf`.
   *
   * `null` = khoa chua dung. Cung noi dung -> tra lai khung nhin (khong ghi them). Khac noi dung ->
   * `FUEL_COST_ATTRIBUTION_KEY_REUSED`, liet ke truong lech de nguoi dung sua duoc.
   */
  private async replayOf(
    correlationKey: string,
    identity: FuelCostAllocationIdentity,
  ): Promise<FuelEntryCostAttributionView | null> {
    const existing = await this.attributions.findByCorrelation(correlationKey);
    if (!existing) return null;

    const existingIdentity = allocationIdentityOf(existing);
    const differences = existingIdentity
      ? allocationIdentityDifferences(existingIdentity, identity)
      : (['fuelEntryId'] as const);
    if (differences.length > 0) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_FUEL_DECISIONS,
        point: 'fuel.cost_attribution',
        outcome: 'denied',
        reason: 'FUEL_COST_ATTRIBUTION_KEY_REUSED',
        detail: { correlationKey, fields: [...differences] },
      });
      throw TransportDomainError.conflict(
        'FUEL_COST_ATTRIBUTION_KEY_REUSED',
        `Khoa chong ghi trung ${correlationKey} da dung cho mot phan bo khac — lech: ${differences.join(', ')}`,
      );
    }

    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel.cost_attribution',
      outcome: 'allowed',
      reason: 'FUEL_COST_ATTRIBUTION_REPLAY',
      detail: { correlationKey, attributionId: existing.id },
    });
    return this.read.viewForEntry(existing.fuelEntryId);
  }

  private denyTargetNotFound(detail: Readonly<Record<string, unknown>>): never {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel.cost_attribution',
      outcome: 'denied',
      reason: 'FUEL_COST_ATTRIBUTION_TARGET_NOT_FOUND',
      detail,
    });
    throw TransportDomainError.notFound(
      'FUEL_COST_ATTRIBUTION_TARGET_NOT_FOUND',
      decisionReasonLabel('FUEL_COST_ATTRIBUTION_TARGET_NOT_FOUND'),
    );
  }

  /** Tu choi voi MOT ly do co ma. `NOT_FOUND` la 404; moi ma con lai la 403. */
  private deny(
    reason: FuelCostAttributionReason,
    detail: Readonly<Record<string, unknown>>,
  ): never {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel.cost_attribution',
      outcome: 'denied',
      reason,
      detail,
    });
    const message = decisionReasonLabel(reason);
    throw reason === 'FUEL_COST_ATTRIBUTION_NOT_FOUND'
      ? TransportDomainError.notFound(reason, message)
      : TransportDomainError.denied(reason, message);
  }

  private async requireEntry(entryId: string): Promise<FuelEntry> {
    const entry = await this.entries.findEntry(entryId);
    if (!entry) throw this.entryNotFound(entryId);
    return entry;
  }

  private entryNotFound(entryId: string): TransportDomainError {
    return TransportDomainError.notFound('FUEL_ENTRY_NOT_FOUND', `Khong tim thay phieu ${entryId}`);
  }

  private parseAmount(value: number): number {
    let amount: number;
    try {
      amount = nonNegativeMoney(value).amount;
    } catch (error) {
      if (error instanceof MoneyError) {
        throw TransportDomainError.invalid('MONEY_INVALID', error.message);
      }
      throw error;
    }
    if (amount === 0) {
      throw TransportDomainError.invalid(
        'MONEY_INVALID',
        'Phan bo 0 dong khong noi gi ve gia thanh',
      );
    }
    return amount;
  }

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }
}
