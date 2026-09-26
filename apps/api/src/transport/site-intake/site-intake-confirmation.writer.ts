import type { MovementService } from '../movement/movement.service.js';
import type { VehicleRun } from '../movement/movement.types.js';
import type { SiteIntakeOpenRun, TransportSiteIntakeCoreFacts } from './site-intake-facts.port.js';
import type {
  CreateRunSiteIntakeInput,
  RunSiteIntakeRepository,
} from './site-intake.repository.js';
import type { RunSiteIntake } from './site-intake.types.js';

/**
 * LAN GHI cua mot lan tai xe xac nhan nhan viec tai dia diem A — `#267` H4, `#398`.
 *
 * `SiteIntakeService.confirm()` quyet MOI dieu doc duoc truoc (lai xe, dia diem, xe, vi tri), roi
 * giao lan GHI cho cong nay. Cong nay lam DUNG hai viec va chi hai viec:
 *
 *   1. hoi lai ba cau "con dung khong" DUOI khoa cua chinh xe (`confirmWriteVerdict`);
 *   2. neu dung, ghi vong chay + phan cong + chang CO HANG + lan nhan viec (+ phan thuong mai
 *      `PENDING` o ban Postgres) nhu MOT don vi.
 *
 * Loi va cham unique (ma vong chay, khoa chong lap, ban dinh vi) KHONG duoc dich o day: no di
 * nguyen len `SiteIntakeService`, noi MOT khoi dich cho ca hai ban hien thuc.
 */
export interface ConfirmedIntakeWrite {
  readonly vehicleId: string;
  /** Ma vong chay TAT DINH tu `(driverId, clientEventId)` — xem `runCodeFor()`. */
  readonly runCode: string;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly intake: Omit<CreateRunSiteIntakeInput, 'runId' | 'legId'>;
}

export type ConfirmedIntakeOutcome =
  | { readonly kind: 'CREATED'; readonly intake: RunSiteIntake }
  | { readonly kind: 'REPLAYED'; readonly intake: RunSiteIntake }
  | { readonly kind: 'DRIVER_HAS_OPEN_RUN'; readonly openRuns: readonly SiteIntakeOpenRun[] }
  | { readonly kind: 'VEHICLE_BUSY'; readonly openRuns: readonly SiteIntakeOpenRun[] };

export type ConfirmWriteRefusal = Exclude<ConfirmedIntakeOutcome, { readonly kind: 'CREATED' }>;

/** Ba su that doc DUOI khoa xe — hoac, o ban trong bo nho, duoi hang doi cua chinh cong nay. */
export interface ConfirmWriteFacts {
  /** Lan nhan viec da mang CUNG khoa `(driverId, clientEventId)`. */
  readonly replay: RunSiteIntake | null;
  /** Vong chay mo ma lai xe DANG cam (phan cong con hieu luc). */
  readonly driverOpenRuns: readonly SiteIntakeOpenRun[];
  /** Vong chay mo cua XE, bat ke ai cam — ke ca vong chay chua ai cam. */
  readonly vehicleOpenRuns: readonly SiteIntakeOpenRun[];
}

/**
 * PHAN XU TRUOC LAN GHI — ham thuan, dung chung cho hai ban hien thuc de THU TU la mot.
 *
 * `null` = duoc ghi. Thu tu la hop dong:
 *
 *   1. gui lai CUNG khoa -> tra ve lan nhan viec cu (ke ca khi no da lam 2/3 thanh "khong con dung");
 *   2. lai xe dang cam vong chay mo -> `DRIVER_HAS_OPEN_RUN` (cung ma voi phep kiem khong khoa cua
 *      `#267`, de hai lan bam khac khoa cung luc nhan DUNG cau tra loi cua lan bam tuan tu);
 *   3. xe dang co vong chay mo cua bat ky ai -> `VEHICLE_BUSY`.
 */
export function confirmWriteVerdict(facts: ConfirmWriteFacts): ConfirmWriteRefusal | null {
  if (facts.replay !== null) return { kind: 'REPLAYED', intake: facts.replay };
  if (facts.driverOpenRuns.length > 0) {
    return { kind: 'DRIVER_HAS_OPEN_RUN', openRuns: facts.driverOpenRuns };
  }
  if (facts.vehicleOpenRuns.length > 0) {
    return { kind: 'VEHICLE_BUSY', openRuns: facts.vehicleOpenRuns };
  }
  return null;
}

export const isOpenRun = (run: Pick<VehicleRun, 'status'>): boolean =>
  run.status === 'PLANNED' || run.status === 'ACTIVE';

export abstract class SiteIntakeConfirmationWriter {
  abstract write(input: ConfirmedIntakeWrite): Promise<ConfirmedIntakeOutcome>;
}

/**
 * Ban trong bo nho — duong chay THAT cua `PERSISTENCE=memory`.
 *
 * Ghi qua `MovementService` (ma trang thai, dau vet kiem toan, ngay nghiep vu cua Lane A) roi qua
 * kho xac nhan — BON lan ghi tach roi, KHONG co giao dich: mot cu chet giua chung de lai mot vong
 * chay khong co ban ghi xac nhan. Moi lenh xep hang qua MOT hang doi cua chinh cong nay — song doi
 * trong tien trinh cua khoa xe o ban Postgres — nen hai lan bam cung luc van thay nhau. Hang doi do
 * KHONG chan bo lap ke hoach trong bo nho (no bo qua `planGuardOrderId`): bang chung dong thoi giua
 * lap ke hoach va xac nhan la Postgres.
 */
export class MovementSiteIntakeConfirmationWriter extends SiteIntakeConfirmationWriter {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly movement: MovementService,
    private readonly intakes: RunSiteIntakeRepository,
    private readonly core: TransportSiteIntakeCoreFacts,
  ) {
    super();
  }

  write(input: ConfirmedIntakeWrite): Promise<ConfirmedIntakeOutcome> {
    const next = this.tail.then(() => this.writeNow(input));
    this.tail = next.catch(() => undefined);
    return next;
  }

  private async writeNow(input: ConfirmedIntakeWrite): Promise<ConfirmedIntakeOutcome> {
    const { driverId, clientEventId, confirmedBy: actor, businessDate } = input.intake;
    const refusal = confirmWriteVerdict({
      replay: await this.intakes.findByEvent(driverId, clientEventId),
      driverOpenRuns: await this.core.listOpenRunsForDriver(driverId),
      vehicleOpenRuns: (await this.movement.listRuns())
        .filter((run) => run.vehicleId === input.vehicleId && isOpenRun(run))
        .map((run) => ({ runId: run.id, code: run.code, status: run.status })),
    });
    if (refusal !== null) return refusal;

    const run = await this.movement.createRun(
      { code: input.runCode, vehicleId: input.vehicleId, businessDate, note: null },
      actor,
    );
    await this.movement.assignRun(run.id, { driverId }, actor);
    const leg = await this.movement.addLeg(
      run.id,
      {
        sequence: 1,
        kind: 'LOADED',
        orderId: null,
        originLabel: input.originLabel,
        destinationLabel: input.destinationLabel,
        businessDate,
        distanceKm: null,
        note: null,
      },
      actor,
    );
    const intake = await this.intakes.create({ ...input.intake, runId: run.id, legId: leg.id });
    return { kind: 'CREATED', intake };
  }
}
