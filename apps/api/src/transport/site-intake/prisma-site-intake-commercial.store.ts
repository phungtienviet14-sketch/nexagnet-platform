import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import type { CreateOrderInput } from '../movement/movement.repository.js';
import type { Order, RunLeg } from '../movement/movement.types.js';
import {
  lockOrderPlan,
  orderCreateData,
  toLeg,
  toOrder,
  toRun,
  type LegRow,
  type OrderRow,
  type RunRow,
} from '../movement/prisma-movement.repository.js';
import type { CreateOrderRunPlanInput } from '../planning/planning.repository.js';
import type { OrderRunPlan } from '../planning/planning.types.js';
import { toPlan, type PlanRow } from '../planning/prisma-planning.repository.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  SiteIntakeCommercialStore,
  commercialNotFound,
  legNoLongerAdoptable,
  siteIntakeCommercialLockKey,
  type CommercialScope,
  type WithIntakeOptions,
} from './site-intake-commercial.store.js';
import type {
  SiteIntakeActorRole,
  SiteIntakeBindingMode,
  SiteIntakeCommercial,
  SiteIntakeCommercialStatus,
  SiteIntakeDestinationSource,
  SiteIntakeExceptionOutcome,
} from './site-intake-commercial.types.js';
import { toIntake, type IntakeRow } from './prisma-site-intake.repository.js';

/**
 * Prisma khong loi ra kieu cho delegate cua giao dich mot cach on dinh qua cac phien ban, nen tang
 * nay dung mot loi ra khong kieu — cung khuon `prisma-movement.repository.ts`. Ranh gioi kieu THAT
 * la cac ham `to*()`.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type TxClient = any;
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const model = (client: TxClient, name: string): any => (client as Record<string, any>)[name];

export interface CommercialRow {
  id: string;
  intakeId: string;
  status: SiteIntakeCommercialStatus;
  destinationLabel: string | null;
  destinationLatitude: number | null;
  destinationLongitude: number | null;
  destinationSource: SiteIntakeDestinationSource | null;
  destinationRef: string | null;
  destinationSetBy: string | null;
  destinationSetByRole: SiteIntakeActorRole | null;
  destinationSetAt: Date | null;
  destinationEventId: string | null;
  originAttestedBy: string | null;
  originAttestedAt: Date | null;
  orderId: string | null;
  bindingMode: SiteIntakeBindingMode | null;
  boundBy: string | null;
  boundAt: Date | null;
  exceptionReason: string | null;
  exceptionOutcome: SiteIntakeExceptionOutcome | null;
  exceptionBy: string | null;
  exceptionAt: Date | null;
  exceptionKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Hang -> mo hinh. Mot khoi con thieu MOT o thi ca khoi la `null`: CHECK cua DB da cam nua khoi,
 * nhung neu no lot (mot lan sua tay khi rang buoc dang go) thi nua khoi van KHONG phai mot su that.
 */
export const toCommercial = (row: CommercialRow): SiteIntakeCommercial => ({
  id: row.id,
  intakeId: row.intakeId,
  status: row.status,
  destination:
    row.destinationLabel !== null &&
    row.destinationLatitude !== null &&
    row.destinationLongitude !== null &&
    row.destinationSource !== null &&
    row.destinationSetBy !== null &&
    row.destinationSetByRole !== null &&
    row.destinationSetAt !== null
      ? {
          label: row.destinationLabel,
          point: { latitude: row.destinationLatitude, longitude: row.destinationLongitude },
          source: row.destinationSource,
          ref: row.destinationRef,
          setBy: row.destinationSetBy,
          setByRole: row.destinationSetByRole,
          setAt: row.destinationSetAt,
          eventId: row.destinationEventId,
        }
      : null,
  originAttestation:
    row.originAttestedBy !== null && row.originAttestedAt !== null
      ? { by: row.originAttestedBy, at: row.originAttestedAt }
      : null,
  binding:
    row.orderId !== null && row.bindingMode !== null && row.boundBy !== null && row.boundAt !== null
      ? { orderId: row.orderId, mode: row.bindingMode, by: row.boundBy, at: row.boundAt }
      : null,
  exception:
    row.exceptionReason !== null &&
    row.exceptionOutcome !== null &&
    row.exceptionBy !== null &&
    row.exceptionAt !== null &&
    row.exceptionKey !== null
      ? {
          reason: row.exceptionReason,
          outcome: row.exceptionOutcome,
          by: row.exceptionBy,
          at: row.exceptionAt,
          key: row.exceptionKey,
        }
      : null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/**
 * PHAN THUONG MAI tren Postgres — `#398`.
 *
 * `withIntake` la MOT giao dich `ReadCommitted`, va thu tu khoa la hop dong (xem `CommercialScope`):
 * khoa tu van cua lan nhan viec -> khoa tu van cua don co san (neu gan don co san) -> khoa hang
 * vong chay. `ReadCommitted` la du vi cung ly do da ghi o `underRunLock()`: moi phep doc co gia tri
 * chay SAU khi khoa da trong tay, nen no thay ban commit moi nhat.
 */
@Injectable()
export class PrismaSiteIntakeCommercialStore extends SiteIntakeCommercialStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {
    super();
  }

  withIntake<T>(
    intakeId: string,
    options: WithIntakeOptions,
    work: (scope: CommercialScope) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx: unknown) => {
        const client = tx as TxClient;
        await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${siteIntakeCommercialLockKey(intakeId)}, 0))`;
        if (options.lockOrderId !== undefined) {
          // CUNG khoa (va cung chuoi) voi lan lap ke hoach / lan them chang co hang cua don nay.
          await lockOrderPlan(client, options.lockOrderId);
        }

        const intakeRow: IntakeRow | null = await model(
          client,
          'transportRunSiteIntake',
        ).findUnique({ where: { id: intakeId } });
        if (!intakeRow) throw commercialNotFound();

        /*
         * NGOAI LE CO Y cua quy uoc "capability khong tu viet `SELECT ... FOR UPDATE` tren vong chay"
         * (`MovementRepository.underRunLock`, `RunWriteGuard`). Cau lenh nay khoa DUNG hang ma
         * `underRunLock`/`createLeg`/`setLegStatus`/lan dong vong chay khoa — cung mot khoa, khong
         * phai khoa thu hai; cai khac la no nam SAU hai khoa tu van trong CUNG giao dich.
         *
         * Vi sao KHONG di qua `underRunLock`: ham do mo giao dich RIENG cua no va khoa hang vong chay
         * TRUOC. Boc lenh nay vao do thi thu tu thanh "hang vong chay -> lan nhan viec -> don" — dao
         * nguoc voi lan lap ke hoach (don -> xe -> hang vong chay) va `createLeg` co hang (don -> hang
         * vong chay): hai giao dich, moi ben giu mot khoa ben kia can = deadlock. Con chay hai giao
         * dich lien tiep thi mat tinh nguyen tu cua "tao don + nhan chang + ke hoach + ORDER_BOUND".
         *
         * Vi sao thu tu o day KHONG tao vong doi (moi duong deu di mot chieu cua day
         * lan nhan viec -> don -> xe -> hang vong chay, va khong ai quay lui):
         *   · lenh nay:            lan nhan viec -> [don] -> hang vong chay (KHONG gianh khoa xe);
         *   · lap ke hoach:        don -> xe -> hang vong chay;
         *   · them chang co hang:  don -> hang vong chay;
         *   · tai xe xac nhan:     CHI xe (chi CHEN hang moi, khong khoa hang vong chay co san);
         *   · moi duong ghi khac:  CHI hang vong chay.
         * Khong ai giu hang vong chay roi moi xin mot khoa tu van, va khong ai ngoai lenh nay xin khoa
         * lan nhan viec — nen khong co chu trinh cho doi.
         */
        const locked: unknown = await client.$queryRaw`
          SELECT "id" FROM "TransportVehicleRun" WHERE "id" = ${intakeRow.runId} FOR UPDATE`;
        if (!Array.isArray(locked) || locked.length === 0) throw commercialNotFound();

        const commercialDelegate = model(client, 'transportSiteIntakeCommercial');
        // Ban ghi truoc #398 khong co hang thuong mai: tao LUOI, trong CHINH giao dich dang giu khoa.
        let commercialRow: CommercialRow | null = await commercialDelegate.findUnique({
          where: { intakeId },
        });
        commercialRow ??= await commercialDelegate.create({ data: { intakeId } });

        const runRow: RunRow = await model(client, 'transportVehicleRun').findUniqueOrThrow({
          where: { id: intakeRow.runId },
        });
        const legRows: LegRow[] = await model(client, 'transportRunLeg').findMany({
          where: { runId: intakeRow.runId },
          orderBy: [{ sequence: 'asc' }],
        });
        const assignment: { driverId: string } | null = await model(
          client,
          'transportRunAssignment',
        ).findFirst({ where: { runId: intakeRow.runId, effectiveTo: null } });
        const planRows: PlanRow[] = await model(client, 'transportOrderRunPlan').findMany({
          where: { runId: intakeRow.runId, cancelledAt: null },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });

        let current = toCommercial(commercialRow as CommercialRow);
        const update = async (data: Record<string, unknown>): Promise<SiteIntakeCommercial> => {
          const row: CommercialRow = await commercialDelegate.update({
            where: { id: current.id },
            data,
          });
          current = toCommercial(row);
          return current;
        };

        const scope: CommercialScope = {
          intake: toIntake(intakeRow),
          get commercial() {
            return current;
          },
          run: toRun(runRow),
          legs: legRows.map(toLeg),
          runDriverId: assignment?.driverId ?? null,
          activeRunPlans: planRows.map(toPlan),

          checkpointTypes: async () => {
            const rows: { type: string }[] = await model(client, 'transportRunCheckpoint').findMany(
              {
                where: { runId: intakeRow.runId },
                select: { type: true },
              },
            );
            return rows.map((row) => row.type);
          },
          findOrder: async (orderId) => {
            const row: OrderRow | null = await model(client, 'transportOrder').findUnique({
              where: { id: orderId },
            });
            return row ? toOrder(row) : null;
          },
          orderPlanFacts: async (orderId) => {
            const plan = await model(client, 'transportOrderRunPlan').findFirst({
              where: { orderId, cancelledAt: null },
              select: { id: true },
            });
            const liveLegCount: number = await model(client, 'transportRunLeg').count({
              where: { orderId, status: { not: 'CANCELLED' } },
            });
            const bound: { intakeId: string } | null = await commercialDelegate.findUnique({
              where: { orderId },
              select: { intakeId: true },
            });
            return {
              hasActivePlan: plan !== null,
              liveLegCount,
              boundIntakeId: bound?.intakeId ?? null,
            };
          },

          setDestination: (destination) =>
            update({
              destinationLabel: destination.label,
              destinationLatitude: destination.point.latitude,
              destinationLongitude: destination.point.longitude,
              destinationSource: destination.source,
              destinationRef: destination.ref,
              destinationSetBy: destination.setBy,
              destinationSetByRole: destination.setByRole,
              destinationSetAt: destination.setAt,
              destinationEventId: destination.eventId,
              updatedAt: destination.setAt,
            }),
          attestOrigin: (by, at) =>
            update({ originAttestedBy: by, originAttestedAt: at, updatedAt: at }),
          createOrder: async (input: CreateOrderInput): Promise<Order> =>
            toOrder(await model(client, 'transportOrder').create({ data: orderCreateData(input) })),
          adoptLeg: async (input): Promise<RunLeg> => {
            const updated: { count: number } = await model(client, 'transportRunLeg').updateMany({
              where: {
                id: input.legId,
                kind: 'LOADED',
                orderId: null,
                status: { in: ['PLANNED', 'IN_TRANSIT'] },
              },
              data: {
                orderId: input.orderId,
                destinationLabel: input.destinationLabel,
                updatedAt: input.at,
              },
            });
            if (updated.count !== 1) throw legNoLongerAdoptable();
            return toLeg(
              await model(client, 'transportRunLeg').findUniqueOrThrow({
                where: { id: input.legId },
              }),
            );
          },
          createAdoptionPlan: async (input: CreateOrderRunPlanInput): Promise<OrderRunPlan> =>
            toPlan(
              await model(client, 'transportOrderRunPlan').create({
                data: {
                  orderId: input.orderId,
                  runId: input.runId,
                  vehicleId: input.vehicleId,
                  loadedLegId: input.loadedLegId,
                  emptyLegId: input.emptyLegId,
                  grouping: input.grouping,
                  outcome: input.outcome,
                  idempotencyKey: input.idempotencyKey,
                  plannedBy: input.plannedBy,
                  businessDate: input.businessDate,
                },
              }),
            ),
          markBound: (input) =>
            update({
              status: 'ORDER_BOUND',
              orderId: input.orderId,
              bindingMode: input.mode,
              boundBy: input.by,
              boundAt: input.at,
              updatedAt: input.at,
            }),
          recordException: (input) =>
            update({
              ...(input.reject ? { status: 'REJECTED' } : {}),
              exceptionReason: input.reason,
              exceptionOutcome: input.outcome,
              exceptionBy: input.by,
              exceptionAt: input.at,
              exceptionKey: input.key,
              updatedAt: input.at,
            }),
          cancelOrder: async (orderId, reason, at) => {
            const updated: { count: number } = await model(client, 'transportOrder').updateMany({
              where: { id: orderId, status: 'OPEN' },
              data: {
                status: 'CANCELLED',
                cancelledAt: at,
                cancellationReason: reason,
                updatedAt: at,
              },
            });
            if (updated.count !== 1) {
              throw TransportDomainError.conflict(
                'SITE_INTAKE_ORDER_NOT_OPEN',
                'Don vua doi trang thai — tai lai roi thu lai',
              );
            }
            return toOrder(
              await model(client, 'transportOrder').findUniqueOrThrow({ where: { id: orderId } }),
            );
          },
          cancelActivePlan: async (planId, reason, at) => {
            await model(client, 'transportOrderRunPlan').updateMany({
              where: { id: planId, cancelledAt: null },
              data: { cancelledAt: at, cancellationReason: reason },
            });
          },
          cancelPlannedLeg: async (legId, at) => {
            const updated: { count: number } = await model(client, 'transportRunLeg').updateMany({
              where: { id: legId, status: 'PLANNED' },
              data: { status: 'CANCELLED', updatedAt: at },
            });
            return updated.count === 1;
          },
          cancelPlannedRun: async (runId, reason, at) => {
            const updated: { count: number } = await model(
              client,
              'transportVehicleRun',
            ).updateMany({
              where: { id: runId, status: 'PLANNED' },
              data: {
                status: 'CANCELLED',
                cancelledAt: at,
                cancellationReason: reason,
                updatedAt: at,
              },
            });
            return updated.count === 1;
          },
          appendAudit: async (command) => {
            const entry = this.audit.entryFor(command);
            await model(client, 'auditLog').create({
              data: {
                actor: entry.actor,
                action: entry.action,
                entityType: entry.entityType,
                entityId: entry.entityId,
                before:
                  entry.before === null ? Prisma.DbNull : (entry.before as Prisma.InputJsonValue),
                after:
                  entry.after === null ? Prisma.DbNull : (entry.after as Prisma.InputJsonValue),
                requestId: entry.requestId,
                createdAt: new Date(entry.createdAt),
              },
            });
          },
        };

        return work(scope);
      },
      { isolationLevel: 'ReadCommitted', maxWait: 10_000, timeout: 20_000 },
    );
  }

  async findByIntake(intakeId: string): Promise<SiteIntakeCommercial | null> {
    const row: CommercialRow | null = await model(
      this.prisma,
      'transportSiteIntakeCommercial',
    ).findUnique({ where: { intakeId } });
    return row ? toCommercial(row) : null;
  }

  async findByOrder(orderId: string): Promise<SiteIntakeCommercial | null> {
    const row: CommercialRow | null = await model(
      this.prisma,
      'transportSiteIntakeCommercial',
    ).findUnique({ where: { orderId } });
    return row ? toCommercial(row) : null;
  }

  async listByStatus(
    status: SiteIntakeCommercialStatus,
    limit: number,
  ): Promise<readonly SiteIntakeCommercial[]> {
    const rows: CommercialRow[] = await model(
      this.prisma,
      'transportSiteIntakeCommercial',
    ).findMany({ where: { status }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: limit });
    return rows.map(toCommercial);
  }

  async listPendingForVehicle(vehicleId: string): Promise<readonly SiteIntakeCommercial[]> {
    const rows: CommercialRow[] = await model(
      this.prisma,
      'transportSiteIntakeCommercial',
    ).findMany({
      where: {
        status: 'PENDING',
        intake: { run: { vehicleId, status: { in: ['PLANNED', 'ACTIVE'] } } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 20,
    });
    return rows.map(toCommercial);
  }

  async checkpointTypesForRun(runId: string): Promise<readonly string[]> {
    const rows: { type: string }[] = await model(this.prisma, 'transportRunCheckpoint').findMany({
      where: { runId },
      select: { type: true },
    });
    return rows.map((row) => row.type);
  }

  async listBoundSince(since: Date, limit: number): Promise<readonly SiteIntakeCommercial[]> {
    const rows: CommercialRow[] = await model(
      this.prisma,
      'transportSiteIntakeCommercial',
    ).findMany({
      where: { status: 'ORDER_BOUND', boundAt: { gte: since } },
      orderBy: [{ boundAt: 'desc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map(toCommercial);
  }
}
