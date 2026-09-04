import { Inject, Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { toBusinessDate, type BusinessDate } from '../business-date.js';
import { TRANSPORT_CORE_POLICY, type TransportCorePolicy } from '../transport-policy.js';
import { TRANSPORT_ASSET_COMPLIANCE_DECISIONS } from './asset-compliance-decisions.js';
import {
  TRANSPORT_COMPLIANCE_POLICY,
  type TransportCompliancePolicy,
} from './asset-compliance-policy.js';
import { AssetComplianceCoreFacts } from './asset-compliance.ports.js';
import { AssetComplianceRepository } from './asset-compliance.repository.js';
import type {
  ComplianceAlert,
  ComplianceDocumentType,
  ComplianceSubjectKind,
  EffectiveVehicleState,
  MaintenanceDue,
} from './asset-compliance.types.js';
import { complianceDashboard } from './compliance-alerts.js';
import { resolveEffectiveVehicleState } from './effective-vehicle-state.js';
import { evaluateDue } from './maintenance-schedule.js';

/** Giay to mot chu the PHAI co — VT-011 (xe) va VT-014 (lai xe). */
const REQUIRED_DOCUMENT_TYPES: Readonly<
  Record<Exclude<ComplianceSubjectKind, 'COMPANY'>, readonly ComplianceDocumentType[]>
> = {
  VEHICLE: ['VEHICLE_INSPECTION', 'VEHICLE_INSURANCE', 'VEHICLE_TRANSPORT_BADGE'],
  DRIVER: ['DRIVER_LICENCE'],
};

/** Mot chu the CHUA co ban giay to con hieu luc nao thuoc mot loai bat buoc. */
export interface ComplianceCoverageGap {
  readonly subjectKind: Exclude<ComplianceSubjectKind, 'COMPANY'>;
  readonly subjectId: string;
  readonly documentType: ComplianceDocumentType;
}

/**
 * Duong DOC cua `transport-asset-compliance`.
 *
 * TEP NAY KHONG CO MOT LOI GOI GHI NAO — cung quy uoc voi `fuel-read.service.ts` va
 * `costing-read.service.ts`. Do la cach `NO_REPORTING_AS_BUSINESS_TRUTH` (T1 §16) duoc giu: bao
 * cao khong bao gio la nguon ghi, va cach re nhat de bao dam dieu do la mot tep khong tiem thu gi
 * ghi duoc.
 *
 * HOM NAY den tu dong ho + mui gio tenant, tinh MOT LAN cho moi lan doc. Khong de tung ham tu goi
 * `new Date()`: hai ham goi cach nhau mot phan nghin giay quanh nua dem se cho ra hai "hom nay"
 * khac nhau, va bang canh bao se tu mau thuan voi chinh no.
 */
@Injectable()
export class AssetComplianceReadService {
  constructor(
    private readonly repository: AssetComplianceRepository,
    private readonly core: AssetComplianceCoreFacts,
    @Inject(TRANSPORT_COMPLIANCE_POLICY) private readonly policy: TransportCompliancePolicy,
    @Inject(TRANSPORT_CORE_POLICY) private readonly corePolicy: TransportCorePolicy,
    @Optional() private readonly telemetry?: TelemetryService,
  ) {}

  /** NGAY nghiep vu hom nay theo mui gio tenant (`GD-04`, `INV-25`). */
  today(now: Date = new Date()): BusinessDate {
    return toBusinessDate(now, this.corePolicy.timeZone);
  }

  /** Danh sach lich bao duong — chi doc, khong loc trang thai (giao dien tu quyet hien gi). */
  async listPlans(vehicleId?: string) {
    return this.repository.listPlans(vehicleId);
  }

  /** Lich su lenh sua cua mot xe — VT-063 "lich su sua chua tung xe". */
  async listWorkOrders(vehicleId?: string) {
    return this.repository.listWorkOrders(vehicleId);
  }
  async maintenanceDue(vehicleId?: string, now?: Date): Promise<readonly MaintenanceDue[]> {
    const today = this.today(now);
    const [plans, workOrders, vehicles] = await Promise.all([
      this.repository.listPlans(vehicleId),
      this.repository.listWorkOrders(vehicleId),
      this.core.listVehicles(),
    ]);
    const odoByVehicle = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle.currentOdoKm]));

    return plans
      .filter((plan) => plan.status === 'ACTIVE')
      .map((plan) =>
        evaluateDue(
          plan,
          workOrders,
          odoByVehicle.get(plan.vehicleId) ?? plan.baselineOdoKm,
          today,
          this.policy,
        ),
      );
  }

  async listDocuments() {
    return this.repository.listDocuments();
  }
  async complianceAlerts(now?: Date): Promise<readonly ComplianceAlert[]> {
    const documents = await this.repository.listDocuments();
    return complianceDashboard(documents, this.today(now), this.policy);
  }

  /**
   * Chu the CHUA khai mot loai giay to bat buoc nao do.
   *
   * Cau hoi RIENG voi `complianceAlerts()`, va co y tach: "sap het han" va "chua bao gio khai" doi
   * hai viec khac nhau — mot ben la di gia han, mot ben la di nhap du lieu. Gop vao mot danh sach
   * se lam ca hai deu bi doc luot qua.
   */
  async coverageGaps(): Promise<readonly ComplianceCoverageGap[]> {
    const [documents, vehicles] = await Promise.all([
      this.repository.listDocuments({ status: 'ACTIVE' }),
      this.core.listVehicles(),
    ]);
    const covered = new Set(
      documents.map(
        (doc) => `${doc.subjectKind}\u0000${doc.subjectId ?? ''}\u0000${doc.documentType}`,
      ),
    );

    const gaps: ComplianceCoverageGap[] = [];
    for (const vehicle of vehicles) {
      for (const documentType of REQUIRED_DOCUMENT_TYPES.VEHICLE) {
        if (!covered.has(`VEHICLE\u0000${vehicle.id}\u0000${documentType}`)) {
          gaps.push({ subjectKind: 'VEHICLE', subjectId: vehicle.id, documentType });
        }
      }
    }
    return gaps;
  }

  /**
   * TRANG THAI HIEU LUC cua CA doi xe — T1 §7.2 + §18.2, acceptance 6/7/8/9.
   *
   * Mot lan doc cho ca doi xe chu khong mot vong goi tung xe: bang dieu khien cua Giam doc (VT-070)
   * doc tat ca cung luc, va ba lan truy van la du.
   */
  async effectiveFleetStatus(): Promise<readonly EffectiveVehicleState[]> {
    const [vehicles, workOrders, inTransit] = await Promise.all([
      this.core.listVehicles(),
      this.repository.listWorkOrders(),
      this.core.listInTransitAssignments(),
    ]);

    const ordersByVehicle = new Map<string, typeof workOrders>();
    for (const order of workOrders) {
      const bucket = ordersByVehicle.get(order.vehicleId) ?? [];
      bucket.push(order);
      ordersByVehicle.set(order.vehicleId, bucket);
    }

    const tripsByVehicle = new Map<string, string[]>();
    for (const row of inTransit) {
      const bucket = tripsByVehicle.get(row.vehicleId) ?? [];
      bucket.push(row.tripId);
      tripsByVehicle.set(row.vehicleId, bucket);
    }

    const states = vehicles.map((vehicle) =>
      resolveEffectiveVehicleState({
        vehicleId: vehicle.id,
        registrationPlate: vehicle.registrationPlate,
        recordedStatus: vehicle.status,
        workOrders: ordersByVehicle.get(vehicle.id) ?? [],
        inTransitTripIds: tripsByVehicle.get(vehicle.id) ?? [],
      }),
    );

    for (const state of states) this.emitStateDecision(state);
    return states;
  }

  async effectiveVehicleState(vehicleId: string): Promise<EffectiveVehicleState | null> {
    const vehicle = await this.core.findVehicle(vehicleId);
    if (!vehicle) return null;
    const [workOrders, inTransit] = await Promise.all([
      this.repository.listWorkOrders(vehicleId),
      this.core.listInTransitAssignments(),
    ]);
    const state = resolveEffectiveVehicleState({
      vehicleId: vehicle.id,
      registrationPlate: vehicle.registrationPlate,
      recordedStatus: vehicle.status,
      workOrders,
      inTransitTripIds: inTransit
        .filter((row) => row.vehicleId === vehicleId)
        .map((row) => row.tripId),
    });
    this.emitStateDecision(state);
    return state;
  }

  /**
   * Mot dong quyet dinh cho MOI xe.
   *
   * Mau thuan bao duong-va-dang-chay duoc phat thanh mot dong RIENG voi `outcome: 'degraded'`, chu
   * khong gop vao dong trang thai: acceptance 9 doi mot canh bao TUONG MINH, va mot nguoi loc trace
   * theo `VEHICLE_MAINTENANCE_TRIP_CONFLICT` phai thay dung nhung xe do — khong phai moi xe dang
   * sua.
   */
  private emitStateDecision(state: EffectiveVehicleState): void {
    const reason =
      state.reason === 'MAINTENANCE_LOCK'
        ? 'VEHICLE_UNDER_MAINTENANCE_LOCK'
        : state.reason === 'ACTIVE_IN_TRANSIT_TRIP'
          ? 'VEHICLE_ON_ACTIVE_TRIP'
          : 'VEHICLE_IDLE';

    this.telemetry?.decision({
      vocabulary: TRANSPORT_ASSET_COMPLIANCE_DECISIONS,
      point: 'fleet.effective_vehicle_state',
      outcome: 'allowed',
      reason,
      detail: { vehicleId: state.vehicleId, effectiveStatus: state.effectiveStatus },
    });

    if (state.inconsistencies.includes('MAINTENANCE_WHILE_IN_TRANSIT')) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_ASSET_COMPLIANCE_DECISIONS,
        point: 'fleet.effective_vehicle_state',
        outcome: 'degraded',
        reason: 'VEHICLE_MAINTENANCE_TRIP_CONFLICT',
        detail: {
          vehicleId: state.vehicleId,
          openWorkOrders: state.openWorkOrderIds.length,
          inTransitTrips: state.inTransitTripIds.length,
        },
      });
    }
  }
}
