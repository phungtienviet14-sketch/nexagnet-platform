import { randomUUID } from 'node:crypto';
import type { AppendAuditLogCommand, AuditLogService } from '../../audit/audit-log.service.js';
import type { CreateOrderInput, MovementRepository } from '../movement/movement.repository.js';
import type { Order, RunLeg, VehicleRun } from '../movement/movement.types.js';
import type {
  CreateOrderRunPlanInput,
  RunPlanRepository,
} from '../planning/planning.repository.js';
import type { OrderRunPlan } from '../planning/planning.types.js';
import { TransportDomainError } from '../transport.errors.js';
import type {
  IntakeDestination,
  SiteIntakeBindingMode,
  SiteIntakeCommercial,
  SiteIntakeCommercialStatus,
  SiteIntakeExceptionOutcome,
} from './site-intake-commercial.types.js';
import type { InMemoryRunSiteIntakeRepository } from './site-intake.repository.js';
import type { RunSiteIntake } from './site-intake.types.js';

/**
 * PHAM VI GHI cua MOT lenh thuong mai tren MOT lan nhan viec — `#398`.
 *
 * ============================================================================================
 * MOI THU TRONG DAY NAM DUOI HAI KHOA, VA TRONG MOT GIAO DICH
 * ============================================================================================
 *
 *   1. khoa tu van `transport-site-intake-commercial:<intakeId>` — xep hang MOI lenh cua CUNG lan
 *      nhan viec (tu tao don khi lai xe chon diem giao, van phong bo sung, van phong gan don co san,
 *      sep bao bat thuong). Hai lenh khong bao gio cung doc thay "chua co don" roi cung tao don;
 *   2. khi gan mot DON CO SAN: khoa tu van `transport-order-plan:<orderId>` — cung khoa ma lan lap
 *      ke hoach thuong gianh truoc khi tao vong chay/chang cho don do. Nen "gan don nay vao chang
 *      cua lai xe" va "lap ke hoach cho don nay" xep hang, khong chong len nhau;
 *   3. khoa HANG vong chay (`SELECT ... FOR UPDATE`) — ranh gioi DA CO cua `#293` R2, dung khoa ma
 *      `createLeg`, lan doi trang thai chang, lan ghi moc va lan dong vong chay deu gianh.
 *
 * THU TU LUON LA 1 -> 2 -> 3, va lan lap ke hoach cung gianh 2 truoc 3. Khong ai gianh khoa hang
 * vong chay roi moi gianh khoa tu van, nen khong co vong doi nao.
 *
 * Su that doc TRONG pham vi (`intake`, `commercial`, `run`, `legs`, ...) la ban doc SAU khi co du ba
 * khoa — khong phai anh chup truoc.
 */
export interface CommercialScope {
  readonly intake: RunSiteIntake;
  readonly commercial: SiteIntakeCommercial;
  readonly run: VehicleRun;
  readonly legs: readonly RunLeg[];
  /** Nguoi DANG cam vong chay. `null` = khong co phan cong hieu luc. */
  readonly runDriverId: string | null;
  readonly activeRunPlans: readonly OrderRunPlan[];

  /** Loai moc DA ghi tren vong chay — de biet xe da lan banh chua. */
  checkpointTypes(): Promise<readonly string[]>;
  findOrder(orderId: string): Promise<Order | null>;
  orderPlanFacts(orderId: string): Promise<OrderPlanFacts>;

  setDestination(destination: IntakeDestination): Promise<SiteIntakeCommercial>;
  attestOrigin(by: string, at: Date): Promise<SiteIntakeCommercial>;
  createOrder(input: CreateOrderInput): Promise<Order>;
  /** `null -> orderId` co dieu kien. Nem khi chang khong con nhan duoc (lenh phai phan xu lai). */
  adoptLeg(input: AdoptLegInput): Promise<RunLeg>;
  createAdoptionPlan(input: CreateOrderRunPlanInput): Promise<OrderRunPlan>;
  markBound(input: MarkBoundInput): Promise<SiteIntakeCommercial>;
  recordException(input: RecordExceptionInput): Promise<SiteIntakeCommercial>;
  cancelOrder(orderId: string, reason: string, at: Date): Promise<Order>;
  cancelActivePlan(planId: string, reason: string, at: Date): Promise<void>;
  /** Huy chang `PLANNED` (co dieu kien). `false` = chang da doi trang thai. */
  cancelPlannedLeg(legId: string, at: Date): Promise<boolean>;
  /** Huy vong chay `PLANNED` (co dieu kien). `false` = vong chay da doi trang thai. */
  cancelPlannedRun(runId: string, reason: string, at: Date): Promise<boolean>;
  appendAudit(command: AppendAuditLogCommand): Promise<void>;
}

export interface OrderPlanFacts {
  readonly hasActivePlan: boolean;
  /** So chang CHUA huy dang mang don nay. */
  readonly liveLegCount: number;
  /** Lan nhan viec da nhan don nay, neu co. */
  readonly boundIntakeId: string | null;
}

export interface AdoptLegInput {
  readonly legId: string;
  readonly orderId: string;
  readonly destinationLabel: string;
  readonly at: Date;
}

export interface MarkBoundInput {
  readonly orderId: string;
  readonly mode: SiteIntakeBindingMode;
  readonly by: string;
  readonly at: Date;
}

export interface RecordExceptionInput {
  readonly reason: string;
  readonly outcome: SiteIntakeExceptionOutcome;
  readonly by: string;
  readonly at: Date;
  readonly key: string;
  /** `true` -> `PENDING -> REJECTED` trong cung lan ghi. */
  readonly reject: boolean;
}

export interface WithIntakeOptions {
  /** Gan mot DON CO SAN: gianh them khoa tu van cua don do, TRUOC khoa hang vong chay. */
  readonly lockOrderId?: string;
}

/**
 * KHO cua phan thuong mai. Hai loai duong:
 *
 *   · `withIntake` — duong GHI duy nhat, duoi ba khoa, mot giao dich;
 *   · cac ham `find*`/`list*` — duong DOC cho man hinh va thap dieu hanh, khong khoa.
 */
export abstract class SiteIntakeCommercialStore {
  abstract withIntake<T>(
    intakeId: string,
    options: WithIntakeOptions,
    work: (scope: CommercialScope) => Promise<T>,
  ): Promise<T>;
  abstract findByIntake(intakeId: string): Promise<SiteIntakeCommercial | null>;
  abstract findByOrder(orderId: string): Promise<SiteIntakeCommercial | null>;
  abstract listByStatus(
    status: SiteIntakeCommercialStatus,
    limit: number,
  ): Promise<readonly SiteIntakeCommercial[]>;
  /** Da gan don tu `since` tro di, moi nhat truoc. */
  abstract listBoundSince(since: Date, limit: number): Promise<readonly SiteIntakeCommercial[]>;
  /** Loai moc DA ghi tren mot vong chay — duong DOC, khong khoa. */
  abstract checkpointTypesForRun(runId: string): Promise<readonly string[]>;
  /**
   * `PENDING` tren mot vong chay CON MO (`PLANNED`/`ACTIVE`) cua MOT chiec xe — truy van CO DICH cho
   * lan lap ke hoach, khong quet ca bang (lan lap ke hoach nao cung hoi cau nay).
   */
  abstract listPendingForVehicle(vehicleId: string): Promise<readonly SiteIntakeCommercial[]>;
}

/** Ten khoa tu van — MOT noi khai, de lan lap ke hoach dung DUNG chuoi do. */
export const siteIntakeCommercialLockKey = (intakeId: string): string =>
  `transport-site-intake-commercial:${intakeId}`;
export const orderPlanLockKey = (orderId: string): string => `transport-order-plan:${orderId}`;

export const commercialNotFound = (): TransportDomainError =>
  TransportDomainError.notFound(
    'SITE_INTAKE_NOT_FOUND',
    'Khong tim thay lan nhan viec nao mang ma do',
  );

export const legNoLongerAdoptable = (): TransportDomainError =>
  TransportDomainError.conflict(
    'SITE_INTAKE_LEG_NOT_ADOPTABLE',
    'Chang cua lan nhan viec vua doi trang thai — tai lai roi thu lai',
  );

/* ------------------------------------------------------------------ *
 * BAN TRONG BO NHO — duong chay THAT cua `PERSISTENCE=memory`
 * ------------------------------------------------------------------ */

/**
 * Ban trong bo nho di qua CAC KHO TRONG BO NHO da co (don, vong chay, chang, ke hoach) bang chinh
 * phuong thuc cong cua chung, va xep hang MOI lenh qua mot hang doi duy nhat — song doi cua ba khoa
 * o ban Postgres.
 *
 * Hang thuong mai cua mot lan nhan viec duoc tao LUOI (lan dau co nguoi hoi toi): ban Postgres tao no
 * cung giao dich voi ban ghi xac nhan, con o day hai kho tach roi va khong co cu chet nao giua chung.
 */
export class InMemorySiteIntakeCommercialStore extends SiteIntakeCommercialStore {
  private readonly rows = new Map<string, SiteIntakeCommercial>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly intakes: InMemoryRunSiteIntakeRepository,
    private readonly movement: MovementRepository,
    private readonly plans: RunPlanRepository,
    private readonly audit: AuditLogService,
  ) {
    super();
  }

  async withIntake<T>(
    intakeId: string,
    _options: WithIntakeOptions,
    work: (scope: CommercialScope) => Promise<T>,
  ): Promise<T> {
    const run = this.queue.then(() => this.runScoped(intakeId, work));
    this.queue = run.catch(() => undefined);
    return run;
  }

  async findByIntake(intakeId: string): Promise<SiteIntakeCommercial | null> {
    const intake = await this.intakes.findById(intakeId);
    return intake ? this.materialise(intake.id) : null;
  }

  async findByOrder(orderId: string): Promise<SiteIntakeCommercial | null> {
    for (const row of this.rows.values()) if (row.binding?.orderId === orderId) return row;
    return null;
  }

  async listByStatus(
    status: SiteIntakeCommercialStatus,
    limit: number,
  ): Promise<readonly SiteIntakeCommercial[]> {
    for (const intake of await this.intakes.listAll()) this.materialise(intake.id);
    return [...this.rows.values()]
      .filter((row) => row.status === status)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, limit);
  }

  async listBoundSince(since: Date, limit: number): Promise<readonly SiteIntakeCommercial[]> {
    return [...this.rows.values()]
      .filter((row) => row.binding !== null && row.binding.at.getTime() >= since.getTime())
      .sort((left, right) => (right.binding?.at.getTime() ?? 0) - (left.binding?.at.getTime() ?? 0))
      .slice(0, limit);
  }

  async checkpointTypesForRun(): Promise<readonly string[]> {
    return [];
  }

  async listPendingForVehicle(vehicleId: string): Promise<readonly SiteIntakeCommercial[]> {
    const rows: SiteIntakeCommercial[] = [];
    for (const intake of await this.intakes.listAll()) {
      const run = await this.movement.findRun(intake.runId);
      if (run?.vehicleId !== vehicleId || (run.status !== 'PLANNED' && run.status !== 'ACTIVE')) {
        continue;
      }
      const row = this.materialise(intake.id);
      if (row.status === 'PENDING') rows.push(row);
    }
    return rows;
  }

  private materialise(intakeId: string): SiteIntakeCommercial {
    const existing = [...this.rows.values()].find((row) => row.intakeId === intakeId);
    if (existing) return existing;
    const now = new Date();
    const row: SiteIntakeCommercial = {
      id: randomUUID(),
      intakeId,
      status: 'PENDING',
      destination: null,
      originAttestation: null,
      binding: null,
      exception: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(row.id, row);
    return row;
  }

  private async runScoped<T>(
    intakeId: string,
    work: (scope: CommercialScope) => Promise<T>,
  ): Promise<T> {
    const intake = await this.intakes.findById(intakeId);
    if (!intake) throw commercialNotFound();
    const run = await this.movement.findRun(intake.runId);
    if (!run) throw commercialNotFound();
    const legs = await this.movement.listLegs(run.id);
    const assignment = await this.movement.activeRunAssignment(run.id);
    const activeRunPlans = await this.plans.listActiveForRun(run.id);

    let commercial = this.materialise(intake.id);
    const replace = (next: SiteIntakeCommercial): SiteIntakeCommercial => {
      this.rows.set(next.id, next);
      commercial = next;
      return next;
    };

    const scope: CommercialScope = {
      intake,
      get commercial() {
        return commercial;
      },
      run,
      legs,
      runDriverId: assignment?.driverId ?? null,
      activeRunPlans,
      checkpointTypes: async () => [],
      findOrder: (orderId) => this.movement.findOrder(orderId),
      orderPlanFacts: async (orderId) => ({
        hasActivePlan: (await this.plans.findActiveForOrder(orderId)) !== null,
        liveLegCount: (await this.movement.listLegsByOrder(orderId)).filter(
          (leg) => leg.status !== 'CANCELLED',
        ).length,
        boundIntakeId: (await this.findByOrder(orderId))?.intakeId ?? null,
      }),
      setDestination: async (destination) =>
        replace({ ...commercial, destination, updatedAt: destination.setAt }),
      attestOrigin: async (by, at) =>
        replace({ ...commercial, originAttestation: { by, at }, updatedAt: at }),
      createOrder: (input) => this.movement.createOrder(input),
      adoptLeg: async (input) => {
        const leg = await this.movement.bindOrderToUnboundLoadedLeg(input);
        if (!leg) throw legNoLongerAdoptable();
        return leg;
      },
      createAdoptionPlan: (input) => this.plans.create(input),
      markBound: async (input) => {
        const taken = await this.findByOrder(input.orderId);
        if (taken && taken.id !== commercial.id) {
          throw TransportDomainError.conflict(
            'SITE_INTAKE_ORDER_BOUND_TO_OTHER_INTAKE',
            'Don nay da nhan mot lan nhan viec khac',
          );
        }
        return replace({
          ...commercial,
          status: 'ORDER_BOUND',
          binding: { orderId: input.orderId, mode: input.mode, by: input.by, at: input.at },
          updatedAt: input.at,
        });
      },
      recordException: async (input) =>
        replace({
          ...commercial,
          status: input.reject ? 'REJECTED' : commercial.status,
          exception: {
            reason: input.reason,
            outcome: input.outcome,
            by: input.by,
            at: input.at,
            key: input.key,
          },
          updatedAt: input.at,
        }),
      cancelOrder: async (orderId, reason, at) => {
        const order = await this.movement.cancelOrder(orderId, {
          cancelledAt: at,
          cancellationReason: reason,
        });
        if (!order) throw commercialNotFound();
        return order;
      },
      cancelActivePlan: async (planId, reason, at) => {
        await this.plans.cancel(planId, { cancelledAt: at, cancellationReason: reason });
      },
      cancelPlannedLeg: async (legId, at) =>
        (await this.movement.setLegStatus({ legId, from: 'PLANNED', to: 'CANCELLED', at }))
          ?.applied === true,
      cancelPlannedRun: async (runId, reason, at) => {
        const current = await this.movement.findRun(runId);
        if (current?.status !== 'PLANNED') return false;
        return (
          (await this.movement.cancelRun(runId, {
            cancelledAt: at,
            cancellationReason: reason,
          })) !== null
        );
      },
      appendAudit: async (command) => {
        await this.audit.append(command);
      },
    };
    return work(scope);
  }
}
