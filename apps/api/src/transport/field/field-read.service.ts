import { Inject, Injectable, Optional } from '@nestjs/common';
import { TransportCheckpointCoreFacts } from '../checkpoint/checkpoint-facts.port.js';
import { CheckpointRepository } from '../checkpoint/checkpoint.repository.js';
import { deriveLegPhase } from '../checkpoint/run-timeline.js';
import type { RunCheckpoint } from '../checkpoint/checkpoint.types.js';
import {
  DEFAULT_DOCUMENT_REQUIREMENT_POLICY,
  TRANSPORT_DOCUMENT_POLICY,
  missingDocumentTypes,
  type DocumentRequirementPolicy,
} from '../document/document-lifecycle.js';
import { OperationalDocumentRepository } from '../document/document.repository.js';
import type { OperationalDocument } from '../document/document.types.js';
import { PhysicalReceiptHandoverRepository } from '../document/handover.repository.js';
import { TRANSPORT_CLOCK } from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import { WaitingSessionRepository } from '../waiting/waiting.repository.js';
import { elapsedSecondsOf } from '../waiting/waiting.types.js';
import { fieldActionsFor } from './field-actions.js';
import { TransportFieldCoreFacts, type FieldLegFacts } from './field-facts.port.js';
import type {
  DriverFieldDocument,
  DriverFieldLeg,
  DriverFieldRun,
  DriverFieldWork,
} from './field.types.js';

/**
 * VIEC HIEN TRUONG cua mot lai xe — `#279` O9/O11.
 *
 * ============================================================================================
 * MOT PHEP CHIEU, KHONG PHAI MOT BANG THU HAI
 * ============================================================================================
 *
 * Cung khang dinh ma `run-timeline.ts` da dat: khong cache, khong bang read-model, khong cot
 * `nextAction` ghi san o dau. Dua vao bon nguon da ghi (moc, phien cho, chung tu, ban giao), tra ra
 * mot man hinh. Chay hai lan tren cung du lieu cho cung ket qua.
 *
 * ============================================================================================
 * KHONG MOT HAM GHI NAO
 * ============================================================================================
 *
 * Bon kho duoc tiem vao day deu CO ham ghi, va dich vu nay khong goi mot ham nao trong so do —
 * `field-read-only.spec.ts` doc chinh ma nguon de giu dieu ay. Mot man hinh "xem viec" ma ghi duoc
 * la mot man hinh se co luc ghi nham.
 *
 * ============================================================================================
 * KHONG MOT TRUONG TIEN NAO
 * ============================================================================================
 *
 * `#279` O9 + `INV-09`. Kieu tra ve khong co truong tien, va `field-read-only.spec.ts` quet chinh
 * payload that de chung minh dieu do thay vi chi tin vao kieu.
 */
@Injectable()
export class DriverFieldReadService {
  constructor(
    private readonly core: TransportFieldCoreFacts,
    private readonly identity: TransportCheckpointCoreFacts,
    private readonly checkpoints: CheckpointRepository,
    private readonly waiting: WaitingSessionRepository,
    private readonly documents: OperationalDocumentRepository,
    private readonly handovers: PhysicalReceiptHandoverRepository,
    @Optional()
    @Inject(TRANSPORT_DOCUMENT_POLICY)
    private readonly documentPolicy: DocumentRequirementPolicy = DEFAULT_DOCUMENT_REQUIREMENT_POLICY,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  /** Viec cua CHINH MINH — danh tinh tu phien, khong tu than yeu cau. */
  async workFor(authUserId: string): Promise<DriverFieldWork> {
    const driver = await this.identity.findDriverByAuthUserId(authUserId);
    if (!driver) {
      throw TransportDomainError.denied(
        'CHECKPOINT_DRIVER_BINDING_MISSING',
        'Tai khoan dang nhap chua noi voi mot ho so lai xe nao',
      );
    }

    const now = this.now();
    const runs: DriverFieldRun[] = [];
    for (const run of await this.core.listOpenRunsForDriver(driver.id)) {
      const legFacts = await this.core.listLegs(run.id);
      const orderCodes = await this.core.orderCodes(
        legFacts.flatMap((leg) => (leg.orderId === null ? [] : [leg.orderId])),
      );
      const runCheckpoints = await this.checkpoints.listForRun(run.id);
      const runDocuments = await this.documents.listForRun(run.id);

      const legs: DriverFieldLeg[] = [];
      for (const leg of legFacts) {
        legs.push(
          await this.buildLeg({
            leg,
            orderCode: leg.orderId === null ? null : (orderCodes.get(leg.orderId) ?? null),
            runTerminal: run.status === 'COMPLETED' || run.status === 'CANCELLED',
            checkpoints: runCheckpoints.filter((row) => row.legId === leg.id),
            documents: runDocuments.filter((row) => row.legId === leg.id),
            now,
          }),
        );
      }
      runs.push({ runId: run.id, runCode: run.code, legs });
    }

    return { serverNow: now.toISOString(), runs };
  }

  private async buildLeg(input: {
    leg: FieldLegFacts;
    orderCode: string | null;
    runTerminal: boolean;
    checkpoints: readonly RunCheckpoint[];
    documents: readonly OperationalDocument[];
    now: Date;
  }): Promise<DriverFieldLeg> {
    const recordedTypes = input.checkpoints.map((row) => row.type);
    const active = input.documents.filter((row) => row.status === 'ACTIVE');
    const documentTypes = active.map((row) => row.type);

    const open = await this.waiting.findOpenForLeg(input.leg.id);
    const handovers =
      input.leg.orderId === null ? [] : await this.handovers.listForOrder(input.leg.orderId);

    /*
     * CANH BAO thieu chung tu chi ap cho chang CO HANG. Mot chang RONG khong giao gi cho ai, nen
     * mot canh bao "thieu bien nhan giao hang" o do la mot canh bao GIA — va mot canh bao gia lam
     * nguoi ta thoi doc canh bao.
     */
    const loaded = input.leg.kind === 'LOADED';

    return {
      legId: input.leg.id,
      sequence: input.leg.sequence,
      kind: input.leg.kind,
      originLabel: input.leg.originLabel,
      destinationLabel: input.leg.destinationLabel,
      orderCode: input.orderCode,
      orderId: input.leg.orderId,
      phase: deriveLegPhase(recordedTypes),
      recordedTypes,
      arrivalCheckpointId: arrivalCheckpointIdOf(input.checkpoints),
      waiting:
        open === null
          ? null
          : {
              sessionId: open.id,
              reason: open.reason,
              startedAt: open.startedAt.toISOString(),
              elapsedSeconds: elapsedSecondsOf(open, input.now),
            },
      documents: active.map(toFieldDocument),
      missingDocumentTypes: loaded ? missingDocumentTypes(this.documentPolicy, documentTypes) : [],
      receiptHandover: handovers.at(-1)?.state ?? null,
      nextActions: fieldActionsFor({
        recordedTypes,
        documentTypes,
        requiredDocumentTypes: loaded ? this.documentPolicy.requiredOnLoadedLeg : [],
        hasOpenWaiting: open !== null,
        hasOrder: input.leg.orderId !== null,
        receiptHandoverRecorded: handovers.length > 0,
        runTerminal: input.runTerminal,
      }),
    };
  }

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }
}

/**
 * NEO cua nut `Bat dau cho` — moc `DELIVERY_ARRIVAL` MOI NHAT cua chang.
 *
 * "Moi nhat" chu khong "dau tien": mot chang chi co mot lan den noi hom nay (`isRepeatable` khong
 * liet ke `DELIVERY_ARRIVAL`), nhung doc tu duoi len la thoi quen da dung o `deriveLegPhase` — va
 * no van dung ca khi mot ngay nao do luat do noi long.
 */
const arrivalCheckpointIdOf = (checkpoints: readonly RunCheckpoint[]): string | null =>
  [...checkpoints].reverse().find((row) => row.type === 'DELIVERY_ARRIVAL')?.id ?? null;

const toFieldDocument = (document: OperationalDocument): DriverFieldDocument => ({
  id: document.id,
  type: document.type,
  basis: document.basis,
  status: document.status,
  receivedAt: document.receivedAt.toISOString(),
});
