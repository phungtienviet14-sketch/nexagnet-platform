import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { BusinessDateError, assertBusinessDate, toBusinessDate } from '../business-date.js';
import type { ExpenseFundingSource } from '../costing/driver-fund-ledger.js';
import { MoneyError, nonNegativeMoney } from '../money.js';
import {
  TRANSPORT_CLOCK,
  TRANSPORT_CORE_POLICY,
  type TransportCorePolicy,
} from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import { TRANSPORT_FUEL_DECISIONS } from './fuel-decisions.js';
import {
  EVIDENCE_FROZEN_FUEL_RECONCILIATION_STATUSES,
  LOCKED_FUEL_RECONCILIATION_STATUSES,
  evaluateFuelEntryAmendment,
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
import type {
  FuelEntry,
  FuelPaymentMethod,
  FuelReceiptEvidence,
  FuelSupplier,
} from './fuel.types.js';

export interface SubmitFuelEntryCommand {
  readonly tripId: string;
  readonly vehicleId: string;
  readonly driverId: string;
  readonly supplierId: string;
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

/** SUA mot phieu con `DECLARED` — `GD-10`. Cung tap truong voi luc nop, tru danh tinh chuyen/xe. */
export type AmendFuelEntryCommand = Omit<
  SubmitFuelEntryCommand,
  'tripId' | 'vehicleId' | 'driverId' | 'correlationKey'
>;

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
    private readonly core: TransportFuelCoreFacts,
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

    const trip = await this.requireTrip(command.tripId);
    this.guardTripAcceptsFuel(trip);

    const vehicle = await this.core.findVehicle(command.vehicleId);
    if (!vehicle) {
      throw TransportDomainError.notFound(
        'VEHICLE_NOT_FOUND',
        `Khong tim thay xe ${command.vehicleId}`,
      );
    }
    if (!(await this.core.findDriver(command.driverId))) {
      throw TransportDomainError.notFound(
        'DRIVER_NOT_FOUND',
        `Khong tim thay lai xe ${command.driverId}`,
      );
    }
    await this.requireSupplier(command.supplierId);
    await this.requireAssignedToTrip(trip, command.driverId, command.vehicleId);

    const correlationKey = command.correlationKey ?? this.newCorrelationKey();
    const replay = await this.repository.findEntryByCorrelation(correlationKey);
    if (replay) {
      this.assertSameEntry(
        replay,
        fuelEntryIdentityOf({
          tripId: command.tripId,
          vehicleId: command.vehicleId,
          driverId: command.driverId,
          supplierId: command.supplierId,
          businessDate,
          occurredAt,
          litersUnits,
          amount,
          odometerKm,
          paymentMethod: command.paymentMethod,
          invoiceNo: command.invoiceNo,
          note: command.note,
        }),
      );
      this.telemetry?.decision({
        vocabulary: TRANSPORT_FUEL_DECISIONS,
        point: 'fuel_entry.submit',
        outcome: 'allowed',
        reason: 'FUEL_ENTRY_IDEMPOTENT_REPLAY',
        detail: { correlationKey, fuelEntryId: replay.id },
      });
      return replay;
    }

    const consumption = await this.measureConsumption({
      vehicleId: command.vehicleId,
      vehicleClass: vehicle.vehicleClass,
      businessDate,
      occurredAt,
      litersUnits,
      odometerKm,
    });

    const entry = await this.repository.createEntry({
      tripId: command.tripId,
      vehicleId: command.vehicleId,
      driverId: command.driverId,
      supplierId: command.supplierId,
      businessDate,
      occurredAt,
      litersUnits,
      amount,
      odometerKm,
      previousOdometerKm: consumption.previousOdometerKm,
      consumptionUnits: consumption.consumptionUnits,
      reviewReasons: consumption.reviewReasons,
      paymentMethod: command.paymentMethod,
      // Phieu do LAI XE khai KHONG BAO GIO co nguon bang ke — `INV-26` chi chan cac phieu de ra tu
      // mot lan nhap bang ke, va duong do khong di qua ham nay.
      sourceStatementId: null,
      correlationKey,
      invoiceNo: command.invoiceNo ?? null,
      note: command.note ?? null,
      declaredBy: actor,
      at: this.now(),
    });

    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point: 'fuel_entry.submit',
      outcome: 'allowed',
      reason: 'FUEL_ENTRY_RECORDED',
      detail: {
        fuelEntryId: entry.id,
        tripId: entry.tripId,
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
  ): Promise<FuelReceiptEvidence> {
    const entry = await this.requireEntry(entryId);
    if (entry.reconciliationStatus === 'SETTLED') {
      this.denyAmend(entry, 'FUEL_ENTRY_AMEND_RECONCILIATION_LOCKED');
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
    return evidence;
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

    const businessDate = this.businessDate(command.businessDate);
    const occurredAt = this.parseInstant(command.occurredAt);
    const litersUnits = this.parseLiters(command.liters);
    const amount = this.parseAmount(command.amount);
    const odometerKm = this.parseOdometer(command.odometerKm);
    const supplier = await this.requireSupplier(command.supplierId);
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
