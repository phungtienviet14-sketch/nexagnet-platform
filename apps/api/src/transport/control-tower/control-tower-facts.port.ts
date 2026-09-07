import { Injectable } from '@nestjs/common';
import { OperationalAlertsService } from '../asset-compliance/operational-alerts.service.js';
import { ExpenseClaimService } from '../claims/claim.service.js';
import { FuelRepository } from '../fuel/fuel.repository.js';
import { FleetRepository } from '../fleet/fleet.repository.js';
import { MovementRepository } from '../movement/movement.repository.js';
import type { RunAssignment, RunLeg, VehicleRun } from '../movement/movement.types.js';
import type { OperationalAlertFeed } from '../asset-compliance/operational-alerts.js';
import type { FuelReconciliationState } from '../fuel/fuel-lifecycle.js';
import type { Driver, Vehicle } from '../transport.types.js';

/**
 * CAC CUA SO cua thap dieu hanh. TAT CA deu CHI DOC.
 *
 * ===========================================================================
 * T1 §4.1 luat 4 (`NO_CROSS_CONTEXT_REPOSITORY_WRITE`) — giu bang CAU TRUC.
 *
 * Cung khuon `analytics.ports.ts` va `transport-proof-facts.port.ts`, va cung mot ly do: neu bang
 * dieu hanh duoc tiem thang `MovementRepository`/`FuelRepository` thi mot ngay nao do se co nguoi
 * goi mot ham GHI tu mot ham ten la `board...()`. Khong mot cong nao duoi day co mot ham ghi, nen
 * cau "bang dieu hanh khong bao gio ghi" la mot dieu kien BIEN DICH.
 *
 * ===========================================================================
 * VI SAO CONG LOI (`ControlTowerCoreFacts`) KHONG `@Optional()`.
 *
 * Thap dieu hanh song trong `transport-core`. Khong co vong chay va doi xe thi khong co bang de
 * ve — khong phai mot bang thieu mot muc, ma la khong con bang nao. Ba cong con lai thuoc ba
 * capability khac va deu `@Optional()` o `app-composition.ts`.
 */

/* ------------------------------------------------------------------ *
 * transport-core — BAT BUOC
 * ------------------------------------------------------------------ */

export abstract class ControlTowerCoreFacts {
  abstract listRuns(): Promise<readonly VehicleRun[]>;
  abstract listLegs(runId: string): Promise<readonly RunLeg[]>;
  abstract listRunAssignments(runId: string): Promise<readonly RunAssignment[]>;
  abstract listVehicles(): Promise<readonly Vehicle[]>;
  abstract listDrivers(): Promise<readonly Driver[]>;
}

@Injectable()
export class ControlTowerCoreFactsAdapter extends ControlTowerCoreFacts {
  constructor(
    private readonly movement: MovementRepository,
    private readonly fleet: FleetRepository,
  ) {
    super();
  }

  listRuns(): Promise<readonly VehicleRun[]> {
    return this.movement.listRuns();
  }

  listLegs(runId: string): Promise<readonly RunLeg[]> {
    return this.movement.listLegs(runId);
  }

  listRunAssignments(runId: string): Promise<readonly RunAssignment[]> {
    return this.movement.listRunAssignments(runId);
  }

  listVehicles(): Promise<readonly Vehicle[]> {
    return this.fleet.listVehicles();
  }

  listDrivers(): Promise<readonly Driver[]> {
    return this.fleet.listDrivers();
  }
}

/* ------------------------------------------------------------------ *
 * transport-costing — TUY CHON
 * ------------------------------------------------------------------ */

/**
 * MOT DE NGHI CHI dang cho duyet, thu gon con dung phan bang can.
 *
 * CO Y bo `amount` va moi truong tien: hang viec noi "co N de nghi dang cho ban", khong noi "dang
 * cho ban duyet 4.200.000d". So tien la thu nguoi duyet doc TREN CHINH DE NGHI, sau khi bam vao —
 * dat no len bang se lam mot con so tien di qua mot be mat khong ai kiem soat duoc pham vi.
 */
export interface ControlTowerClaimFact {
  readonly id: string;
  readonly driverId: string;
}

export abstract class ControlTowerClaimFacts {
  abstract listAwaitingReview(): Promise<readonly ControlTowerClaimFact[]>;
}

/**
 * Tiem `ExpenseClaimService`, KHONG `ExpenseClaimRepository`.
 *
 * Khong phai so thich: `TransportCostingModule` chi `exports` cac service, khong export kho de
 * nghi (`transport-costing.module.ts:58-64`). Mot adapter dang ky o TANG UNG DUNG ma tiem kho do
 * se KHONG BOOT duoc o moi khach co bat `transport-costing` — va loi do chi lo ra o bai boot, sau
 * khi `tsc` da xanh. Cung khuon `CostingFundAlertAdapter`, von tiem `CostingReadService`.
 */
@Injectable()
export class ControlTowerClaimFactsAdapter extends ControlTowerClaimFacts {
  constructor(private readonly claims: ExpenseClaimService) {
    super();
  }

  async listAwaitingReview(): Promise<readonly ControlTowerClaimFact[]> {
    const claims = await this.claims.list({ status: 'PENDING_REVIEW' });
    return claims.map((claim) => ({ id: claim.id, driverId: claim.driverId }));
  }
}

/* ------------------------------------------------------------------ *
 * transport-fuel — TUY CHON
 * ------------------------------------------------------------------ */

export interface ControlTowerFuelEntryFact {
  readonly id: string;
  readonly vehicleId: string;
}

/**
 * "KY CON MO" — dinh nghia DUY NHAT, muon nguyen cua `workspace/dashboard.ts`.
 *
 * `CLOSED` la trang thai duy nhat KHONG con la viec. `RESOLVED` van con: khop xong chua phai dong
 * xong, va nguoi dong ky la mot nguoi khac voi nguoi khop.
 */
const OPEN_RECONCILIATION_STATES: ReadonlySet<FuelReconciliationState> = new Set([
  'DRAFT',
  'MATCHING',
  'RESOLVED',
  'REOPENED',
]);

export interface ControlTowerReconciliationFact {
  readonly id: string;
  readonly periodStart: string;
  readonly periodEnd: string;
}

export abstract class ControlTowerFuelFacts {
  /** Phieu do dau dang cho ke toan xac thuc — truc 1 cua `fuel-lifecycle.ts`. */
  abstract listEntriesAwaitingVerification(): Promise<readonly ControlTowerFuelEntryFact[]>;
  /** Ky doi soat con DANG MO — truc 2. `CLOSED` da xong, khong con la viec cua ai. */
  abstract listOpenReconciliations(): Promise<readonly ControlTowerReconciliationFact[]>;
}

@Injectable()
export class ControlTowerFuelFactsAdapter extends ControlTowerFuelFacts {
  constructor(private readonly fuel: FuelRepository) {
    super();
  }

  async listEntriesAwaitingVerification(): Promise<readonly ControlTowerFuelEntryFact[]> {
    const entries = await this.fuel.listEntriesNeedingReview();
    return entries.map((entry) => ({ id: entry.id, vehicleId: entry.vehicleId }));
  }

  async listOpenReconciliations(): Promise<readonly ControlTowerReconciliationFact[]> {
    const reconciliations = await this.fuel.listReconciliations();
    return reconciliations
      .filter((reconciliation) => OPEN_RECONCILIATION_STATES.has(reconciliation.state))
      .map((reconciliation) => ({
        id: reconciliation.id,
        periodStart: reconciliation.periodStart,
        periodEnd: reconciliation.periodEnd,
      }));
  }
}

/* ------------------------------------------------------------------ *
 * transport-asset-compliance — TUY CHON
 * ------------------------------------------------------------------ */

/**
 * BANG CANH BAO da gom san, doc NGUYEN VEN.
 *
 * Thap dieu hanh KHONG tinh lai han giay to hay chu ky bao duong: `OperationalAlertsService` da lam
 * viec do va no thuoc `transport-asset-compliance`. Tinh lai o day se cho ra hai con so cho cung
 * mot cau hoi, va khong ai biet cai nao dung.
 */
export abstract class ControlTowerAlertFacts {
  abstract feed(now?: Date): Promise<OperationalAlertFeed>;
}

@Injectable()
export class ControlTowerAlertFactsAdapter extends ControlTowerAlertFacts {
  constructor(private readonly alerts: OperationalAlertsService) {
    super();
  }

  feed(now?: Date): Promise<OperationalAlertFeed> {
    return this.alerts.feed(now);
  }
}
