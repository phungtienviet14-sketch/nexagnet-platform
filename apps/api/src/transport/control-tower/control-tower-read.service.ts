import { Inject, Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { toBusinessDate } from '../business-date.js';
import { TRANSPORT_CORE_POLICY, type TransportCorePolicy } from '../transport-policy.js';
import { CONTROL_TOWER_DECISIONS } from './control-tower-decisions.js';
import {
  ControlTowerAlertFacts,
  ControlTowerCheckpointFacts,
  ControlTowerClaimFacts,
  ControlTowerFieldFacts,
  ControlTowerCoreFacts,
  ControlTowerFuelFacts,
} from './control-tower-facts.port.js';
import {
  buildOperationsBoard,
  countFleetPresence,
  sortActionQueue,
  type ControlTowerCoreInput,
} from './control-tower-projection.js';
import {
  PENDING_ACTION_QUEUE_KINDS,
  type ActionQueueItem,
  type ControlTowerSource,
  type ControlTowerView,
  type PendingActionQueueEntry,
} from './control-tower.types.js';
import type { OperationalAlert } from '../asset-compliance/operational-alerts.js';
import type { RunTimeline } from '../checkpoint/run-timeline.js';
import type { VehicleRun } from '../movement/movement.types.js';

/**
 * DAU VAO cua mot lan doc — `ControlTowerCoreInput` cong dong thoi gian goc.
 *
 * Phep chieu chi can `legPhases`; hang viec can `entries[].warnings`. Giu ca hai TRONG MOT lan doc
 * thay vi goi cong hai lan: hai lan doc cach nhau vai chuc mili giay co the tra ve hai hien truong
 * khac nhau, va luc do bang se hien mot cot noi mot dang con hang viec noi mot dang khac.
 */
interface ControlTowerReadInput extends ControlTowerCoreInput {
  readonly timelinesByRun: ReadonlyMap<string, RunTimeline> | null;
}

/**
 * CANH BAO CUA DONG THOI GIAN -> hang viec.
 *
 * `run-timeline.ts` da quyet dinh cai gi la canh bao; o day chi doi ten sang tu vung hang viec, cung
 * khuon `toQueueItem` cho canh bao van hanh. Khong mot phep suy nao them: bang KHONG tu hoi "chang
 * nay le ra phai co moc gi" — do la viec cua `checkpoint-lifecycle.ts`, va no thuoc capability khac.
 */
const checkpointQueueItems = (
  timelinesByRun: ReadonlyMap<string, RunTimeline> | null,
  runs: readonly VehicleRun[],
): readonly ActionQueueItem[] => {
  if (timelinesByRun === null) return [];

  const codeByRun = new Map(runs.map((run) => [run.id, run.code] as const));
  const items: ActionQueueItem[] = [];

  for (const [runId, timeline] of timelinesByRun) {
    for (const entry of timeline.entries) {
      if (!entry.warnings.includes('LOCATION_PROOF_MISSING')) continue;
      items.push({
        kind: 'CHECKPOINT_LOCATION_PROOF_MISSING',
        severity: 'WARNING',
        subject: {
          kind: 'RUN_CHECKPOINT',
          id: entry.checkpointId,
          reference: codeByRun.get(runId) ?? null,
        },
        detail: {
          checkpointType: entry.type,
          runId,
          legId: entry.legId,
          driverId: entry.driverId,
        },
      });
    }
  }

  return items;
};

/**
 * THAP DIEU HANH — mot lan doc, nhieu nguon, khong mot duong ghi nao.
 *
 * ===========================================================================
 * DANG KY O TANG UNG DUNG (`app-composition.ts`), khong trong `TransportModule`.
 *
 * Cung ly le da viet cho `OperationalAlertsService`, va no la ly le CAU TRUC: bang nay doc ba nguon
 * nam o ba capability khac (`transport-costing`, `transport-fuel`, `transport-asset-compliance`).
 * Neu `TransportModule` `imports` ba module do thi `transport-core` khong con bat duoc mot minh —
 * tuc pha dung cai `dependencies: []` ma T1 §10.1 hua cho no.
 *
 * O tang ung dung, ba adapter chi TON TAI khi capability so huu chung duoc bat. Khi vang mat,
 * service nhan `undefined` qua `@Optional()` va phat ra `unavailableSources`.
 *
 * ===========================================================================
 * MOT NGUON HONG KHONG DUOC LAM HONG CA BANG.
 *
 * `Promise.all` se lam mot loi cua `transport-fuel` xoa sach ca bang dieu hanh — ke ca phan
 * `transport-core` von khong lien quan. Nguoi truc luc do mat CA cong cu de biet chuyen gi dang
 * xay ra, dung vao luc ho can no nhat. Nen moi nguon tuy chon duoc doc rieng va mot loi chi lam
 * mat DUNG muc do, kem mot dong quyet dinh `CONTROL_TOWER_SOURCE_FAILED`.
 */
@Injectable()
export class ControlTowerReadService {
  constructor(
    private readonly core: ControlTowerCoreFacts,
    @Inject(TRANSPORT_CORE_POLICY) private readonly corePolicy: TransportCorePolicy,
    @Optional() private readonly claims?: ControlTowerClaimFacts,
    @Optional() private readonly fuel?: ControlTowerFuelFacts,
    @Optional() private readonly alerts?: ControlTowerAlertFacts,
    @Optional() private readonly checkpoints?: ControlTowerCheckpointFacts,
    @Optional() private readonly telemetry?: TelemetryService,
    /**
     * HIEN TRUONG (`#279` Lane O) — phien cho dang mo, phu cap cho duyet, chung tu con thieu.
     *
     * `@Optional()` cung khuon bon cong tren: vang mat thi cot `WAITING` trong kem ma ly do, va hai
     * muc hang viec khong duoc phat ra. Bang van ve duoc — no chi noi that ve nhung gi no khong
     * biet.
     */
    @Optional() private readonly field?: ControlTowerFieldFacts,
  ) {}

  async view(now?: Date): Promise<ControlTowerView> {
    const generatedFor = toBusinessDate(now ?? new Date(), this.corePolicy.timeZone);
    const unavailableSources: ControlTowerSource[] = [];

    /*
     * MOC DOC TRUOC BANG, va do la thu tu bat buoc: ba cot `PICKUP`/`LOADING`/`ARRIVED` va truong
     * `currentLeg.phase` cua moi the deu la ket qua cua lan doc nay. Doc sau roi va vao bang se
     * phai dung mot bang thu hai.
     */
    const coreInput = await this.readCore(unavailableSources);

    /*
     * HIEN TRUONG DOC TRUOC BANG, cung ly do voi moc: cot `WAITING` la ket qua cua lan doc nay.
     * Doc sau roi va vao bang se phai dung mot bang thu hai.
     */
    const fieldInput = await this.readField(unavailableSources);

    /*
     * MOT dau vao hop nhat, dung MOT lan. Ghep o day chu khong o ba cho goi: ba ban ghep se lech
     * nhau o lan sua thu ba, va bang se ve mot cot bang mot nguon con hang viec dung mot nguon
     * khac.
     */
    const boardInput: ControlTowerCoreInput = {
      ...coreInput,
      waitingLegIds: fieldInput.waitingLegIds,
    };

    const board = buildOperationsBoard(boardInput);
    const fleet = countFleetPresence(boardInput);

    const queue: ActionQueueItem[] = [
      ...this.coreQueueItems(boardInput),
      ...checkpointQueueItems(coreInput.timelinesByRun, coreInput.runs),
    ];

    queue.push(...(await this.claimQueueItems(unavailableSources)));
    queue.push(...(await this.fuelQueueItems(unavailableSources)));
    queue.push(...(await this.alertQueueItems(unavailableSources, now)));
    queue.push(...fieldInput.queue);

    for (const source of unavailableSources) {
      this.telemetry?.decision({
        vocabulary: CONTROL_TOWER_DECISIONS,
        point: 'control_tower.compile',
        outcome: 'degraded',
        reason: 'CONTROL_TOWER_SOURCE_UNAVAILABLE',
        detail: { source },
      });
    }

    this.telemetry?.decision({
      vocabulary: CONTROL_TOWER_DECISIONS,
      point: 'control_tower.board_projection',
      outcome: 'allowed',
      reason: 'BOARD_CHECKPOINT_COLUMNS_UNAVAILABLE',
      detail: { columns: board.filter((column) => column.unavailableReason !== null).length },
    });

    this.telemetry?.decision({
      vocabulary: CONTROL_TOWER_DECISIONS,
      point: 'control_tower.compile',
      outcome: 'allowed',
      reason: 'CONTROL_TOWER_COMPILED',
      detail: { queue: queue.length, unavailableSources: unavailableSources.length },
    });

    const sorted = sortActionQueue(queue);
    return {
      generatedFor,
      board,
      fleet,
      queue: sorted,
      queueTotal: sorted.length,
      unavailableSources,
      pendingWork: PENDING_WORK,
    };
  }

  /**
   * `Omit<..., 'waitingLegIds'>` — nguon hien truong den tu MOT cong KHAC (`readField`).
   *
   * Bo truong do ra khoi kieu tra ve o day thay vi tra `null` roi ghi de: mot `null` tam thoi la
   * mot gia tri SAI di qua ba dong ma, va lan quen ghi de dau tien se lam cot `WAITING` cong bo
   * "khong co nguon" o dung khach DANG co nguon.
   */
  private async readCore(
    unavailable: ControlTowerSource[],
  ): Promise<Omit<ControlTowerReadInput, 'waitingLegIds'>> {
    const [runs, vehicles, drivers, orders] = await Promise.all([
      this.core.listRuns(),
      this.core.listVehicles(),
      this.core.listDrivers(),
      this.core.listOrders(),
    ]);

    /*
     * Chi doc chang/phan cong cua vong chay CON TREN BANG. Vong chay da huy khong len bang
     * (`columnForRun` tra `null`), nen doc chang cua no la N lan goi kho cho mot o khong ai thay.
     */
    const onBoard = runs.filter((run) => run.status !== 'CANCELLED');
    const legEntries = await Promise.all(
      onBoard.map(async (run) => [run.id, await this.core.listLegs(run.id)] as const),
    );
    const assignmentEntries = await Promise.all(
      onBoard.map(async (run) => [run.id, await this.core.listRunAssignments(run.id)] as const),
    );

    const timelinesByRun = await this.readTimelines(onBoard, unavailable);

    return {
      runs,
      legsByRun: new Map(legEntries),
      assignmentsByRun: new Map(assignmentEntries),
      vehicles,
      drivers,
      orderCodesById: new Map(orders.map((order) => [order.id, order.code] as const)),
      timelinesByRun,
      legPhasesByRun:
        timelinesByRun === null
          ? null
          : new Map(
              [...timelinesByRun].map(([runId, timeline]) => [runId, timeline.legPhases] as const),
            ),
    };
  }

  /**
   * DONG THOI GIAN cua tung vong chay dang tren bang — hoac `null` khi khong co nguon.
   *
   * `null` mang mot y nghia CU THE ma mot `Map` rong khong mang duoc: xem chu thich cua
   * `ControlTowerCoreInput.legPhasesByRun`. Nen ca hai duong hong deu tra `null`, khong tra `Map`
   * rong: capability tat, va lan doc that bai. Mot lan doc that bai ma tra `Map` rong se lam ba cot
   * hien ra NHU THE hom nay khong xe nao o buoc do — mot cau khang dinh sai ve hien truong.
   */
  private async readTimelines(
    onBoard: readonly VehicleRun[],
    unavailable: ControlTowerSource[],
  ): Promise<ReadonlyMap<string, RunTimeline> | null> {
    const checkpoints = this.checkpoints;
    if (!checkpoints) {
      unavailable.push('CHECKPOINT');
      return null;
    }

    try {
      const entries = await Promise.all(
        onBoard.map(async (run) => [run.id, await checkpoints.timelineForRun(run.id)] as const),
      );
      return new Map(entries);
    } catch (error) {
      this.telemetry?.decision({
        vocabulary: CONTROL_TOWER_DECISIONS,
        point: 'control_tower.compile',
        outcome: 'degraded',
        reason: 'CONTROL_TOWER_SOURCE_FAILED',
        detail: { source: 'CHECKPOINT', error: error instanceof Error ? error.name : 'UNKNOWN' },
      });
      unavailable.push('CHECKPOINT');
      return null;
    }
  }

  /** Viec doc duoc tu chinh `transport-core` — khong qua mot cong tuy chon nao. */
  private coreQueueItems(input: ControlTowerCoreInput): readonly ActionQueueItem[] {
    const items: ActionQueueItem[] = [];

    for (const run of input.runs) {
      if (run.status !== 'ACTIVE') continue;
      const assignments = input.assignmentsByRun.get(run.id) ?? [];
      if (assignments.some((assignment) => assignment.effectiveTo === null)) continue;
      items.push({
        kind: 'RUN_ACTIVE_WITHOUT_DRIVER',
        severity: 'CRITICAL',
        subject: { kind: 'RUN', id: run.id, reference: run.code },
        detail: { businessDate: run.businessDate },
      });
    }

    for (const [runId, legs] of input.legsByRun) {
      const run = input.runs.find((candidate) => candidate.id === runId);
      if (run === undefined) continue;
      for (const leg of legs) {
        if (leg.status !== 'COMPLETED' || leg.distanceKm !== null) continue;
        items.push({
          kind: 'RUN_LEG_MISSING_DISTANCE',
          severity: 'WARNING',
          subject: { kind: 'RUN_LEG', id: leg.id, reference: run.code },
          detail: { sequence: leg.sequence, legKind: leg.kind, runId: run.id },
        });
      }
    }

    return items;
  }

  private async claimQueueItems(
    unavailable: ControlTowerSource[],
  ): Promise<readonly ActionQueueItem[]> {
    const claims = this.claims;
    if (!claims) {
      unavailable.push('EXPENSE_CLAIMS');
      return [];
    }
    return this.guard('EXPENSE_CLAIMS', async () =>
      (await claims.listAwaitingReview()).map((claim): ActionQueueItem => ({
        kind: 'EXPENSE_CLAIM_AWAITING_REVIEW',
        severity: 'WARNING',
        subject: { kind: 'EXPENSE_CLAIM', id: claim.id, reference: null },
        detail: { driverId: claim.driverId },
      })),
    );
  }

  /**
   * NGUON HIEN TRUONG (`#279` Lane O) — mot lan doc, ba cau tra loi.
   *
   * Gop ba phep doc vao MOT ham chu khong ba ham rieng, va do la co y: ca ba den tu cung mot
   * capability, nen chung vang mat CUNG NHAU. Ba ham rieng se day `FIELD_OPERATIONS` vao
   * `unavailableSources` ba lan, va nguoi truc se doc mot bang bao thieu ba nguon trong khi chi
   * thieu mot.
   *
   * `waitingLegIds` la `null` — chu KHONG mot `Set` rong — khi cong vang mat. Xem
   * `ControlTowerCoreInput.waitingLegIds`: mot `Set` rong nghia la hom nay khong xe nao dang cho.
   */
  private async readField(unavailable: ControlTowerSource[]): Promise<{
    readonly waitingLegIds: ReadonlySet<string> | null;
    readonly queue: readonly ActionQueueItem[];
  }> {
    const field = this.field;
    if (!field) {
      unavailable.push('FIELD_OPERATIONS');
      return { waitingLegIds: null, queue: [] };
    }

    const [waitingLegIds, pendingAllowances, missingDocuments] = await Promise.all([
      field.listOpenWaitingLegIds(),
      field.countPendingAllowances(),
      field.listLegsMissingRequiredDocuments(),
    ]);

    const queue: ActionQueueItem[] = [];

    /*
     * MOT muc cho CA hang cho duyet, khong mot muc cho moi de nghi.
     *
     * Hang viec cua thap dieu hanh tra loi *"hom nay con viec gi"*, khong phai *"liet ke tung
     * viec"*. Bay khoan cho duyet la MOT viec cua nguoi van phong — mo man hinh phu cap ra va duyet
     * — chu khong phai bay dong day nhung muc khac ra khoi bang.
     *
     * VA KHONG MOT SO TIEN NAO: `detail` mang so LUONG, khong mang so DONG. `#279` O6 dat khoan tien
     * do o mot be mat rieng, voi mot quyen rieng.
     */
    if (pendingAllowances > 0) {
      queue.push({
        kind: 'DRIVER_WAITING_ALLOWANCE_AWAITING_APPROVAL',
        severity: 'WARNING',
        subject: { kind: 'RUN', id: 'pending-waiting-allowances', reference: null },
        detail: { count: pendingAllowances },
      });
    }

    for (const legId of missingDocuments) {
      queue.push({
        kind: 'DELIVERY_PROOF_DOCUMENT_MISSING',
        severity: 'WARNING',
        subject: { kind: 'RUN_LEG', id: legId, reference: null },
        detail: {},
      });
    }

    return { waitingLegIds, queue };
  }

  private async fuelQueueItems(
    unavailable: ControlTowerSource[],
  ): Promise<readonly ActionQueueItem[]> {
    const fuel = this.fuel;
    if (!fuel) {
      unavailable.push('FUEL');
      return [];
    }
    return this.guard('FUEL', async () => {
      const [entries, reconciliations] = await Promise.all([
        fuel.listEntriesAwaitingVerification(),
        fuel.listOpenReconciliations(),
      ]);
      return [
        ...entries.map((entry): ActionQueueItem => ({
          kind: 'FUEL_ENTRY_AWAITING_VERIFICATION',
          severity: 'WARNING',
          subject: { kind: 'FUEL_ENTRY', id: entry.id, reference: null },
          detail: { vehicleId: entry.vehicleId },
        })),
        ...reconciliations.map((reconciliation): ActionQueueItem => ({
          kind: 'FUEL_RECONCILIATION_OPEN',
          severity: 'INFO',
          subject: { kind: 'FUEL_RECONCILIATION', id: reconciliation.id, reference: null },
          detail: {
            periodStart: reconciliation.periodStart,
            periodEnd: reconciliation.periodEnd,
          },
        })),
      ];
    });
  }

  /**
   * Canh bao cua `TX-06` doc NGUYEN VEN roi doi ten sang tu vung hang viec.
   *
   * `unavailableSources` cua chinh bang canh bao KHONG duoc keo len day: no noi ve nguon cua NO
   * (tieu hao dau, so quy), va gop hai muc do vao mot danh sach se lam nguoi doc tuong
   * `transport-fuel` dang tat trong khi thuc ra chi mot muc con cua bang canh bao vang.
   */
  private async alertQueueItems(
    unavailable: ControlTowerSource[],
    now?: Date,
  ): Promise<readonly ActionQueueItem[]> {
    const alerts = this.alerts;
    if (!alerts) {
      unavailable.push('OPERATIONAL_ALERTS');
      return [];
    }
    return this.guard('OPERATIONAL_ALERTS', async () => {
      const feed = await alerts.feed(now);
      return feed.alerts.flatMap((alert) => toQueueItem(alert) ?? []);
    });
  }

  private async guard(
    source: ControlTowerSource,
    read: () => Promise<readonly ActionQueueItem[]>,
  ): Promise<readonly ActionQueueItem[]> {
    try {
      return await read();
    } catch (error) {
      this.telemetry?.decision({
        vocabulary: CONTROL_TOWER_DECISIONS,
        point: 'control_tower.compile',
        outcome: 'degraded',
        reason: 'CONTROL_TOWER_SOURCE_FAILED',
        detail: { source, error: error instanceof Error ? error.name : 'UNKNOWN' },
      });
      return [];
    }
  }
}

/**
 * Anh xa canh bao -> muc hang viec. `null` cho canh bao thap dieu hanh KHONG nhan.
 *
 * `DRIVER_FUND_BALANCE_UNUSUAL` co nhan va giu NGUYEN muc `INFO` cua no: `GD-12` noi ro so du quy
 * am KHONG phai mot khoan no cua lai xe, nen nang muc len se bien mot con so ke toan thanh mot cao
 * buoc.
 */
const toQueueItem = (alert: OperationalAlert): ActionQueueItem | null => {
  const base = {
    severity: alert.severity,
    subject: {
      kind: alert.subjectKind,
      /*
       * Giay to CUA CONG TY khong co chu the — `subjectId` la `null`. Dung chinh chuoi `COMPANY`
       * lam `id` thay vi mot chuoi rong: mot `id` rong di qua `localeCompare` van xep duoc nhung
       * doc len khong phan biet duoc voi "thieu du lieu".
       */
      id: alert.subjectId ?? 'COMPANY',
      reference: null,
    },
    detail: alert.detail,
  } as const;

  switch (alert.kind) {
    case 'COMPLIANCE_DOCUMENT_EXPIRED':
    case 'COMPLIANCE_DOCUMENT_EXPIRING':
    case 'COMPLIANCE_DOCUMENT_MISSING':
    case 'MAINTENANCE_OVERDUE':
    case 'MAINTENANCE_DUE_SOON':
    case 'VEHICLE_STATE_INCONSISTENT':
    case 'FUEL_CONSUMPTION_ABNORMAL':
    case 'DRIVER_FUND_BALANCE_UNUSUAL':
      return { kind: alert.kind, ...base };
    default:
      return null;
  }
};

/**
 * VIEC CHUA THEO DOI DUOC — hang so, vi ly do cua tung muc la mot su that ve KIEN TRUC hom nay,
 * khong phai mot dieu kien luc chay.
 */
const PENDING_WORK: readonly PendingActionQueueEntry[] = PENDING_ACTION_QUEUE_KINDS.map((kind) => {
  switch (kind) {
    case 'CUSTOMER_AR_OVERDUE':
      return { kind, reason: 'AWAITING_RECEIVABLE_DUE_DATE_SOURCE' } as const;
    case 'LOCATION_PROOF_REVIEW':
      return { kind, reason: 'AWAITING_FLEET_WIDE_PROOF_QUERY' } as const;
    /*
     * MUC NAY DOI MOT NGUONG, KHONG DOI MOT NGUON.
     *
     * `#279` O5 da lam ra phien cho: gio mo, gio dong, thoi luong doc duoc. Nen giu no o
     * `AWAITING_WAITING_SESSION_SOURCE` bay gio se noi doi — nguon DA co.
     *
     * Cai thieu la mot con so: *"cho bao lau thi dang bao dong"*. `#279` O6 cam bia ra
     * (*"do not invent thresholds/rates"*), va mot muc "qua 4 tieng" nghe vo hai se thanh con so
     * van phong dua vao de goi dien cho lai xe — trong khi khong ai o phia khach hang da noi con so
     * do la bao nhieu.
     */
    case 'RECEIVER_WAITING_ABOVE_THRESHOLD':
      return { kind, reason: 'AWAITING_WAITING_THRESHOLD_POLICY' } as const;
    default:
      return { kind, reason: 'AWAITING_CHECKPOINT_SOURCE' } as const;
  }
});
