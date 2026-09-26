import { Injectable } from '@nestjs/common';
import { MovementRepository } from '../movement/movement.repository.js';
import type { Order, VehicleRun } from '../movement/movement.types.js';
import { RunPlanRepository } from '../planning/planning.repository.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  ORIGIN_ATTESTABLE_REASONS,
  evaluateCommercialReadiness,
  hasMovementStarted,
  isOrderOriginCompatible,
  type CommercialReadiness,
} from './commercial-readiness.js';
import { TransportSiteIntakeCoreFacts } from './site-intake-facts.port.js';
import { SiteIntakeReadinessReader, siteLabel } from './site-intake-readiness.reader.js';
import { SiteIntakeCommercialStore } from './site-intake-commercial.store.js';
import type {
  SiteIntakeActorRole,
  SiteIntakeBindingMode,
  SiteIntakeCommercial,
  SiteIntakeCommercialStatus,
  SiteIntakeDestinationSource,
  SiteIntakeExceptionOutcome,
  SiteMatch,
} from './site-intake-commercial.types.js';
import { RunSiteIntakeRepository } from './site-intake.repository.js';
import type { RunSiteIntake, SiteIntakeLocationTrust } from './site-intake.types.js';

/* ------------------------------------------------------------------ *
 * KHUNG NHIN — ma va con so, KHONG mot cau chu nao (cau tieng Viet la viec cua ung dung)
 * ------------------------------------------------------------------ */

export interface ReadinessView {
  readonly kind: CommercialReadiness['kind'];
  readonly reasons: readonly string[];
  readonly rejectedReason: string | null;
}

/** VIEC TAI XE NHAN TRUC TIEP nhin tu VAN PHONG — du de hieu viec ma khong mo vong chay/chang. */
export interface SiteIntakeReviewView {
  readonly intakeId: string;
  readonly status: SiteIntakeCommercialStatus;
  readonly confirmedAt: string;
  readonly businessDate: string;
  readonly driver: { readonly id: string; readonly name: string | null };
  readonly vehicle: { readonly id: string; readonly plate: string | null };
  readonly run: { readonly id: string; readonly code: string; readonly status: string };
  readonly leg: { readonly id: string; readonly status: string };
  readonly origin: {
    readonly siteId: string;
    readonly label: string;
    readonly siteName: string | null;
    readonly counterpartyName: string | null;
    readonly address: string | null;
    readonly active: boolean;
  };
  readonly location: {
    readonly trust: SiteIntakeLocationTrust;
    readonly siteMatch: SiteMatch | null;
    readonly distanceMetres: number | null;
  };
  readonly destination: {
    readonly label: string;
    readonly source: SiteIntakeDestinationSource;
    readonly setByRole: SiteIntakeActorRole;
    readonly setAt: string;
  } | null;
  readonly originAttestedAt: string | null;
  readonly readiness: ReadinessView;
  readonly order: {
    readonly id: string;
    readonly code: string;
    readonly status: string;
    readonly bindingMode: SiteIntakeBindingMode;
    readonly boundAt: string;
  } | null;
  readonly exception: {
    readonly reason: string;
    readonly outcome: SiteIntakeExceptionOutcome;
    readonly at: string;
  } | null;
  /** Xe da lan banh chua — theo chang/vong chay VA moc hien truong. */
  readonly movementStarted: boolean;
  /** Viec may chu CHO PHEP lam tiep tren viec nay — quyen nguoi goi loc o tang HTTP. */
  readonly actions: {
    readonly canSetDestination: boolean;
    readonly canAttestOrigin: boolean;
    readonly canBindExistingOrder: boolean;
    readonly canReportException: boolean;
  };
}

/** MOT DON MOI TU TAI XE — ban tin "Hom nay", khong phai mot viec can quyet. */
export interface DriverOrderActivityView {
  readonly intakeId: string;
  readonly orderId: string;
  readonly orderCode: string;
  readonly orderStatus: string;
  readonly bindingMode: SiteIntakeBindingMode;
  readonly boundAt: string;
  readonly confirmedAt: string;
  readonly driverName: string | null;
  readonly vehiclePlate: string | null;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly exceptionOutcome: SiteIntakeExceptionOutcome | null;
}

/** NGUON cua mot don: tao tu xac nhan cua tai xe. */
export interface OrderIntakeSourceView extends DriverOrderActivityView {
  readonly locationTrust: SiteIntakeLocationTrust;
  readonly siteMatch: SiteMatch | null;
  readonly movementStarted: boolean;
  readonly exception: SiteIntakeReviewView['exception'];
  readonly canReportException: boolean;
}

/** LAN NHAN VIEC nhin tu LAI XE — khong don, khong vong chay, khong tien. */
export interface DriverIntakeView {
  readonly intakeId: string;
  readonly runId: string;
  readonly runCode: string;
  readonly siteName: string | null;
  readonly counterpartyName: string | null;
  readonly confirmedAt: string;
  readonly destinationLabel: string | null;
  /**
   * `NEEDS_DESTINATION` — chua co diem giao, lai xe chon duoc;
   * `CONFIRMED`         — da nhan chuyen day du;
   * `OFFICE_FOLLOW_UP`  — da nhan chuyen, van phong bo sung phan con thieu;
   * `CLOSED`            — viec da bi huy / khong tiep tuc.
   */
  readonly stage: 'NEEDS_DESTINATION' | 'CONFIRMED' | 'OFFICE_FOLLOW_UP' | 'CLOSED';
  readonly canChooseDestination: boolean;
}

/** Mot muc cua hang "Can xu ly" cho thap dieu hanh — `detail` vo huong, khong tien. */
export interface SiteIntakeQueueFact {
  readonly intakeId: string;
  readonly runId: string;
  readonly runCode: string;
  readonly driverId: string;
  readonly vehicleId: string;
  readonly siteName: string | null;
  /** Rong khi da DU dieu kien nhung chua tao don (vd mot su that ngoai vua doi) — can bam Hoan thien. */
  readonly reasons: readonly string[];
}

export interface BindableOrderView {
  readonly id: string;
  readonly code: string;
  readonly businessDate: string;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly createdAt: string;
}

const REVIEW_LIMIT = 200;
const ACTIVITY_LIMIT = 30;
const BINDABLE_LIMIT = 50;

/**
 * VIEC TAI XE NHAN TRUC TIEP — phia DOC (`#398`). Khong mot ham nao o day ghi.
 *
 * MOT nguon su that cho moi be mat: hang "Can xu ly" cua giam doc, danh sach cua ke toan, ban tin
 * "Don moi tu tai xe" va dong nguon tren chi tiet don deu doc CUNG hang `TransportSiteIntakeCommercial`
 * va CUNG ham phan xu. Khong co hop thu thu hai, khong co bang thong bao rieng.
 */
@Injectable()
export class SiteIntakeReviewService {
  constructor(
    private readonly store: SiteIntakeCommercialStore,
    private readonly intakes: RunSiteIntakeRepository,
    private readonly movement: MovementRepository,
    private readonly plans: RunPlanRepository,
    private readonly core: TransportSiteIntakeCoreFacts,
    private readonly reader: SiteIntakeReadinessReader,
  ) {}

  /* ------------------------------------------------------------------ *
   * VAN PHONG
   * ------------------------------------------------------------------ */

  async detail(intakeId: string): Promise<SiteIntakeReviewView> {
    const intake = await this.intakes.findById(intakeId);
    if (!intake) throw notFound();
    const commercial = await this.store.findByIntake(intake.id);
    if (!commercial) throw notFound();
    return this.reviewOf(intake, commercial);
  }

  /** Danh sach theo trang thai — cua ke toan (va man cu). Chi PENDING that su can nguoi xem. */
  async list(status: SiteIntakeCommercialStatus): Promise<readonly SiteIntakeReviewView[]> {
    const rows = await this.store.listByStatus(status, REVIEW_LIMIT);
    const views = await Promise.all(rows.map((row) => this.reviewOfRow(row)));
    return views.flatMap((view) =>
      view === null ||
      (status === 'PENDING' &&
        (view.readiness.kind === 'REJECTED' || view.readiness.kind === 'ALREADY_BOUND'))
        ? []
        : [view],
    );
  }

  /** "DON MOI TU TAI XE" trong `hours` gio gan nhat — ban tin, KHONG vao hang viec can quyet. */
  async activity(hours: number): Promise<readonly DriverOrderActivityView[]> {
    const since = new Date(Date.now() - hours * 3_600_000);
    const rows = await this.store.listBoundSince(since, ACTIVITY_LIMIT);
    const items = await Promise.all(rows.map((row) => this.activityOf(row)));
    return items.flatMap((item) => (item === null ? [] : [item]));
  }

  async sourceOfOrder(orderId: string): Promise<OrderIntakeSourceView> {
    const commercial = await this.store.findByOrder(orderId);
    if (!commercial) {
      throw TransportDomainError.notFound(
        'SITE_INTAKE_ORDER_SOURCE_NOT_FOUND',
        'Don nay khong tao tu xac nhan cua tai xe',
      );
    }
    const activity = await this.activityOf(commercial);
    const intake = await this.intakes.findById(commercial.intakeId);
    if (!activity || !intake) throw notFound();
    const run = await this.movement.findRun(intake.runId);
    const leg = await this.movement.findLeg(intake.legId);
    const movementStarted =
      run !== null &&
      leg !== null &&
      hasMovementStarted({
        runStatus: run.status,
        legStatus: leg.status,
        checkpointTypes: await this.store.checkpointTypesForRun(run.id),
      });
    return {
      ...activity,
      locationTrust: intake.locationTrust,
      siteMatch: intake.siteMatch,
      movementStarted,
      exception: exceptionView(commercial),
      canReportException: commercial.exception === null,
    };
  }

  /**
   * Don OPEN chua co ke hoach, chua nam tren chang nao, chua nhan viec nao, va LAY HANG quanh dia
   * diem tai xe nhan viec (khi don co toa do) — NGUOI chon mot.
   *
   * Loc diem lay dung CUNG ham (`isOrderOriginCompatible`) va CUNG nguon dia diem
   * (`SiteIntakeReadinessReader.external().originPoints`) voi cong gan don duoi khoa — nen danh sach
   * khong de nghi mot don ma lenh gan se tu choi `SITE_INTAKE_ORDER_ORIGIN_MISMATCH`. Loc TRUOC khi
   * cat cua so, de don lay hang o noi khac khong chiem cho cua don dung.
   */
  async bindableOrders(intakeId: string): Promise<readonly BindableOrderView[]> {
    const intake = await this.intakes.findById(intakeId);
    if (!intake) throw notFound();
    const { originPoints } = await this.reader.external(intake);
    const open = (await this.movement.listOrders())
      .filter(
        (order) =>
          order.status === 'OPEN' && isOrderOriginCompatible(order.originPoint, originPoints),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, BINDABLE_LIMIT * 2);
    const checked = await Promise.all(
      open.map(async (order) => {
        const [plan, legs, bound] = await Promise.all([
          this.plans.findActiveForOrder(order.id),
          this.movement.listLegsByOrder(order.id),
          this.store.findByOrder(order.id),
        ]);
        const free =
          plan === null && bound === null && legs.every((leg) => leg.status === 'CANCELLED');
        return free ? [toBindable(order)] : [];
      }),
    );
    return checked.flat().slice(0, BINDABLE_LIMIT);
  }

  /* ------------------------------------------------------------------ *
   * LAI XE
   * ------------------------------------------------------------------ */

  /** Lan nhan viec cua lai xe tren mot vong chay CON MO — de man Viec dua lai buoc diem giao. */
  async driverOpenIntake(authUserId: string): Promise<DriverIntakeView | null> {
    const driver = await this.core.findDriverByAuthUserId(authUserId);
    if (!driver) return null;
    for (const intake of await this.intakes.listForDriver(driver.id)) {
      const run = await this.movement.findRun(intake.runId);
      if (run && (run.status === 'PLANNED' || run.status === 'ACTIVE')) {
        return this.driverViewOf(intake, run);
      }
    }
    return null;
  }

  async driverIntake(authUserId: string, intakeId: string): Promise<DriverIntakeView> {
    const driver = await this.core.findDriverByAuthUserId(authUserId);
    const intake = await this.intakes.findById(intakeId);
    // Cua nguoi khac va khong co that: CUNG mot ma — khong do duoc id nao ton tai.
    if (!driver || !intake || intake.driverId !== driver.id) throw notFound();
    const run = await this.movement.findRun(intake.runId);
    if (!run) throw notFound();
    return this.driverViewOf(intake, run);
  }

  /* ------------------------------------------------------------------ *
   * THAP DIEU HANH + LAP KE HOACH
   * ------------------------------------------------------------------ */

  async listNeedsReview(): Promise<readonly SiteIntakeQueueFact[]> {
    const views = await this.list('PENDING');
    return views.map((view) => ({
      intakeId: view.intakeId,
      runId: view.run.id,
      runCode: view.run.code,
      driverId: view.driver.id,
      vehicleId: view.vehicle.id,
      siteName: view.origin.siteName,
      reasons: view.readiness.reasons,
    }));
  }

  /**
   * Lan nhan viec CHUA CO DON dang giu mot vong chay con mo cua chiec xe nay.
   *
   * Lap ke hoach cho xe nay luc do se sinh vong chay/chang THU HAI cho dung mot viec that — nen lan
   * lap ke hoach dung lai va chi duong "gan don vao viec tai xe da nhan" (`#398` §6).
   */
  async pendingIntakeForVehicle(
    vehicleId: string,
  ): Promise<{ readonly intakeId: string; readonly runCode: string } | null> {
    for (const row of await this.store.listPendingForVehicle(vehicleId)) {
      const view = await this.reviewOfRow(row);
      if (view && view.readiness.kind !== 'REJECTED' && view.readiness.kind !== 'ALREADY_BOUND') {
        return { intakeId: view.intakeId, runCode: view.run.code };
      }
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * Noi bo
   * ------------------------------------------------------------------ */

  private async reviewOfRow(row: SiteIntakeCommercial): Promise<SiteIntakeReviewView | null> {
    const intake = await this.intakes.findById(row.intakeId);
    return intake ? this.reviewOf(intake, row) : null;
  }

  private async reviewOf(
    intake: RunSiteIntake,
    commercial: SiteIntakeCommercial,
  ): Promise<SiteIntakeReviewView> {
    const run = await this.movement.findRun(intake.runId);
    if (!run) throw notFound();
    const [legs, assignment, activeRunPlans, external, plate, checkpointTypes] = await Promise.all([
      this.movement.listLegs(run.id),
      this.movement.activeRunAssignment(run.id),
      this.plans.listActiveForRun(run.id),
      this.reader.external(intake),
      this.core.findVehiclePlate(run.vehicleId),
      this.store.checkpointTypesForRun(run.id),
    ]);
    const readiness = evaluateCommercialReadiness(
      this.reader.facts(
        {
          intake,
          commercial,
          run,
          legs,
          runDriverId: assignment?.driverId ?? null,
          activeRunPlans,
        },
        external,
      ),
    );
    const leg = legs.find((entry) => entry.id === intake.legId);
    const order = commercial.binding
      ? await this.movement.findOrder(commercial.binding.orderId)
      : null;
    const pending = commercial.status === 'PENDING' && readiness.kind !== 'REJECTED';
    const reasons = readiness.kind === 'NEEDS_REVIEW' ? readiness.reasons : [];

    return {
      intakeId: intake.id,
      status: commercial.status,
      confirmedAt: intake.confirmedAt.toISOString(),
      businessDate: intake.businessDate,
      driver: { id: intake.driverId, name: external.driver?.fullName ?? null },
      vehicle: { id: run.vehicleId, plate },
      run: { id: run.id, code: run.code, status: run.status },
      leg: { id: intake.legId, status: leg?.status ?? 'CANCELLED' },
      origin: {
        siteId: intake.siteId,
        label: external.site ? siteLabel(external.site) : '',
        siteName: external.site?.siteName ?? null,
        counterpartyName: external.site?.counterpartyName ?? null,
        address: external.site?.address ?? null,
        active: external.site?.active ?? false,
      },
      location: {
        trust: intake.locationTrust,
        siteMatch: intake.siteMatch,
        distanceMetres: intake.distanceMetres,
      },
      destination: commercial.destination
        ? {
            label: commercial.destination.label,
            source: commercial.destination.source,
            setByRole: commercial.destination.setByRole,
            setAt: commercial.destination.setAt.toISOString(),
          }
        : null,
      originAttestedAt: commercial.originAttestation?.at.toISOString() ?? null,
      readiness: readinessView(readiness),
      order:
        commercial.binding && order
          ? {
              id: order.id,
              code: order.code,
              status: order.status,
              bindingMode: commercial.binding.mode,
              boundAt: commercial.binding.at.toISOString(),
            }
          : null,
      exception: exceptionView(commercial),
      movementStarted: hasMovementStarted({
        runStatus: run.status,
        legStatus: leg?.status ?? 'CANCELLED',
        checkpointTypes,
      }),
      actions: {
        canSetDestination: pending,
        canAttestOrigin:
          pending &&
          commercial.originAttestation === null &&
          reasons.some((reason) => ORIGIN_ATTESTABLE_REASONS.has(reason)),
        canBindExistingOrder:
          pending &&
          leg !== undefined &&
          leg.orderId === null &&
          (leg.status === 'PLANNED' || leg.status === 'IN_TRANSIT'),
        canReportException: commercial.exception === null,
      },
    };
  }

  private async activityOf(row: SiteIntakeCommercial): Promise<DriverOrderActivityView | null> {
    if (!row.binding) return null;
    const intake = await this.intakes.findById(row.intakeId);
    const order = await this.movement.findOrder(row.binding.orderId);
    if (!intake || !order) return null;
    const run = await this.movement.findRun(intake.runId);
    const [driver, plate] = await Promise.all([
      this.core.findDriver(intake.driverId),
      run ? this.core.findVehiclePlate(run.vehicleId) : Promise.resolve(null),
    ]);
    return {
      intakeId: intake.id,
      orderId: order.id,
      orderCode: order.code,
      orderStatus: order.status,
      bindingMode: row.binding.mode,
      boundAt: row.binding.at.toISOString(),
      confirmedAt: intake.confirmedAt.toISOString(),
      driverName: driver?.fullName ?? null,
      vehiclePlate: plate,
      originLabel: order.originLabel,
      destinationLabel: order.destinationLabel,
      exceptionOutcome: row.exception?.outcome ?? null,
    };
  }

  private async driverViewOf(intake: RunSiteIntake, run: VehicleRun): Promise<DriverIntakeView> {
    const commercial = await this.store.findByIntake(intake.id);
    const site = await this.core.findSite(intake.siteId);
    const review = commercial ? await this.reviewOf(intake, commercial) : null;
    const destinationLabel = review?.order
      ? ((await this.movement.findOrder(review.order.id))?.destinationLabel ?? null)
      : (commercial?.destination?.label ?? null);
    const stage: DriverIntakeView['stage'] =
      commercial === null
        ? 'NEEDS_DESTINATION'
        : commercial.status === 'ORDER_BOUND'
          ? 'CONFIRMED'
          : commercial.status === 'REJECTED' || review?.readiness.kind === 'REJECTED'
            ? 'CLOSED'
            : commercial.destination === null
              ? 'NEEDS_DESTINATION'
              : 'OFFICE_FOLLOW_UP';
    return {
      intakeId: intake.id,
      runId: run.id,
      runCode: run.code,
      siteName: site?.siteName ?? null,
      counterpartyName: site?.counterpartyName ?? null,
      confirmedAt: intake.confirmedAt.toISOString(),
      destinationLabel,
      stage,
      canChooseDestination: stage === 'NEEDS_DESTINATION' || stage === 'OFFICE_FOLLOW_UP',
    };
  }
}

const notFound = (): TransportDomainError =>
  TransportDomainError.notFound('SITE_INTAKE_NOT_FOUND', 'Khong tim thay lan nhan viec');

const readinessView = (readiness: CommercialReadiness): ReadinessView => ({
  kind: readiness.kind,
  reasons: readiness.kind === 'NEEDS_REVIEW' ? readiness.reasons : [],
  rejectedReason: readiness.kind === 'REJECTED' ? readiness.reason : null,
});

const exceptionView = (commercial: SiteIntakeCommercial): SiteIntakeReviewView['exception'] =>
  commercial.exception
    ? {
        reason: commercial.exception.reason,
        outcome: commercial.exception.outcome,
        at: commercial.exception.at.toISOString(),
      }
    : null;

const toBindable = (order: Order): BindableOrderView => ({
  id: order.id,
  code: order.code,
  businessDate: order.businessDate,
  originLabel: order.originLabel,
  destinationLabel: order.destinationLabel,
  createdAt: order.createdAt,
});
