import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { decisionReasonLabel } from '../../observability/decision-vocabulary.js';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { BusinessDateError, assertBusinessDate, toBusinessDate } from '../business-date.js';
import type { ExpenseFundingSource } from '../costing/driver-fund-ledger.js';
import { MoneyError, nonNegativeMoney } from '../money.js';
import {
  TRANSPORT_CLOCK,
  TRANSPORT_CORE_POLICY,
  type TransportCorePolicy,
} from '../transport-policy.js';
import { isTransportEvidenceLocator } from '../evidence/evidence-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import { TRANSPORT_FUEL_DECISIONS, type FuelEntrySubmitReason } from './fuel-decisions.js';
import {
  FuelRunContextFacts,
  type FuelLegFacts,
  type FuelRunFacts,
} from './fuel-run-context.port.js';
import {
  EVIDENCE_FROZEN_FUEL_RECONCILIATION_STATUSES,
  LOCKED_FUEL_RECONCILIATION_STATUSES,
  REMOVAL_BLOCKING_FUEL_RECONCILIATION_STATUSES,
  evaluateFuelEntryAmendment,
  evaluateFuelEvidenceRemoval,
  type FuelEvidenceRemovalDeniedReason,
  type FuelReviewReason,
} from './fuel-lifecycle.js';
import {
  fuelEntityIdentityDifferences,
  fuelEntryIdentityOf,
  type FuelEntryIdentity,
} from './fuel-entry-identity.js';
import {
  TRANSPORT_FUEL_POLICY,
  consumptionNormFor,
  type TransportFuelPolicy,
} from './fuel-policy.js';
import {
  FuelQuantityError,
  computeConsumption,
  exceedsConsumptionNorm,
  litersToUnits,
} from './fuel-quantity.js';
import {
  FuelCostingPort,
  TransportFuelCoreFacts,
  fuelCostCorrelationKey,
  type FuelTripFacts,
} from './fuel.ports.js';
import { FuelRepository } from './fuel.repository.js';
import { FuelStationRepository } from './fuel-station.repository.js';
import { toFuelReceiptEvidenceView } from './fuel.types.js';
import type {
  FuelEntry,
  FuelPaymentMethod,
  FuelReceiptEvidence,
  FuelReceiptEvidenceView,
  FuelSupplier,
} from './fuel.types.js';

/**
 * NOP MOT PHIEU — `#364`: su kien cua XE, ngu canh TUY CHON nhung PHAI chung minh duoc.
 *
 * Ba hinh dang hop le cua bo ngu canh, va chi ba:
 *
 * ```text
 * tripId + vehicleId            chuyen v1 — duong CU, giu nguyen tung cong (`INV-04`, `GD-01`, ...)
 * runId [+ legId] [+ vehicleId] vong chay v2 — xe LAY TU vong chay; `vehicleId` gui kem thi phai khop
 * (khong gi)                    -> FAIL CLOSED `FUEL_ENTRY_CONTEXT_REQUIRED`
 * ```
 *
 * `driverId` do BEN GOI dat: be mat lai xe lay tu PHIEN (`DriverFuelController`), be mat van hanh
 * lay tu than yeu cau cua mot nguoi co quyen van hanh. Service kiem ca hai nhu nhau.
 */
export interface SubmitFuelEntryCommand {
  /** Chuyen v1 — chi de TUONG THICH. Loai tru voi `runId`/`legId`. */
  readonly tripId?: string | null;
  /** `#364` — vong chay lam NGU CANH. Khong phai phan bo gia thanh. */
  readonly runId?: string | null;
  /** `#364` — chang cua CHINH `runId`. Tuy chon ngay ca khi co `runId`. */
  readonly legId?: string | null;
  /** BAT BUOC voi `tripId`. Voi `runId` thi tuy chon: bo trong = xe cua vong chay. */
  readonly vehicleId?: string | null;
  readonly driverId: string;
  readonly supplierId: string;
  /** `#317` G1 — tram/diem do. `null`/bo trong = khong khai. */
  readonly stationId?: string | null;
  /** So lit — chuoi hoac so, KHONG bao gio di qua mot phep nhan so thuc. Xem `fuel-quantity.ts`. */
  readonly liters: number | string;
  readonly amount: number;
  readonly odometerKm: number;
  readonly occurredAt: string;
  readonly businessDate?: string;
  readonly paymentMethod: FuelPaymentMethod;
  readonly invoiceNo?: string | null;
  readonly note?: string | null;
  readonly correlationKey?: string;
}

/** SUA mot phieu con `DECLARED` — `GD-10`. Cung tap truong voi luc nop, tru danh tinh ngu canh/xe. */
export type AmendFuelEntryCommand = Omit<
  SubmitFuelEntryCommand,
  'tripId' | 'runId' | 'legId' | 'vehicleId' | 'driverId' | 'correlationKey'
>;

/**
 * NGU CANH DA DUOC CHUNG MINH — cai duy nhat duoc phep di xuong kho.
 *
 * Mot kieu hop chu khong ba truong tuy chon: nhanh chuyen v1 va nhanh vong chay mang hai bo facts
 * khac nhau, va phep kiem phan cong cua nhanh nay KHONG duoc chay nham tren nhanh kia.
 */
type ResolvedFuelContext =
  | {
      readonly kind: 'LEGACY_TRIP';
      readonly trip: FuelTripFacts;
      readonly vehicleId: string;
    }
  | {
      readonly kind: 'RUN';
      readonly run: FuelRunFacts;
      readonly leg: FuelLegFacts | null;
      readonly vehicleId: string;
    };

const contextColumns = (
  context: ResolvedFuelContext,
): { tripId: string | null; runId: string | null; legId: string | null } =>
  context.kind === 'LEGACY_TRIP'
    ? { tripId: context.trip.id, runId: null, legId: null }
    : { tripId: null, runId: context.run.id, legId: context.leg?.id ?? null };

export interface AttachFuelEvidenceCommand {
  readonly locator: string;
  readonly contentType?: string | null;
  readonly byteSize?: number | null;
  readonly capturedAt?: string | null;
}

/**
 * `TX-04 Fuel` — duong GHI cua mot phieu do dau.
 *
 * ===========================================================================
 * BON DIEU KHONG DUOC PHEP LAM O BAT CU DAU trong tep nay, ke ca khi tien:
 *
 *   1. ghi thang vao bang cua `transport-core` — `TransportFuelCoreFacts` khong co ham ghi;
 *   2. ghi thang vao bang cua `TX-03` — chi phi dau di qua `FuelCostingPort`;
 *   3. tinh mot con so tieu hao khi mau so <= 0 (`INV-06`);
 *   4. sua so lieu cua mot phieu DA DUOC TIN (`GD-10`) — duong dung la dao khoan chi o `TX-03`.
 *
 * ===========================================================================
 * `INV-04` MANH HON O DAY so voi T3.
 *
 * T3 (`DA-T3-03`) van cho mot khoan `COMPANY_DIRECT` tren chuyen thue xe ngoai, vi tien tra nha xe
 * di duong `PayableDocument` cua T5. T4 thi KHONG cho mot phieu dau nao ca — T1 `INV-04` viet ro:
 * *"chuyen loai thue xe ngoai khong duoc co `FuelEntry` hay `DriverFundEntry` nao"*. Dau cua xe nha
 * xe la chi phi cua NHA XE, va no da nam trong gia thue.
 *
 * Cong do dat o duong NOP chu khong o duong duyet: mot phieu khong bao gio duoc phep ton tai cho
 * chuyen do, ke ca o trang thai `DECLARED`.
 */
@Injectable()
export class FuelService {
  constructor(
    private readonly repository: FuelRepository,
    /** `#317` G1 — CHI DOC: kiem tram tren to khai. Danh muc tram thuoc `FuelStationService`. */
    private readonly stations: FuelStationRepository,
    private readonly core: TransportFuelCoreFacts,
    /** `#364` — CHI DOC: vong chay / chang / phan cong lam ngu canh cua phieu Run-first. */
    private readonly runs: FuelRunContextFacts,
    private readonly costing: FuelCostingPort,
    private readonly audit: AuditLogService,
    @Inject(TRANSPORT_CORE_POLICY) private readonly corePolicy: TransportCorePolicy,
    @Inject(TRANSPORT_FUEL_POLICY) private readonly policy: TransportFuelPolicy,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  /* ---------------------- Nop phieu ---------------------- */

  async submitFuelEntry(command: SubmitFuelEntryCommand, actor: string): Promise<FuelEntry> {
    const businessDate = this.businessDate(command.businessDate);
    const occurredAt = this.parseInstant(command.occurredAt);
    const litersUnits = this.parseLiters(command.liters);
    const amount = this.parseAmount(command.amount);
    const odometerKm = this.parseOdometer(command.odometerKm);

    const context = await this.resolveContext(command);
    const vehicleId = context.vehicleId;
    const columns = contextColumns(context);

    const vehicle = await this.core.findVehicle(vehicleId);
    if (!vehicle) {
      throw TransportDomainError.notFound('VEHICLE_NOT_FOUND', `Khong tim thay xe ${vehicleId}`);
    }
    if (!(await this.core.findDriver(command.driverId))) {
      throw TransportDomainError.notFound(
        'DRIVER_NOT_FOUND',
        `Khong tim thay lai xe ${command.driverId}`,
      );
    }
    await this.requireSupplier(command.supplierId);
    if (context.kind === 'LEGACY_TRIP') {
      await this.requireAssignedToTrip(context.trip, command.driverId, vehicleId);
    } else {
      await this.requireAssignedToRun(context.run, command.driverId);
    }

    const correlationKey = command.correlationKey ?? this.newCorrelationKey();
    const identity = fuelEntryIdentityOf({
      ...columns,
      vehicleId,
      driverId: command.driverId,
      supplierId: command.supplierId,
      stationId: command.stationId,
      businessDate,
      occurredAt,
      litersUnits,
      amount,
      odometerKm,
      paymentMethod: command.paymentMethod,
      invoiceNo: command.invoiceNo,
      note: command.note,
    });
    const replay = await this.replayOf(correlationKey, identity);
    if (replay) return replay;

    /*
     * TRAM duoc kiem SAU lan do phat lai, co y: mot tram vua bi ngung hop tac giua lan gui dau va lan
     * gui lai KHONG duoc bien mot lan gui lai hop le thanh mot loi. Lan gui dau da qua cong nay; phep
     * so danh tinh o tren da bat moi lenh doi tram.
     */
    const stationId = await this.requireStation({
      stationId: command.stationId ?? null,
      supplierId: command.supplierId,
      point: 'fuel_entry.submit',
      previousStationId: null,
    });

    // Tieu hao la su that cua XE + ODO + THOI GIAN (`#364` §6), khong phai cua chuyen: phep tim odo
    // truoc chi theo `vehicleId`, nen phieu Run-first khong mat so L/100km.
    const consumption = await this.measureConsumption({
      vehicleId,
      vehicleClass: vehicle.vehicleClass,
      businessDate,
      occurredAt,
      litersUnits,
      odometerKm,
    });

    let entry: FuelEntry;
    try {
      entry = await this.repository.createEntry({
        ...columns,
        vehicleId,
        driverId: command.driverId,
        supplierId: command.supplierId,
        stationId,
        businessDate,
        occurredAt,
        litersUnits,
        amount,
        odometerKm,
        previousOdometerKm: consumption.previousOdometerKm,
        consumptionUnits: consumption.consumptionUnits,
        reviewReasons: consumption.reviewReasons,
        paymentMethod: command.paymentMethod,
        // Phieu do LAI XE khai KHONG BAO GIO co nguon bang ke — `INV-26` chi chan cac phieu de ra
        // tu mot lan nhap bang ke, va duong do khong di qua ham nay.
        sourceStatementId: null,
        correlationKey,
        invoiceNo: command.invoiceNo ?? null,
        note: command.note ?? null,
        declaredBy: actor,
        at: this.now(),
      });
    } catch (error) {
      /*
       * HAI LAN GUI CUNG MOT PHIEU chay SONG SONG (mang chap chon, hai tab): phep doc `replayOf` o
       * tren khong thay ban kia vi no chua commit; unique `correlationKey` thi thay. Doc lai: cung
       * noi dung la lan gui lai cua CHINH phieu vua ghi — tra ve no, khong bao loi cho mot viec da
       * thanh cong. Khac noi dung thi `assertSameEntry` nem dung `FUEL_CORRELATION_KEY_REUSED`.
       */
      if (!isCorrelationKeyConflict(error)) throw error;
      const converged = await this.replayOf(correlationKey, identity);
      if (!converged) throw error;
      return converged;
    }

    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel_entry.submit',
      outcome: 'allowed',
      reason: 'FUEL_ENTRY_RECORDED',
      detail: {
        fuelEntryId: entry.id,
        tripId: entry.tripId,
        runId: entry.runId,
        legId: entry.legId,
        businessDate,
        reviewReasons: [...entry.reviewReasons],
      },
    });
    await this.audit.append({
      actor,
      action: 'transport.fuel.entry.submit',
      entityType: 'TransportFuelEntry',
      entityId: entry.id,
      after: entry,
    });
    return entry;
  }

  /* -------------------- Bang chung -------------------- */

  /**
   * GAN ANH CHUNG TU. Cho phep ca sau khi duyet, CHAN sau khi ky doi soat da dong.
   *
   * Them mot tam anh khong doi mot con so nao, nen `GD-10` khong cham toi no — mot ke toan tim
   * duoc anh phieu goc sau khi da duyet van nen gan duoc vao. Nhung mot ky DA DONG thi khoa hoan
   * toan (`GD-11`): sau do bo chung tu cua ky la sua thu da bao cao ra ngoai.
   */
  async attachEvidence(
    entryId: string,
    command: AttachFuelEvidenceCommand,
    actor: string,
  ): Promise<FuelReceiptEvidenceView> {
    const entry = await this.requireEntry(entryId);
    if (entry.reconciliationStatus === 'SETTLED') {
      this.denyAmend(entry, 'FUEL_ENTRY_AMEND_RECONCILIATION_LOCKED');
    }

    /*
     * DINH VI DUOC KIEM LUC GHI, khong chi luc doc — `#295` Lane V.
     *
     * `attachFuelEvidenceSchema` nhan mot chuoi tu 1 den 500 ky tu, va truoc lan sua nay chuoi do
     * di THANG xuong kho. Cong duy nhat kiem no la `TransportEvidenceService.read()`, tuc luc AI DO
     * MO anh ra — nen mot dinh vi tro ra ngoai khu bang chung van NAM DUOC trong bang, va chi lo ra
     * o lan doc dau tien, o mot ngu canh khac han, voi mot nguoi khac han.
     *
     * Cung mot luat va cung mot ma voi duong doc: mot cai cua, hai phia, khong hai cach tra loi.
     */
    if (!isTransportEvidenceLocator(command.locator)) {
      throw TransportDomainError.denied(
        'EVIDENCE_LOCATOR_OUT_OF_SCOPE',
        'Dinh vi nay khong thuoc khu bang chung van tai',
      );
    }

    const evidence = await this.repository.addEvidence({
      fuelEntryId: entry.id,
      locator: command.locator,
      contentType: command.contentType ?? null,
      byteSize: command.byteSize ?? null,
      capturedAt: command.capturedAt ? this.parseInstant(command.capturedAt) : null,
      uploadedBy: actor,
      at: this.now(),
      // Cong o tren doc trang thai roi buong; cong nay di THEO lenh ghi (T4R §4). Mot lenh dong ky
      // chen vao giua hai buoc se lam tam anh nay rot vao mot ky DA BAO CAO RA NGOAI.
      forbiddenReconciliationStatuses: EVIDENCE_FROZEN_FUEL_RECONCILIATION_STATUSES,
    });
    if (!evidence) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_FUEL_DECISIONS,
        point: 'fuel_entry.amend',
        outcome: 'denied',
        reason: 'FUEL_ENTRY_AMEND_STATE_RACE',
        detail: { fuelEntryId: entry.id, evidence: true },
      });
      throw TransportDomainError.conflict(
        'FUEL_ENTRY_AMEND_STATE_RACE',
        `Ky doi soat cua phieu ${entryId} vua duoc dong — tai lai roi doc lai`,
      );
    }
    await this.audit.append({
      actor,
      action: 'transport.fuel.evidence.attach',
      entityType: 'TransportFuelReceiptEvidence',
      entityId: evidence.id,
      after: evidence,
    });
    // Dau vet o tren giu NGUYEN `locator` — no la thu lan vet duoc mot tam anh ve dung tep. Cai ra
    // toi trinh duyet thi khong: xem `FuelReceiptEvidenceView`.
    return toFuelReceiptEvidenceView(evidence);
  }

  /**
   * GO MOT BANG CHUNG DA TAI NHAM — #222 P1-C.
   *
   * ===========================================================================
   * BON BUOC, VA THU TU CUA CHUNG LA CA NOI DUNG CUA TINH NANG
   *
   * ```text
   * 1. doc phieu, chay cong vong doi  -> tu choi som, kem LY DO CO MA
   * 2. bia mo hang trong mot giao dich da khoa hang phieu (cong THU HAI, luc ghi)
   * 3. ghi dau vet KIEM TOAN
   * 4. don byte o kho anh   (ben goi lam, sau khi ham nay tra ve)
   * ```
   *
   * Buoc 2 truoc buoc 4 chu khong nguoc lai. Neu don byte truoc, mot lan tu choi o buoc 2 (vi ai do
   * vua duyet phieu) se de lai mot phieu `VERIFIED` co dong bang chung tro toi mot object DA MAT —
   * ke toan mo ra thay "khong con tep", va khong ai biet vi sao.
   *
   * ===========================================================================
   * SERVICE NAY KHONG KIEM QUYEN SO HUU
   *
   * Cung khuon `attachEvidence`: pham vi "phieu cua chinh toi" co DUNG MOT cau tra loi trong he
   * thong (`FuelReadService.getMyFuelSlip`), va controller goi no TRUOC. Viet mot phep kiem thu hai
   * o day se tao ra hai luat de lech nhau.
   */
  async withdrawEvidence(
    entryId: string,
    evidenceId: string,
    actor: string,
  ): Promise<FuelReceiptEvidence> {
    const entry = await this.requireEntry(entryId);

    const decision = evaluateFuelEvidenceRemoval(
      entry.verificationStatus,
      entry.reconciliationStatus,
    );
    if (!decision.allowed) this.denyEvidenceWithdrawal(entry, decision.reason);

    const outcome = await this.repository.withdrawEvidence({
      fuelEntryId: entry.id,
      evidenceId,
      actor,
      at: this.now(),
      // Cong o tren doc trang thai roi buong; cong nay di THEO lenh ghi (T4R §4).
      forbiddenVerificationStatuses: ['VERIFIED'],
      forbiddenReconciliationStatuses: REMOVAL_BLOCKING_FUEL_RECONCILIATION_STATUSES,
    });

    if (outcome.kind === 'ENTRY_NOT_FOUND') {
      throw TransportDomainError.notFound(
        'FUEL_ENTRY_NOT_FOUND',
        `Khong tim thay phieu ${entryId}`,
      );
    }
    if (outcome.kind === 'EVIDENCE_NOT_FOUND') {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_FUEL_DECISIONS,
        point: 'fuel_entry.evidence_withdraw',
        outcome: 'denied',
        reason: 'FUEL_EVIDENCE_NOT_FOUND',
        detail: { fuelEntryId: entry.id, evidenceId },
      });
      throw TransportDomainError.notFound(
        'FUEL_EVIDENCE_NOT_FOUND',
        `Phieu ${entryId} khong co bang chung ${evidenceId}`,
      );
    }
    if (outcome.kind === 'ALREADY_WITHDRAWN') {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_FUEL_DECISIONS,
        point: 'fuel_entry.evidence_withdraw',
        outcome: 'denied',
        reason: 'FUEL_EVIDENCE_ALREADY_WITHDRAWN',
        detail: { fuelEntryId: entry.id, evidenceId },
      });
      throw TransportDomainError.conflict(
        'FUEL_EVIDENCE_ALREADY_WITHDRAWN',
        'Chung tu nay da duoc go truoc do — tai lai trang de doc trang thai moi',
      );
    }
    if (outcome.kind === 'STATE_RACE') {
      // Trang thai DOI giua luc doc va luc ghi. Chay lai chinh cong vong doi tren gia tri DOC TU
      // HANG DA KHOA, nen ly do bao ra la ly do THAT chu khong phai mot cau chung chung.
      const raced = evaluateFuelEvidenceRemoval(outcome.verification, outcome.reconciliation);
      this.denyEvidenceWithdrawal(
        {
          id: entry.id,
          verificationStatus: outcome.verification,
          reconciliationStatus: outcome.reconciliation,
        },
        raced.allowed ? 'EVIDENCE_ENTRY_RECONCILIATION_LOCKED' : raced.reason,
      );
    }

    await this.audit.append({
      actor,
      action: 'transport.fuel.evidence.withdraw',
      entityType: 'TransportFuelReceiptEvidence',
      entityId: outcome.evidence.id,
      // CA HAI phia: `before` giu ban con hieu luc, `after` giu ban da bia mo. Mot dau vet chi co
      // `after` khong tra loi duoc "cai gi vua bien mat khoi ho so nay".
      before: { ...outcome.evidence, withdrawnAt: null, withdrawnBy: null },
      after: outcome.evidence,
    });

    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel_entry.evidence_withdraw',
      outcome: 'allowed',
      reason: 'FUEL_EVIDENCE_WITHDRAWN',
      detail: { fuelEntryId: entry.id, evidenceId: outcome.evidence.id },
    });
    return outcome.evidence;
  }

  private denyEvidenceWithdrawal(
    entry: Pick<FuelEntry, 'id' | 'verificationStatus' | 'reconciliationStatus'>,
    reason: FuelEvidenceRemovalDeniedReason,
  ): never {
    // `EVIDENCE_ENTRY_*` (tu vung vong doi) -> `FUEL_EVIDENCE_ENTRY_*` (tu vung loi HTTP). Hai bo
    // ma song song CO Y: mot bo thuoc may trang thai thuan, mot bo thuoc bien gioi loi cua mien.
    const code =
      reason === 'EVIDENCE_ENTRY_ALREADY_TRUSTED'
        ? 'FUEL_EVIDENCE_ENTRY_ALREADY_TRUSTED'
        : 'FUEL_EVIDENCE_ENTRY_RECONCILIATION_LOCKED';
    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel_entry.evidence_withdraw',
      outcome: 'denied',
      reason: code,
      detail: {
        fuelEntryId: entry.id,
        verificationStatus: entry.verificationStatus,
        reconciliationStatus: entry.reconciliationStatus,
      },
    });
    throw TransportDomainError.conflict(
      code,
      code === 'FUEL_EVIDENCE_ENTRY_ALREADY_TRUSTED'
        ? 'Phieu da duoc xac thuc nen chung tu cua no khong go duoc nua'
        : 'Phieu da khop bang ke hoac ky doi soat da dong nen chung tu khong go duoc nua',
    );
  }

  /* ---------------------- Sua phieu ---------------------- */

  async amendFuelEntry(
    entryId: string,
    command: AmendFuelEntryCommand,
    actor: string,
  ): Promise<FuelEntry> {
    const entry = await this.requireEntry(entryId);

    const decision = evaluateFuelEntryAmendment(
      entry.verificationStatus,
      entry.reconciliationStatus,
    );
    if (!decision.allowed) {
      this.denyAmend(
        entry,
        decision.reason === 'ENTRY_ALREADY_TRUSTED'
          ? 'FUEL_ENTRY_AMEND_ALREADY_TRUSTED'
          : 'FUEL_ENTRY_AMEND_RECONCILIATION_LOCKED',
      );
    }

    // `#364` — cung cong voi luc nop: phieu Run-first khong mang tien mat lai xe ung.
    if (entry.tripId === null && command.paymentMethod === 'DRIVER_CASH') {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_FUEL_DECISIONS,
        point: 'fuel_entry.amend',
        outcome: 'denied',
        reason: 'FUEL_ENTRY_DRIVER_CASH_REQUIRES_LEGACY_TRIP',
        detail: { fuelEntryId: entry.id, runId: entry.runId },
      });
      throw TransportDomainError.denied(
        'FUEL_ENTRY_DRIVER_CASH_REQUIRES_LEGACY_TRIP',
        decisionReasonLabel('FUEL_ENTRY_DRIVER_CASH_REQUIRES_LEGACY_TRIP'),
      );
    }

    const businessDate = this.businessDate(command.businessDate);
    const occurredAt = this.parseInstant(command.occurredAt);
    const litersUnits = this.parseLiters(command.liters);
    const amount = this.parseAmount(command.amount);
    const odometerKm = this.parseOdometer(command.odometerKm);
    const supplier = await this.requireSupplier(command.supplierId);
    const stationId = await this.requireStation({
      stationId: command.stationId ?? null,
      supplierId: supplier.id,
      point: 'fuel_entry.amend',
      previousStationId: entry.stationId,
    });
    const vehicle = await this.core.findVehicle(entry.vehicleId);

    const consumption = await this.measureConsumption({
      vehicleId: entry.vehicleId,
      vehicleClass: vehicle?.vehicleClass ?? '',
      businessDate,
      occurredAt,
      litersUnits,
      odometerKm,
      // Bo chinh phieu dang sua ra khoi phep tim odo truoc, neu khong no se lay chinh minh lam moc.
      excludeEntryId: entry.id,
    });

    const updated = await this.repository.amendEntry(
      entry.id,
      // Cong ma tang mien vua mo o tren duoc GAN VAO LENH GHI (T4R §4). Kiem hai lan nghe thua,
      // nhung lan kiem o tren tra ve mot ly do tu choi CO MA cho nguoi dung, con lan kiem duoi day
      // la thu duy nhat con dung khi mot lenh duyet chen vao giua hai buoc.
      {
        verification: 'DECLARED',
        lockedReconciliation: LOCKED_FUEL_RECONCILIATION_STATUSES,
      },
      {
        litersUnits,
        amount,
        odometerKm,
        previousOdometerKm: consumption.previousOdometerKm,
        consumptionUnits: consumption.consumptionUnits,
        reviewReasons: consumption.reviewReasons,
        businessDate,
        occurredAt,
        supplierId: supplier.id,
        stationId,
        paymentMethod: command.paymentMethod,
        invoiceNo: command.invoiceNo ?? null,
        note: command.note ?? null,
        at: this.now(),
      },
    );
    if (!updated) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_FUEL_DECISIONS,
        point: 'fuel_entry.amend',
        outcome: 'denied',
        reason: 'FUEL_ENTRY_AMEND_STATE_RACE',
        detail: { fuelEntryId: entry.id },
      });
      throw TransportDomainError.conflict(
        'FUEL_ENTRY_AMEND_STATE_RACE',
        `Phieu ${entryId} vua duoc nguoi khac duyet hoac khop — tai lai roi doc lai`,
      );
    }

    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel_entry.amend',
      outcome: 'allowed',
      reason: 'FUEL_ENTRY_AMENDED',
      detail: { fuelEntryId: updated.id, businessDate },
    });
    await this.audit.append({
      actor,
      action: 'transport.fuel.entry.amend',
      entityType: 'TransportFuelEntry',
      entityId: updated.id,
      before: entry,
      after: updated,
    });
    return updated;
  }

  /* ---------------------- Duyet / tra lai ---------------------- */

  /**
   * DUYET mot phieu, roi day chi phi vao gia thanh chuyen — THEO DUNG THU TU DO.
   *
   * ---------------------------------------------------------------------------
   * THU TU NAY LA MOT LUA CHON, va day la ly do:
   *
   * Hai buoc (doi trang thai, ghi khoan chi) khong nam trong mot giao dich duoc — chung o hai
   * capability va di qua hai kho khac nhau. Nen phai chon xem mot lan chet o giua de lai trang
   * thai nao:
   *
   *   · duyet TRUOC   -> phieu `VERIFIED` chua co chi phi. Doc ra duoc bang mot cau truy van
   *                      (`verificationStatus = 'VERIFIED' AND costExpenseId IS NULL`), va SUA
   *                      duoc bang cach goi lai chinh lenh nay;
   *   · ghi chi TRUOC -> mot khoan chi cua mot phieu chua ai duyet. Tien da vao gia thanh chuyen
   *                      cho mot chung tu ma ke toan chua tin, va duong sua duy nhat la mot but
   *                      toan dao.
   *
   * Cai thu nhat la THIEU mot con so va tu sua duoc; cai thu hai la mot con so SAI da vao so sach.
   * Nen: duyet truoc.
   *
   * ---------------------------------------------------------------------------
   * VA VI VAY LENH NAY PHAI CHAY LAI DUOC.
   *
   * Goi `verify` tren mot phieu DA `VERIFIED` nhung chua co chi phi KHONG bao loi — no di tiep va
   * hoan tat phan con thieu. Do la duong sua cho ket cuc thu nhat o tren. Khi phieu da co du ca
   * hai, lenh tra lai nguyen trang kem ma `FUEL_COST_ALREADY_POSTED`.
   */
  async verifyFuelEntry(entryId: string, actor: string): Promise<FuelEntry> {
    const entry = await this.requireEntry(entryId);

    let verified = entry;
    if (entry.verificationStatus !== 'VERIFIED') {
      const moved = await this.repository.setEntryVerification(entry.id, 'DECLARED', {
        to: 'VERIFIED',
        actor,
        reviewNote: null,
        at: this.now(),
      });
      // Khong o `DECLARED` va cung khong o `VERIFIED` (da loai o tren) => `REJECTED`, hoac mot
      // phien khac vua doi. Ca hai deu la "may trang thai khong co canh nay".
      if (!moved) this.denyReview(entry, 'FUEL_ENTRY_REVIEW_TRANSITION_NOT_PERMITTED');

      verified = moved;
      this.telemetry?.decision({
        vocabulary: TRANSPORT_FUEL_DECISIONS,
        point: 'fuel_entry.review',
        outcome: 'allowed',
        reason: 'FUEL_ENTRY_VERIFIED',
        detail: { fuelEntryId: verified.id },
      });
      await this.audit.append({
        actor,
        action: 'transport.fuel.entry.verify',
        entityType: 'TransportFuelEntry',
        entityId: verified.id,
        before: entry,
        after: verified,
      });
    }

    return this.postFuelCost(verified, actor);
  }

  async rejectFuelEntry(entryId: string, reason: string, actor: string): Promise<FuelEntry> {
    const entry = await this.requireEntry(entryId);
    const moved = await this.repository.setEntryVerification(entry.id, 'DECLARED', {
      to: 'REJECTED',
      actor,
      reviewNote: reason,
      at: this.now(),
    });
    if (!moved) this.denyReview(entry, 'FUEL_ENTRY_REVIEW_TRANSITION_NOT_PERMITTED');

    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel_entry.review',
      outcome: 'denied',
      reason: 'FUEL_ENTRY_REJECTED',
      detail: { fuelEntryId: moved.id, reason },
    });
    await this.audit.append({
      actor,
      action: 'transport.fuel.entry.reject',
      entityType: 'TransportFuelEntry',
      entityId: moved.id,
      before: entry,
      after: moved,
    });
    return moved;
  }

  /** Phieu bi tra lai duoc nop lai de duyet — `REJECTED -> DECLARED` (T1 §7.4). */
  async resubmitFuelEntry(entryId: string, actor: string): Promise<FuelEntry> {
    const entry = await this.requireEntry(entryId);
    const moved = await this.repository.setEntryVerification(entry.id, 'REJECTED', {
      to: 'DECLARED',
      actor,
      reviewNote: null,
      at: this.now(),
    });
    if (!moved) this.denyReview(entry, 'FUEL_ENTRY_REVIEW_TRANSITION_NOT_PERMITTED');

    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel_entry.review',
      outcome: 'allowed',
      reason: 'FUEL_ENTRY_REVIEW_REOPENED',
      detail: { fuelEntryId: moved.id },
    });
    return moved;
  }

  /* ---------------------------- Noi bo ---------------------------- */

  /**
   * DAY CHI PHI SANG `TX-03` — mot lan, va chi mot lan.
   *
   * Hai lop chan dem hai lan, moi lop mot kieu hong khac nhau:
   *   · `fuelCostCorrelationKey(entry.id)` — khoa tat dinh o `CostingService`, chan mot lan GOI LAP;
   *   · `attachCostExpense` chi ghi khi cot con `NULL` — chan mot lan GAN SAI.
   */
  private async postFuelCost(entry: FuelEntry, actor: string): Promise<FuelEntry> {
    /*
     * `#364` — MOT PHIEU, MOT SO CAI PHAN BO, chon theo `tripId`:
     *
     *   co chuyen v1   -> `TransportTripExpense` qua `TX-03` (duong CU ben duoi, khong doi gi)
     *   khong chuyen   -> `TransportFuelCostAttribution`, do ke toan QUYET rieng
     *
     * Phieu Run-first vi vay KHONG vao `TX-03` o day, va KHONG tu phan bo 100% vao vong chay chi vi
     * no co ngu canh vong chay (`OWNER_DECISIONS_2026_09_22`). Hai so cai khong bao gio cung giu mot
     * phieu — trigger `transport_fuel_cost_attribution_guard` chan phia kia o tang CSDL.
     */
    if (entry.tripId === null) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_FUEL_DECISIONS,
        point: 'fuel.cost_posting',
        outcome: 'allowed',
        reason: 'FUEL_COST_AWAITS_ATTRIBUTION',
        detail: { fuelEntryId: entry.id, runId: entry.runId, legId: entry.legId },
      });
      return entry;
    }

    if (entry.costExpenseId !== null) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_FUEL_DECISIONS,
        point: 'fuel.cost_posting',
        outcome: 'allowed',
        reason: 'FUEL_COST_ALREADY_POSTED',
        detail: { fuelEntryId: entry.id, expenseId: entry.costExpenseId },
      });
      return entry;
    }

    const fundedBy = fundingSourceFor(entry.paymentMethod);
    const expenseId = await this.costing.postFuelCost(
      {
        tripId: entry.tripId,
        driverId: fundedBy === 'DRIVER_FUND' ? entry.driverId : null,
        amount: entry.amount,
        businessDate: entry.businessDate,
        fundedBy,
        evidenceLocator: null,
        note: `Phieu do dau ${entry.id}`,
        correlationKey: fuelCostCorrelationKey(entry.id),
      },
      actor,
    );

    const attached = await this.repository.attachCostExpense(entry.id, expenseId);
    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel.cost_posting',
      outcome: 'allowed',
      reason: attached ? 'FUEL_COST_POSTED' : 'FUEL_COST_ALREADY_POSTED',
      detail: { fuelEntryId: entry.id, expenseId, fundedBy },
    });
    // `attached === null` = mot phien khac vua gan xong. Doc lai de tra ve su that hien tai thay vi
    // ban da cu dang cam trong tay.
    return attached ?? (await this.requireEntry(entry.id));
  }

  /**
   * TIEU HAO + LY DO CAN KIEM TRA — `INV-06` va VT-046 gap nhau o day.
   *
   * Hai nguon `reviewReason` khac nhau: mot tu phep tinh (`computeConsumption`), mot tu dinh muc
   * cua goi khach. Gop o mot cho de duong nop va duong sua khong tinh ra hai bo khac nhau.
   */
  private async measureConsumption(input: {
    vehicleId: string;
    vehicleClass: string;
    businessDate: string;
    occurredAt: Date;
    litersUnits: number;
    odometerKm: number;
    excludeEntryId?: string;
  }): Promise<{
    previousOdometerKm: number | null;
    consumptionUnits: number | null;
    reviewReasons: FuelReviewReason[];
  }> {
    const previousOdometerKm = await this.repository.findPreviousOdometer({
      vehicleId: input.vehicleId,
      businessDate: input.businessDate,
      occurredAt: input.occurredAt,
      ...(input.excludeEntryId ? { excludeEntryId: input.excludeEntryId } : {}),
    });

    const measured = computeConsumption({
      litersUnits: input.litersUnits,
      odometerKm: input.odometerKm,
      previousOdometerKm,
    });
    const reviewReasons = [...measured.reviewReasons];

    if (
      exceedsConsumptionNorm(
        measured.consumptionUnits,
        consumptionNormFor(this.policy, input.vehicleClass),
        this.policy.consumption.tolerancePercent,
      )
    ) {
      reviewReasons.push('CONSUMPTION_ABOVE_NORM');
    }

    return { previousOdometerKm, consumptionUnits: measured.consumptionUnits, reviewReasons };
  }

  private guardTripAcceptsFuel(trip: FuelTripFacts): void {
    const denial =
      trip.kind === 'EXTERNAL_CARRIER'
        ? ('FUEL_ENTRY_TRIP_OUTSOURCED' as const)
        : trip.status === 'RECONCILED'
          ? ('FUEL_ENTRY_TRIP_RECONCILED' as const)
          : trip.status === 'CANCELLED'
            ? ('FUEL_ENTRY_TRIP_CANCELLED' as const)
            : null;
    if (!denial) return;

    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel_entry.submit',
      outcome: 'denied',
      reason: denial,
      detail: { tripId: trip.id, kind: trip.kind, status: trip.status },
    });
    throw TransportDomainError.denied(
      denial,
      `Chuyen ${trip.code} khong nhan phieu do dau (${denial})`,
    );
  }

  /**
   * LAI XE VA XE deu phai TUNG duoc phan cong vao chuyen do.
   *
   * Cung ly le voi `DA-T3-04` cua T3, va o T4 con chat hon mot bac: mot phieu dau ghi nham xe lam
   * sai CA gia thanh chuyen LAN so lieu tieu hao cua xe do — con so ma VT-046 dung de canh bao ky
   * thuat. Mot lan go nham bien so se de lai mot xe "ngon dau bat thuong" khong ai giai thich duoc.
   */
  private async requireAssignedToTrip(
    trip: FuelTripFacts,
    driverId: string,
    vehicleId: string,
  ): Promise<void> {
    if (!(await this.core.wasDriverEverAssignedToTrip(trip.id, driverId))) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_FUEL_DECISIONS,
        point: 'fuel_entry.submit',
        outcome: 'denied',
        reason: 'FUEL_ENTRY_DRIVER_NOT_ASSIGNED',
        detail: { tripId: trip.id, driverId },
      });
      throw TransportDomainError.denied(
        'FUEL_ENTRY_DRIVER_NOT_ASSIGNED',
        `Lai xe ${driverId} chua tung duoc phan cong vao chuyen ${trip.code}`,
      );
    }

    if (!(await this.core.wasVehicleEverAssignedToTrip(trip.id, vehicleId))) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_FUEL_DECISIONS,
        point: 'fuel_entry.submit',
        outcome: 'denied',
        reason: 'FUEL_ENTRY_VEHICLE_NOT_ASSIGNED',
        detail: { tripId: trip.id, vehicleId },
      });
      throw TransportDomainError.denied(
        'FUEL_ENTRY_VEHICLE_NOT_ASSIGNED',
        `Xe ${vehicleId} chua tung duoc phan cong vao chuyen ${trip.code}`,
      );
    }
  }

  /**
   * NGU CANH cua lenh nop — `#364`. Tra ve MOT trong hai hinh dang DA CHUNG MINH, hoac nem mot ly
   * do CO MA. Khong nhanh nao tin `vehicleId`/`runId`/`legId` chi vi client gui len.
   *
   * ===========================================================================
   * NHANH VONG CHAY KHONG GIU KHOA VONG CHAY — va do la co y
   *
   * Moi dieu duoc kiem o day KHONG DOI sau khi tao: `vehicleId` cua vong chay, `runId` cua chang,
   * va lich su phan cong (chi them — "tung" duoc phan cong thi mai mai "tung"). Khong co trang
   * thai nao de mot lenh khac doi giua luc doc va luc ghi, nen khong co cua so nao can
   * `underRunLock` dong lai.
   *
   * CO Y KHONG chan theo TRANG THAI vong chay/chang (`COMPLETED`/`CANCELLED`): lan do dau la mot su
   * that da xay ra. Mot lan do dau trong mot vong chay sau do bi huy van la lan do dau cua vong
   * chay do, va mot phieu khai MUON sau khi vong chay xong van la phieu cua vong chay do. Chan theo
   * trang thai se day nhung su that nay ra khoi he thong — ma ngu canh khong sinh ra tien nao
   * (phan bo la mot quyet dinh RIENG cua ke toan, `FuelCostAttributionService`).
   */
  private async resolveContext(command: SubmitFuelEntryCommand): Promise<ResolvedFuelContext> {
    const tripId = command.tripId ?? null;
    const runId = command.runId ?? null;
    const legId = command.legId ?? null;

    if (tripId !== null && (runId !== null || legId !== null)) {
      this.denySubmit('FUEL_ENTRY_CONTEXT_CONFLICT', { tripId, runId, legId });
    }

    if (tripId !== null) {
      const trip = await this.requireTrip(tripId);
      this.guardTripAcceptsFuel(trip);
      if (!command.vehicleId) {
        throw TransportDomainError.invalid(
          'FUEL_ENTRY_VEHICLE_REQUIRED',
          `Phieu theo chuyen ${trip.code} phai ghi ro xe`,
        );
      }
      return { kind: 'LEGACY_TRIP', trip, vehicleId: command.vehicleId };
    }

    if (runId === null) {
      // Chang ma khong vong chay: chang do khong the thuoc vong chay (vang mat) cua phieu.
      if (legId !== null) this.denySubmit('FUEL_ENTRY_LEG_NOT_IN_RUN', { legId, runId: null });
      this.denySubmit('FUEL_ENTRY_CONTEXT_REQUIRED', { driverId: command.driverId });
    }

    const run = await this.runs.findRun(runId);
    if (!run) this.denySubmit('FUEL_ENTRY_RUN_NOT_FOUND', { runId });

    if (command.vehicleId && command.vehicleId !== run.vehicleId) {
      this.denySubmit('FUEL_ENTRY_VEHICLE_NOT_RUN_VEHICLE', {
        runId: run.id,
        vehicleId: command.vehicleId,
        runVehicleId: run.vehicleId,
      });
    }

    let leg: FuelLegFacts | null = null;
    if (legId !== null) {
      leg = await this.runs.findLeg(legId);
      if (!leg || leg.runId !== run.id) {
        this.denySubmit('FUEL_ENTRY_LEG_NOT_IN_RUN', { runId: run.id, legId });
      }
    }

    if (command.paymentMethod === 'DRIVER_CASH') {
      this.denySubmit('FUEL_ENTRY_DRIVER_CASH_REQUIRES_LEGACY_TRIP', { runId: run.id });
    }

    return { kind: 'RUN', run, leg, vehicleId: run.vehicleId };
  }

  /**
   * LAI XE phai TUNG duoc phan cong vao vong chay — cung ly le voi `requireAssignedToTrip`.
   *
   * KHONG co cong "xe tung duoc phan cong" nhu nhanh chuyen v1: xe cua phieu Run-first LA xe cua
   * vong chay (`resolveContext`), nen cau hoi do da duoc tra loi bang cau truc.
   */
  private async requireAssignedToRun(run: FuelRunFacts, driverId: string): Promise<void> {
    if (await this.runs.wasDriverEverAssignedToRun(run.id, driverId)) return;
    this.denySubmit('FUEL_ENTRY_DRIVER_NOT_ASSIGNED_TO_RUN', { runId: run.id, driverId });
  }

  /**
   * PHAT LAI — `null` khi khoa chua duoc dung; phieu cu khi CUNG noi dung; nem khi KHAC noi dung.
   *
   * Mot ham cho ca hai cho goi: lan doc truoc khi ghi, va lan doc lai sau khi unique cua kho bat
   * duoc mot lan gui song song. Hai cho mot luat — khong the lech nhau.
   */
  private async replayOf(
    correlationKey: string,
    identity: FuelEntryIdentity,
  ): Promise<FuelEntry | null> {
    const replay = await this.repository.findEntryByCorrelation(correlationKey);
    if (!replay) return null;
    this.assertSameEntry(replay, identity);
    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel_entry.submit',
      outcome: 'allowed',
      reason: 'FUEL_ENTRY_IDEMPOTENT_REPLAY',
      detail: { correlationKey, fuelEntryId: replay.id },
    });
    return replay;
  }

  /** Tu choi lenh nop voi MOT ly do co ma — `RUN_NOT_FOUND` la 404, moi ma con lai la 403. */
  private denySubmit(
    reason: FuelEntrySubmitReason,
    detail: Readonly<Record<string, unknown>>,
  ): never {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel_entry.submit',
      outcome: 'denied',
      reason,
      detail,
    });
    const message = decisionReasonLabel(reason);
    throw reason === 'FUEL_ENTRY_RUN_NOT_FOUND'
      ? TransportDomainError.notFound(reason, message)
      : TransportDomainError.denied(reason, message);
  }

  private async requireTrip(tripId: string): Promise<FuelTripFacts> {
    const trip = await this.core.findTrip(tripId);
    if (!trip) {
      throw TransportDomainError.notFound('TRIP_NOT_FOUND', `Khong tim thay chuyen ${tripId}`);
    }
    return trip;
  }

  private async requireSupplier(supplierId: string): Promise<FuelSupplier> {
    const supplier = await this.repository.findSupplier(supplierId);
    if (!supplier) {
      throw TransportDomainError.notFound(
        'FUEL_SUPPLIER_NOT_FOUND',
        `Khong tim thay cay xang ${supplierId}`,
      );
    }
    return supplier;
  }

  /**
   * TRAM TREN TO KHAI — `#317` G1. Tra ve `stationId` da kiem, hoac `null` khi khong khai.
   *
   * BA cong, BA ma:
   *   · khong ton tai                       -> `FUEL_STATION_NOT_FOUND` (404);
   *   · thuoc nha cung cap KHAC phieu       -> `FUEL_ENTRY_STATION_SUPPLIER_MISMATCH` (403);
   *   · da ngung hop tac (`INACTIVE`)       -> `FUEL_ENTRY_STATION_INACTIVE` (403).
   *
   * Cong thu ba CHI ap khi tram DOI (`previousStationId`): sua mot phieu cu dang tro toi mot tram vua
   * ngung hop tac khong duoc bi chan chi vi nguoi sua dong vao so lit. Doi SANG mot tram ngung hop tac
   * thi van bi chan.
   *
   * Pham vi TENANT o day la cau truc (mot stack mot CSDL); pham vi VAI la cua controller. Ham nay giu
   * pham vi con lai: mot to khai khong tro duoc toi dia diem cua mot nha cung cap khac.
   */
  private async requireStation(input: {
    readonly stationId: string | null;
    readonly supplierId: string;
    readonly point: 'fuel_entry.submit' | 'fuel_entry.amend';
    readonly previousStationId: string | null;
  }): Promise<string | null> {
    if (input.stationId === null) return null;

    const station = await this.stations.findStation(input.stationId);
    if (!station) {
      throw TransportDomainError.notFound(
        'FUEL_STATION_NOT_FOUND',
        `Khong tim thay cay xang ${input.stationId}`,
      );
    }

    const denial =
      station.supplierId !== input.supplierId
        ? ('FUEL_ENTRY_STATION_SUPPLIER_MISMATCH' as const)
        : station.status !== 'ACTIVE' && station.id !== input.previousStationId
          ? ('FUEL_ENTRY_STATION_INACTIVE' as const)
          : null;
    if (denial === null) return station.id;

    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: input.point,
      outcome: 'denied',
      reason: denial,
      detail: {
        stationId: station.id,
        stationSupplierId: station.supplierId,
        supplierId: input.supplierId,
        stationStatus: station.status,
      },
    });
    throw TransportDomainError.denied(
      denial,
      denial === 'FUEL_ENTRY_STATION_SUPPLIER_MISMATCH'
        ? `Cay xang ${station.id} khong thuoc nha cung cap ${input.supplierId} cua phieu`
        : `Cay xang ${station.id} da ngung hop tac — chon mot cay xang dang hoat dong`,
    );
  }

  private async requireEntry(entryId: string): Promise<FuelEntry> {
    const entry = await this.repository.findEntry(entryId);
    if (!entry) {
      throw TransportDomainError.notFound(
        'FUEL_ENTRY_NOT_FOUND',
        `Khong tim thay phieu ${entryId}`,
      );
    }
    return entry;
  }

  private denyAmend(
    entry: FuelEntry,
    reason: 'FUEL_ENTRY_AMEND_ALREADY_TRUSTED' | 'FUEL_ENTRY_AMEND_RECONCILIATION_LOCKED',
  ): never {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel_entry.amend',
      outcome: 'denied',
      reason,
      detail: {
        fuelEntryId: entry.id,
        verificationStatus: entry.verificationStatus,
        reconciliationStatus: entry.reconciliationStatus,
      },
    });
    throw TransportDomainError.denied(
      reason,
      reason === 'FUEL_ENTRY_AMEND_ALREADY_TRUSTED'
        ? `Phieu ${entry.id} da duoc duyet — duong dung la dao khoan chi roi ghi phieu moi`
        : `Phieu ${entry.id} da khop hoac ky doi soat da dong — khong sua truc tiep`,
    );
  }

  private denyReview(
    entry: FuelEntry,
    reason: 'FUEL_ENTRY_REVIEW_TRANSITION_NOT_PERMITTED',
  ): never {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel_entry.review',
      outcome: 'denied',
      reason,
      detail: { fuelEntryId: entry.id, verificationStatus: entry.verificationStatus },
    });
    throw TransportDomainError.denied(
      reason,
      `Phieu ${entry.id} dang o ${entry.verificationStatus} — may trang thai duyet khong co canh nay`,
    );
  }

  /**
   * PHAT LAI hay TAI SU DUNG KHOA? Hai chuyen khac han nhau — cung ly le voi `costing.service.ts`.
   *
   * Cung khoa + cung noi dung = mang chap chon, lan gui thu hai cua cung mot phieu. Cung khoa +
   * KHAC noi dung = client dung lai mot khoa cho mot phieu moi, va tra lai ban cu se lam phieu moi
   * bien mat khong dau vet.
   */
  private assertSameEntry(existing: FuelEntry, incoming: FuelEntryIdentity): void {
    const differences = fuelEntityIdentityDifferences(fuelEntryIdentityOf(existing), incoming);
    if (differences.length === 0) return;

    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel_entry.submit',
      outcome: 'denied',
      reason: 'FUEL_CORRELATION_KEY_REUSED',
      detail: { correlationKey: existing.correlationKey, fields: differences },
    });
    throw TransportDomainError.conflict(
      'FUEL_CORRELATION_KEY_REUSED',
      `Khoa chong ghi trung ${existing.correlationKey} da duoc dung cho mot phieu khac — lech: ${differences.join(', ')}`,
    );
  }

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }

  private businessDate(provided?: string): string {
    if (provided === undefined) return toBusinessDate(this.now(), this.corePolicy.timeZone);
    try {
      return assertBusinessDate(provided);
    } catch (error) {
      if (error instanceof BusinessDateError) {
        throw TransportDomainError.invalid('BUSINESS_DATE_INVALID', error.message);
      }
      throw error;
    }
  }

  private parseInstant(value: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw TransportDomainError.invalid(
        'BUSINESS_DATE_INVALID',
        `Khoanh khac tren phieu khong hop le: ${value}`,
      );
    }
    return parsed;
  }

  private parseLiters(value: number | string): number {
    try {
      return litersToUnits(value);
    } catch (error) {
      if (error instanceof FuelQuantityError) {
        throw TransportDomainError.invalid('FUEL_LITERS_INVALID', error.message);
      }
      throw error;
    }
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
        'Phieu do dau 0 dong khong noi gi ve the gioi',
      );
    }
    return amount;
  }

  private parseOdometer(value: number): number {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw TransportDomainError.invalid(
        'FUEL_ODOMETER_INVALID',
        `Odo phai la so nguyen khong am, nhan duoc: ${String(value)}`,
      );
    }
    return value;
  }

  private newCorrelationKey(): string {
    return globalThis.crypto.randomUUID();
  }
}

/**
 * AI TRA TIEN -> nguon tien cua khoan chi o `TX-03`.
 *
 * MOT cho anh xa duy nhat. Rai phep doi nay o hai noi se lam mot duong ghi tru quy lai xe cho mot
 * lan ky so no cay xang — tuc lai xe bi tru tien cho mot khoan cong ty se tra cuoi thang.
 */
const fundingSourceFor = (method: FuelPaymentMethod): ExpenseFundingSource =>
  method === 'DRIVER_CASH' ? 'DRIVER_FUND' : 'COMPANY_DIRECT';

/** Lan ghi vua dam unique `correlationKey` — kho da dich loi do sang ma nay (`createEntry`). */
const isCorrelationKeyConflict = (error: unknown): boolean =>
  error instanceof TransportDomainError && error.reason === 'FUEL_CORRELATION_KEY_REUSED';
