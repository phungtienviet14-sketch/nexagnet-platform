import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { TRANSPORT_CLOCK } from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import { TRANSPORT_FUEL_DECISIONS } from './fuel-decisions.js';
import {
  evaluateFuelReconciliationStateTransition,
  isFrozenFuelReconciliation,
  type FuelReconciliationState,
  type FuelReconciliationStatus,
} from './fuel-lifecycle.js';
import {
  businessDateDeltaDays,
  runFuelMatching,
  type MatchableFuelEntry,
  type MatchableStatementLine,
} from './fuel-matching.js';
import { TRANSPORT_FUEL_POLICY, type TransportFuelPolicy } from './fuel-policy.js';
import { FuelRepository, type MatchToApply, type MatchingRunResult } from './fuel.repository.js';
import type {
  FuelDiscrepancy,
  FuelDiscrepancyResolution,
  FuelReconciliation,
  FuelSettlementHandoff,
  FuelStatementLine,
} from './fuel.types.js';

export interface ResolveDiscrepancyCommand {
  readonly resolution: FuelDiscrepancyResolution;
  readonly note?: string | null;
  /** BAT BUOC voi `MATCH_CONFIRMED`: NGUOI chi ro cap nao (`GD-09`). */
  readonly statementLineId?: string;
  readonly fuelEntryId?: string;
}

export interface ClosedReconciliationResult {
  readonly reconciliation: FuelReconciliation;
  readonly handoff: FuelSettlementHandoff;
}

/**
 * DOI SOAT BANG KE — T1 §7.5, `GD-08`/`GD-09`/`GD-11`, `INV-26`, `INV-07`/`INV-27`.
 *
 * ===========================================================================
 * PHEP SO KHOP KHONG NAM O DAY. No o `fuel-matching.ts` — mot ham THUAN.
 *
 * Service nay lam bon viec khac han: doc du lieu vao, DICH ket qua thanh trang thai, ghi mot lan
 * nguyen tu, va phat quyet dinh ra trace. Tach nhu vay de bo test cua `GD-08`/`GD-09`/`INV-26`
 * khong phai dung mot CSDL len de hoi mot cau hoi so hoc — va de mot lan doi luat so khop khong
 * cham vao mot dong ghi nao.
 *
 * ===========================================================================
 * KHONG MOT NGHIA VU TIEN NAO SINH RA TU DAY.
 *
 * `INV-07`: dong bang ke khong khop KHONG tu vao cong no phai tra.
 * `INV-27`: chenh lech KHONG tu sinh nghia vu tien cua lai xe.
 *
 * Tien chi di tiep khi mot NGUOI quyet `ACCEPT_SUPPLIER_AMOUNT`, va ngay ca luc do no cung chi den
 * mot BAN GIAO cho T5 — khong phai mot but toan. T4 khong ghi mot dong so cai nao.
 */
@Injectable()
export class FuelReconciliationService {
  constructor(
    private readonly repository: FuelRepository,
    private readonly audit: AuditLogService,
    @Inject(TRANSPORT_FUEL_POLICY) private readonly policy: TransportFuelPolicy,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  /**
   * CHAY SO KHOP — chay lai bao nhieu lan cung duoc, va lan nao cung cho ket qua cua DU LIEU HIEN
   * TAI.
   *
   * Xem `ApplyMatchingRunInput`: lan chay thay the ket qua TU DONG cu, va khong dong toi cai NGUOI
   * da quyet.
   */
  async runMatching(reconciliationId: string, actor: string): Promise<MatchingRunResult> {
    const reconciliation = await this.requireOpen(reconciliationId);

    const [lines, entries] = await Promise.all([
      this.repository.listStatementLines(reconciliation.statementId),
      this.repository.listEntriesForMatching({
        supplierId: reconciliation.supplierId,
        // Noi rong DUNG BANG dung sai ngay: mot phieu ngay 31/07 phai khop duoc voi mot dong bang
        // ke ngay 01/08 khi dung sai la +-1 (`GD-08`). Doc dung khoang ky se lam moi cap qua dem
        // cuoi ky bien mat khoi vong so khop, roi hien ra thanh chenh lech o CA HAI ky.
        from: shiftBusinessDate(reconciliation.periodStart, -this.policy.matching.businessDateDays),
        to: shiftBusinessDate(reconciliation.periodEnd, this.policy.matching.businessDateDays),
      }),
    ]);

    const matchableLines: MatchableStatementLine[] = lines
      .filter(isMatchableLine)
      .map((line) => ({
        id: line.id,
        statementId: line.statementId,
        // Bon truong nay khong `null` — `isMatchableLine` da loc, va `CHECK`
        // `TransportFuelStatementLine_accepted_fields` cuong che dieu do o tang DB.
        vehicleId: line.vehicleId ?? '',
        businessDate: line.businessDate ?? '',
        amount: line.amount ?? 0,
        reconciliationStatus: line.reconciliationStatus,
      }));

    const matchableEntries: MatchableFuelEntry[] = entries
      // Chi phieu DA DUOC KE TOAN TIN moi vao vong so khop. Mot phieu con `DECLARED` chua chac la
      // so lieu that; khop no voi bang ke se lam mot con so chua ai kiem tro thanh mot khang dinh
      // ve cong no voi cay xang.
      .filter((entry) => entry.verificationStatus === 'VERIFIED')
      .map((entry) => ({
        id: entry.id,
        vehicleId: entry.vehicleId,
        businessDate: entry.businessDate,
        amount: entry.amount,
        sourceStatementId: entry.sourceStatementId,
        reconciliationStatus: entry.reconciliationStatus,
      }));

    const result = runFuelMatching({
      statementId: reconciliation.statementId,
      lines: matchableLines,
      entries: matchableEntries,
      tolerance: this.policy.matching,
    });

    /*
     * DICH ket qua thanh trang thai cua tung dong/phieu.
     *
     * Bat dau bang cach dua MOI thu con mo ve `UNMATCHED`, roi moi dat lai. Neu chi dat cho nhung
     * cai co ket qua, mot dong tung `MISMATCHED` ma lan nay khong con van de gi se giu nguyen nhan
     * cu — va bang doi soat se noi doi ve chinh lan chay vua xong.
     */
    const lineStatuses = new Map<string, FuelReconciliationStatus>(
      matchableLines.map((line) => [line.id, 'UNMATCHED' as FuelReconciliationStatus]),
    );
    const entryStatuses = new Map<string, FuelReconciliationStatus>(
      matchableEntries.map((entry) => [entry.id, 'UNMATCHED' as FuelReconciliationStatus]),
    );

    for (const match of result.matches) {
      lineStatuses.set(match.statementLineId, 'MATCHED');
      entryStatuses.set(match.fuelEntryId, 'MATCHED');
      this.telemetry?.decision({
        vocabulary: TRANSPORT_FUEL_DECISIONS,
        point: 'fuel.match',
        outcome: 'allowed',
        reason: match.reason,
        detail: {
          reconciliationId: reconciliation.id,
          statementLineId: match.statementLineId,
          fuelEntryId: match.fuelEntryId,
          amountDeltaVnd: match.amountDeltaVnd,
          businessDateDeltaDays: match.businessDateDeltaDays,
        },
      });
    }

    for (const discrepancy of result.discrepancies) {
      if (discrepancy.statementLineId) lineStatuses.set(discrepancy.statementLineId, 'MISMATCHED');
      if (discrepancy.fuelEntryId) entryStatuses.set(discrepancy.fuelEntryId, 'MISMATCHED');
      this.telemetry?.decision({
        vocabulary: TRANSPORT_FUEL_DECISIONS,
        point: 'fuel.match',
        outcome: 'denied',
        reason: discrepancy.reason,
        detail: {
          reconciliationId: reconciliation.id,
          kind: discrepancy.kind,
          statementLineId: discrepancy.statementLineId,
          fuelEntryId: discrepancy.fuelEntryId,
          candidateEntryIds: [...discrepancy.candidateEntryIds],
          candidateLineIds: [...discrepancy.candidateLineIds],
        },
      });
    }

    const applied = await this.repository.applyMatchingRun({
      reconciliationId: reconciliation.id,
      matches: result.matches.map(
        (match): MatchToApply => ({
          statementLineId: match.statementLineId,
          fuelEntryId: match.fuelEntryId,
          amountDeltaVnd: match.amountDeltaVnd,
          businessDateDeltaDays: match.businessDateDeltaDays,
          origin: 'AUTO',
        }),
      ),
      discrepancies: result.discrepancies.map((discrepancy) => ({
        kind: discrepancy.kind,
        statementLineId: discrepancy.statementLineId,
        fuelEntryId: discrepancy.fuelEntryId,
        candidateEntryIds: discrepancy.candidateEntryIds,
        candidateLineIds: discrepancy.candidateLineIds,
      })),
      lineStatuses,
      entryStatuses,
      actor,
      at: this.now(),
    });

    await this.moveTo(reconciliation, 'MATCHING', actor, { markMatched: true });
    await this.settleStateIfResolved(reconciliation.id, actor);

    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel_reconciliation.transition',
      outcome: 'allowed',
      reason: 'RECONCILIATION_MATCHING_RUN',
      detail: {
        reconciliationId: reconciliation.id,
        matches: applied.matches.length,
        discrepancies: applied.discrepancies.length,
      },
    });
    await this.audit.append({
      actor,
      action: 'transport.fuel.reconciliation.match',
      entityType: 'TransportFuelReconciliation',
      entityId: reconciliation.id,
      after: { matches: applied.matches.length, discrepancies: applied.discrepancies.length },
    });
    return applied;
  }

  /**
   * NGUOI QUYET mot chenh lech.
   *
   * `MATCH_CONFIRMED` BAT BUOC chi ro cap — do la toan bo noi dung cua `GD-09`. Neu cho phep quyet
   * "khop di" ma khong noi khop voi cai nao, he thong lai phai chon ho, va viec chon do chinh la
   * cai `GD-09` cam.
   */
  async resolveDiscrepancy(
    discrepancyId: string,
    command: ResolveDiscrepancyCommand,
    actor: string,
  ): Promise<FuelDiscrepancy> {
    const discrepancy = await this.repository.findDiscrepancy(discrepancyId);
    if (!discrepancy) {
      throw TransportDomainError.notFound(
        'FUEL_DISCREPANCY_NOT_FOUND',
        `Khong tim thay chenh lech ${discrepancyId}`,
      );
    }
    const reconciliation = await this.requireOpen(discrepancy.reconciliationId);

    if (discrepancy.status === 'RESOLVED') {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_FUEL_DECISIONS,
        point: 'fuel_discrepancy.resolve',
        outcome: 'denied',
        reason: 'DISCREPANCY_ALREADY_RESOLVED',
        detail: { discrepancyId },
      });
      throw TransportDomainError.conflict(
        'FUEL_RECONCILIATION_STATE_RACE',
        `Chenh lech ${discrepancyId} da co nguoi quyet truoc do`,
      );
    }

    const confirmed = await this.buildConfirmedMatch(discrepancy, command);

    const resolved = await this.repository.resolveDiscrepancy({
      discrepancyId,
      resolution: command.resolution,
      resolutionNote: command.note ?? null,
      actor,
      at: this.now(),
      ...(confirmed
        ? {
            confirmedMatch: confirmed,
            lineStatus: { id: confirmed.statementLineId, status: 'MATCHED' as const },
            entryStatus: { id: confirmed.fuelEntryId, status: 'MATCHED' as const },
          }
        : {}),
      ...(command.resolution === 'IGNORE_WITH_REASON' && discrepancy.statementLineId
        ? { lineStatus: { id: discrepancy.statementLineId, status: 'IGNORED' as const } }
        : {}),
    });
    if (!resolved) {
      throw TransportDomainError.conflict(
        'FUEL_RECONCILIATION_STATE_RACE',
        `Chenh lech ${discrepancyId} vua duoc nguoi khac quyet — tai lai roi doc lai`,
      );
    }

    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel_discrepancy.resolve',
      outcome: 'allowed',
      reason: 'DISCREPANCY_RESOLVED',
      detail: {
        discrepancyId,
        resolution: command.resolution,
        matchId: resolved.match?.id ?? null,
      },
    });
    await this.audit.append({
      actor,
      action: 'transport.fuel.discrepancy.resolve',
      entityType: 'TransportFuelDiscrepancy',
      entityId: discrepancyId,
      before: discrepancy,
      after: resolved.discrepancy,
    });

    await this.settleStateIfResolved(reconciliation.id, actor);
    return resolved.discrepancy;
  }

  /**
   * DONG KY — `FUEL-RECON-004` va `GD-11`.
   *
   * Cong DUY NHAT: khong con chenh lech `PENDING`. Dem o tang kho ngay truoc khi ghi, va lenh dong
   * ban than no chi thanh cong khi ky con dung o `RESOLVED` — nen mot chenh lech phat sinh giua hai
   * buoc se lam lenh that bai voi mot ma va cham, chu khong de lai mot ky da dong voi mot cau hoi
   * con treo.
   */
  async closeReconciliation(
    reconciliationId: string,
    actor: string,
  ): Promise<ClosedReconciliationResult> {
    const reconciliation = await this.requireOpen(reconciliationId);

    const pending = await this.repository.countPendingDiscrepancies(reconciliationId);
    if (pending > 0) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_FUEL_DECISIONS,
        point: 'fuel_reconciliation.transition',
        outcome: 'denied',
        reason: 'RECONCILIATION_HAS_PENDING_DISCREPANCY',
        detail: { reconciliationId, pending },
      });
      throw TransportDomainError.denied(
        'RECONCILIATION_HAS_PENDING_DISCREPANCY',
        `Con ${pending} chenh lech chua ai quyet — chua dong duoc ky doi soat`,
      );
    }

    if (reconciliation.state !== 'RESOLVED') {
      await this.moveTo(reconciliation, 'RESOLVED', actor);
    }

    const accepted = await this.sumAcceptedAmount(reconciliationId);
    const closed = await this.repository.closeReconciliation({
      reconciliationId,
      acceptedAmount: accepted.amount,
      acceptedLineCount: accepted.lineCount,
      actor,
      at: this.now(),
    });
    if (!closed) {
      throw TransportDomainError.conflict(
        'FUEL_RECONCILIATION_STATE_RACE',
        `Ky doi soat ${reconciliationId} vua duoc nguoi khac doi trang thai — tai lai roi doc lai`,
      );
    }

    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel_reconciliation.transition',
      outcome: 'allowed',
      reason: 'RECONCILIATION_CLOSED',
      detail: { reconciliationId, acceptedAmount: accepted.amount },
    });
    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel.settlement_handoff',
      outcome: 'allowed',
      reason: closed.handoffReplayed ? 'HANDOFF_IDEMPOTENT_REPLAY' : 'HANDOFF_EMITTED',
      detail: {
        reconciliationId,
        handoffId: closed.handoff.id,
        acceptedAmount: closed.handoff.acceptedAmount,
        acceptedLineCount: closed.handoff.acceptedLineCount,
      },
    });
    await this.audit.append({
      actor,
      action: 'transport.fuel.reconciliation.close',
      entityType: 'TransportFuelReconciliation',
      entityId: reconciliationId,
      before: reconciliation,
      after: closed,
    });

    return { reconciliation: closed.reconciliation, handoff: closed.handoff };
  }

  /** `GD-11` — mo lai can QUYEN RIENG (`transport.fuel.reconciliation.reopen`) + dau vet. */
  async reopenReconciliation(
    reconciliationId: string,
    reason: string,
    actor: string,
  ): Promise<FuelReconciliation> {
    const current = await this.requireReconciliation(reconciliationId);
    const reopened = await this.repository.reopenReconciliation({
      reconciliationId,
      reason,
      actor,
      at: this.now(),
    });
    if (!reopened) this.denyTransition(current, 'REOPENED');

    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel_reconciliation.transition',
      outcome: 'allowed',
      reason: 'RECONCILIATION_REOPENED',
      detail: { reconciliationId, reason },
    });
    await this.audit.append({
      actor,
      action: 'transport.fuel.reconciliation.reopen',
      entityType: 'TransportFuelReconciliation',
      entityId: reconciliationId,
      before: current,
      after: reopened,
    });
    return reopened;
  }

  /* ---------------------------- Noi bo ---------------------------- */

  /**
   * TONG DUOC CHAP NHAN — con so DUY NHAT di sang T5.
   *
   * Hai nguon, va chi hai:
   *   · dong DA KHOP (may hoac nguoi) — so cua cay xang trung so cua ta trong dung sai;
   *   · dong co chenh lech duoc quyet `ACCEPT_SUPPLIER_AMOUNT` — ta chap nhan so cua ho.
   *
   * MOI THU KHAC BI LOAI, ke ca `IGNORE_WITH_REASON` va `ENTRY_CORRECTION_REQUIRED`. Do la `INV-07`
   * duoc viet thanh mot phep cong: mot dong khong khop KHONG tu vao cong no phai tra.
   */
  private async sumAcceptedAmount(
    reconciliationId: string,
  ): Promise<{ amount: number; lineCount: number }> {
    const reconciliation = await this.requireReconciliation(reconciliationId);
    const [lines, matches, discrepancies] = await Promise.all([
      this.repository.listStatementLines(reconciliation.statementId),
      this.repository.listMatches(reconciliationId),
      this.repository.listDiscrepancies(reconciliationId),
    ]);

    const acceptedLineIds = new Set(matches.map((match) => match.statementLineId));
    for (const discrepancy of discrepancies) {
      if (discrepancy.resolution !== 'ACCEPT_SUPPLIER_AMOUNT') continue;
      if (discrepancy.statementLineId) acceptedLineIds.add(discrepancy.statementLineId);
    }

    const accepted = lines.filter((line) => acceptedLineIds.has(line.id));
    return {
      amount: accepted.reduce((total, line) => total + (line.amount ?? 0), 0),
      lineCount: accepted.length,
    };
  }

  private async settleStateIfResolved(reconciliationId: string, actor: string): Promise<void> {
    const pending = await this.repository.countPendingDiscrepancies(reconciliationId);
    if (pending > 0) return;
    const current = await this.requireReconciliation(reconciliationId);
    if (current.state !== 'MATCHING') return;

    await this.moveTo(current, 'RESOLVED', actor);
    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel_reconciliation.transition',
      outcome: 'allowed',
      reason: 'RECONCILIATION_RESOLVED',
      detail: { reconciliationId },
    });
  }

  /**
   * Mot buoc chuyen trang thai, qua may trang thai THUAN roi moi cham kho.
   *
   * `ALREADY_IN_STATE` khong phai loi o day: chay lai so khop khi ky da o `MATCHING` la duong chay
   * thuong ngay. Chi canh KHONG TON TAI moi la mot lan tu choi that.
   */
  private async moveTo(
    reconciliation: FuelReconciliation,
    to: FuelReconciliationState,
    actor: string,
    options?: { markMatched?: boolean },
  ): Promise<FuelReconciliation> {
    const decision = evaluateFuelReconciliationStateTransition(reconciliation.state, to);
    if (!decision.allowed) {
      if (decision.reason === 'ALREADY_IN_STATE') return reconciliation;
      this.denyTransition(reconciliation, to);
    }

    const moved = await this.repository.setReconciliationState(
      reconciliation.id,
      reconciliation.state,
      to,
      {
        at: this.now(),
        actor,
        ...(options?.markMatched ? { markMatched: true } : {}),
      },
    );
    if (!moved) {
      throw TransportDomainError.conflict(
        'FUEL_RECONCILIATION_STATE_RACE',
        `Ky doi soat ${reconciliation.id} vua duoc nguoi khac doi trang thai — tai lai roi quyet lai`,
      );
    }
    return moved;
  }

  private denyTransition(reconciliation: FuelReconciliation, to: FuelReconciliationState): never {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel_reconciliation.transition',
      outcome: 'denied',
      reason: 'RECONCILIATION_TRANSITION_NOT_PERMITTED',
      detail: { reconciliationId: reconciliation.id, from: reconciliation.state, to },
    });
    throw TransportDomainError.denied(
      'RECONCILIATION_TRANSITION_NOT_PERMITTED',
      `Ky doi soat ${reconciliation.id} dang ${reconciliation.state} — khong co canh sang ${to}`,
    );
  }

  private async requireReconciliation(id: string): Promise<FuelReconciliation> {
    const reconciliation = await this.repository.findReconciliation(id);
    if (!reconciliation) {
      throw TransportDomainError.notFound(
        'FUEL_RECONCILIATION_NOT_FOUND',
        `Khong tim thay ky doi soat ${id}`,
      );
    }
    return reconciliation;
  }

  /** `GD-11` — mot ky DA DONG khong nhan them thay doi nao ngoai duong mo lai co quyen rieng. */
  private async requireOpen(id: string): Promise<FuelReconciliation> {
    const reconciliation = await this.requireReconciliation(id);
    if (!isFrozenFuelReconciliation(reconciliation.state)) return reconciliation;

    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel_reconciliation.transition',
      outcome: 'denied',
      reason: 'RECONCILIATION_FROZEN',
      detail: { reconciliationId: id, state: reconciliation.state },
    });
    throw TransportDomainError.denied(
      'RECONCILIATION_FROZEN',
      `Ky doi soat ${id} da dong — mo lai (co quyen rieng) truoc khi sua bat cu thu gi`,
    );
  }

  /**
   * CAP MA NGUOI CHON — chi cho `MATCH_CONFIRMED`, va bat buoc phai co ca hai ve.
   *
   * Do lech ngay/tien duoc TINH LAI o day tu chinh du lieu dang co, khong lay tu nguoi goi: neu
   * client gui kem do lech, mot client cu (hoac mot lan go tay) se ghi vao so mot con so khong khop
   * voi hai ban ghi ma no tro toi — va bang doi soat se giai thich sai ve chinh no.
   */
  private async buildConfirmedMatch(
    discrepancy: FuelDiscrepancy,
    command: ResolveDiscrepancyCommand,
  ): Promise<MatchToApply | null> {
    if (command.resolution !== 'MATCH_CONFIRMED') return null;

    const statementLineId = command.statementLineId ?? discrepancy.statementLineId;
    const fuelEntryId = command.fuelEntryId ?? discrepancy.fuelEntryId;
    if (!statementLineId || !fuelEntryId) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_FUEL_DECISIONS,
        point: 'fuel_discrepancy.resolve',
        outcome: 'denied',
        reason: 'DISCREPANCY_MATCH_TARGET_REQUIRED',
        detail: { discrepancyId: discrepancy.id, statementLineId, fuelEntryId },
      });
      throw TransportDomainError.invalid(
        'FUEL_MATCH_TARGET_REQUIRED',
        'Xac nhan khop phai chi ro ca dong bang ke lan phieu do dau',
      );
    }

    const reconciliation = await this.requireReconciliation(discrepancy.reconciliationId);
    const [lines, entry] = await Promise.all([
      this.repository.listStatementLines(reconciliation.statementId),
      this.repository.findEntry(fuelEntryId),
    ]);

    const line = lines.find((candidate) => candidate.id === statementLineId);
    if (!line) {
      throw TransportDomainError.notFound(
        'FUEL_STATEMENT_LINE_NOT_FOUND',
        `Khong tim thay dong bang ke ${statementLineId}`,
      );
    }
    if (!entry) {
      throw TransportDomainError.notFound(
        'FUEL_ENTRY_NOT_FOUND',
        `Khong tim thay phieu ${fuelEntryId}`,
      );
    }

    /*
     * `INV-26` O DUONG NGUOI QUYET, khong chi o duong may chay.
     *
     * Phep so khop tu dong da loai cac cap tu-nguon; nhung duong nay nhan cap TU NGUOI DUNG, nen no
     * la mot cua vao thu hai. Trigger cua DB van la luoi cuoi, con o day thi loi tra ve co ten
     * nghiep vu thay vi mot loi rang buoc tho.
     */
    if (entry.sourceStatementId !== null && entry.sourceStatementId === line.statementId) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_FUEL_DECISIONS,
        point: 'fuel.match',
        outcome: 'denied',
        reason: 'MATCH_SELF_SOURCED_BLOCKED',
        detail: { statementLineId, fuelEntryId, statementId: line.statementId },
      });
      throw TransportDomainError.conflict(
        'FUEL_MATCH_SELF_SOURCED',
        `Phieu ${fuelEntryId} duoc de ra tu chinh bang ke nay — khong khop voi chinh no (INV-26)`,
      );
    }

    return {
      statementLineId,
      fuelEntryId,
      amountDeltaVnd: (line.amount ?? 0) - entry.amount,
      businessDateDeltaDays: line.businessDate
        ? businessDateDeltaDays(line.businessDate, entry.businessDate)
        : 0,
      origin: 'MANUAL',
    };
  }

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }
}

/**
 * Mot dong bang ke co du dieu kien de vao vong so khop khong.
 *
 * `ACCEPTED` + ba truong so lieu khong `null`. Ba truong do duoc `CHECK`
 * `TransportFuelStatementLine_accepted_fields` cuong che o DB, nen phep loc nay ve ly thuyet la
 * thua — nhung no la thu cho phep TypeScript thu hep kieu, va la thu con dung khi mot hang cu (tu
 * truoc `CHECK`) van con trong CSDL cua ai do.
 */
const isMatchableLine = (line: FuelStatementLine): boolean =>
  line.status === 'ACCEPTED' &&
  line.vehicleId !== null &&
  line.businessDate !== null &&
  line.amount !== null;

/**
 * Doi mot ngay nghiep vu di `days` ngay — chi de NOI RONG khoang doc, khong bao gio de luu.
 *
 * Di qua `Date.UTC` vi ly do da noi o `fuel-matching.ts`: hai dau deu la ngay lich khong mui gio,
 * nen dat ca hai o UTC nua dem lam phep cong ngay chinh xac tuyet doi.
 */
function shiftBusinessDate(value: string, days: number): string {
  const shifted = new Date(
    Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10))) +
      days * 86_400_000,
  );
  return shifted.toISOString().slice(0, 10);
}
