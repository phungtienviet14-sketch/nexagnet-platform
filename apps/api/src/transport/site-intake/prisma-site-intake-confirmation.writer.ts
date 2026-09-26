import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AppendAuditLogCommand } from '../../audit/audit-log.service.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import {
  lockVehicleRuns,
  toAssignment,
  toLeg,
  toRun,
  type AssignmentRow,
  type LegRow,
  type RunRow,
} from '../movement/prisma-movement.repository.js';
import { intakeCreateData, toIntake, type IntakeRow } from './prisma-site-intake.repository.js';
import type { SiteIntakeOpenRun } from './site-intake-facts.port.js';
import {
  SiteIntakeConfirmationWriter,
  confirmWriteVerdict,
  type ConfirmedIntakeOutcome,
  type ConfirmedIntakeWrite,
} from './site-intake-confirmation.writer.js';

/** Cung khuon `prisma-site-intake-commercial.store.ts`: ranh gioi kieu THAT la cac ham `to*()`. */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type TxClient = any;
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const model = (client: TxClient, name: string): any => (client as Record<string, any>)[name];

const OPEN_RUN_STATUSES = ['PLANNED', 'ACTIVE'] as const;

const toOpenRun = (row: Pick<RunRow, 'id' | 'code' | 'status'>): SiteIntakeOpenRun => ({
  runId: row.id,
  code: row.code,
  status: row.status,
});

/**
 * LAN TAI XE XAC NHAN tren Postgres — MOT giao dich, duoi khoa tu van cua XE (`#398`).
 *
 * ============================================================================================
 * VI SAO KHONG CON DI QUA `MovementService`
 * ============================================================================================
 *
 * Truoc day vong chay, phan cong, chang va lan nhan viec la BON giao dich rieng qua
 * `MovementService`, va phep kiem "lai xe dang co vong chay mo" doc TRUOC ca bon ma khong khoa.
 * `PlanningService.commit()` cung hoi "xe co viec tai xe nhan chua co don" khong khoa. Hai phep
 * kiem cung qua duoc thi xe ket thuc voi HAI vong chay mo cho co the la cung mot viec that, hoac
 * (MULTI) mot chang CO HANG thu hai noi vao vong chay cua tai xe khi viec van `PENDING`. Hai lan
 * bam KHAC khoa cua cung mot lai xe (#267) cung lot qua dung khe do.
 *
 * Nay ca bon lan ghi + ba dong kiem toan nam trong MOT giao dich, sau
 * `pg_advisory_xact_lock('transport-vehicle-runs:<vehicleId>')` — khoa ma bo lap ke hoach gianh
 * sau khoa don va truoc khoa hang vong chay (`requireVehicleFreeOfPendingIntake()`). Duoi khoa,
 * ba cau hoi duoc hoi LAI (`confirmWriteVerdict`). Lan xac nhan CHI gianh khoa xe: khong khoa don,
 * khong khoa hang vong chay co san — nen no khong the dung giua mot chu trinh cho doi.
 *
 * Nhung gi `MovementService` tung giu cho lan ghi nay van duoc giu, chi la o day:
 *   · trang thai: vong chay `PLANNED` (mac dinh cua bang), chang `PLANNED`;
 *   · dau vet kiem toan: CUNG ba ma hanh dong (`transport.run.create`, `transport.run.assign`,
 *     `transport.run.leg.add`), dat qua `AuditLogService.entryFor` (cung muc che) va ghi CUNG
 *     giao dich — mot cu chet khong de lai su that ma khong co dau vet;
 *   · ngay nghiep vu: `SiteIntakeService` chot MOT lan theo mui gio tenant va truyen vao.
 *
 * `ReadCommitted` la du vi cung ly do da ghi o `underRunLock()`: moi phep doc co gia tri chay SAU
 * khi khoa da trong tay, nen no thay ban commit moi nhat — ke ca vong chay bo lap ke hoach vua ghi.
 */
@Injectable()
export class PrismaSiteIntakeConfirmationWriter extends SiteIntakeConfirmationWriter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {
    super();
  }

  write(input: ConfirmedIntakeWrite): Promise<ConfirmedIntakeOutcome> {
    return this.prisma.$transaction(
      async (tx: unknown) => {
        const client = tx as TxClient;
        await lockVehicleRuns(client, input.vehicleId);

        const refusal = confirmWriteVerdict(await this.factsUnderLock(client, input));
        if (refusal !== null) return refusal;
        return this.create(client, input);
      },
      { isolationLevel: 'ReadCommitted', maxWait: 10_000, timeout: 20_000 },
    );
  }

  private async factsUnderLock(client: TxClient, input: ConfirmedIntakeWrite) {
    const { driverId, clientEventId } = input.intake;
    const replay: IntakeRow | null = await model(client, 'transportRunSiteIntake').findUnique({
      where: { driverId_clientEventId: { driverId, clientEventId } },
    });
    const select = { id: true, code: true, status: true } as const;
    const driverRuns: RunRow[] = await model(client, 'transportVehicleRun').findMany({
      where: {
        status: { in: [...OPEN_RUN_STATUSES] },
        assignments: { some: { driverId, effectiveTo: null } },
      },
      orderBy: { code: 'asc' },
      select,
    });
    const vehicleRuns: RunRow[] = await model(client, 'transportVehicleRun').findMany({
      where: { vehicleId: input.vehicleId, status: { in: [...OPEN_RUN_STATUSES] } },
      orderBy: { code: 'asc' },
      select,
    });
    return {
      replay: replay ? toIntake(replay) : null,
      driverOpenRuns: driverRuns.map(toOpenRun),
      vehicleOpenRuns: vehicleRuns.map(toOpenRun),
    };
  }

  private async create(
    client: TxClient,
    input: ConfirmedIntakeWrite,
  ): Promise<ConfirmedIntakeOutcome> {
    const { intake } = input;
    const actor = intake.confirmedBy;

    const run = toRun(
      await model(client, 'transportVehicleRun').create({
        data: {
          code: input.runCode,
          vehicleId: input.vehicleId,
          businessDate: intake.businessDate,
          note: null,
        },
      }),
    );
    const assignment = toAssignment(
      (await model(client, 'transportRunAssignment').create({
        data: {
          runId: run.id,
          driverId: intake.driverId,
          effectiveFrom: intake.confirmedAt,
          assignedBy: actor,
        },
      })) as AssignmentRow,
    );
    const leg = toLeg(
      (await model(client, 'transportRunLeg').create({
        data: {
          runId: run.id,
          sequence: 1,
          // `LOADED` kem `orderId` NULL la trang thai ma Lane A viet ro la hop le: *"dang cho hang
          // nhung don chua nhap xong"*. `EMPTY` se noi sai — lai xe den A de LAY HANG.
          kind: 'LOADED',
          orderId: null,
          originLabel: input.originLabel,
          destinationLabel: input.destinationLabel,
          businessDate: intake.businessDate,
          distanceKm: null,
          plannedDistanceKm: null,
          note: null,
        },
      })) as LegRow,
    );
    // Phan thuong mai `PENDING` ra doi trong CHINH lenh nay — xem `intakeCreateData()`.
    const row: IntakeRow = await model(client, 'transportRunSiteIntake').create({
      data: intakeCreateData({ ...intake, runId: run.id, legId: leg.id }),
    });

    await this.appendAudit(client, [
      {
        actor,
        action: 'transport.run.create',
        entityType: 'TransportVehicleRun',
        entityId: run.id,
        before: null,
        after: run,
      },
      {
        actor,
        action: 'transport.run.assign',
        entityType: 'TransportRunAssignment',
        entityId: assignment.id,
        before: null,
        after: assignment,
      },
      {
        actor,
        action: 'transport.run.leg.add',
        entityType: 'TransportRunLeg',
        entityId: leg.id,
        before: null,
        after: leg,
      },
    ]);
    return { kind: 'CREATED', intake: toIntake(row) };
  }

  private async appendAudit(
    client: TxClient,
    commands: readonly AppendAuditLogCommand[],
  ): Promise<void> {
    for (const command of commands) {
      const entry = this.audit.entryFor(command);
      await model(client, 'auditLog').create({
        data: {
          actor: entry.actor,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          before: entry.before === null ? Prisma.DbNull : (entry.before as Prisma.InputJsonValue),
          after: entry.after === null ? Prisma.DbNull : (entry.after as Prisma.InputJsonValue),
          requestId: entry.requestId,
          createdAt: new Date(entry.createdAt),
        },
      });
    }
  }
}
