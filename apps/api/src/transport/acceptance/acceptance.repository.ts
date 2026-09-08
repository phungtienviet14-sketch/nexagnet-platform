import type { BusinessDate } from '../business-date.js';
import { stateAfter } from './acceptance-lifecycle.js';
import type {
  CommercialAcceptance,
  CommercialAcceptanceBasis,
  CommercialAcceptanceDecision,
  CommercialAcceptanceDetail,
  CommercialAcceptanceOutcome,
} from './acceptance.types.js';

/**
 * KHO cua truc nghiem thu.
 *
 * ============================================================================================
 * MOT LENH, MOT GIAO DICH — TANG DICH VU KHONG DUOC TU GHEP HAI LAN GHI
 * ============================================================================================
 *
 * `append()` lam BA viec khong tach roi duoc:
 *
 *   1. mo ho so neu chua co (`PENDING` la su vang mat, nen hang chi sinh ra o lan quyet dinh dau);
 *   2. them mot hang quyet dinh voi `sequence` ke tiep;
 *   3. cap nhat hinh chieu `state` + `latestDecisionId` cua ho so.
 *
 * Ba viec do phai nam trong MOT giao dich. Neu tang dich vu tu ghep chung bang ba loi goi, thi mot
 * loi mang o giua se de lai mot ho so noi "da duyet" ma khong co hang quyet dinh nao giai thich —
 * hoac te hon, mot quyet dinh da ghi ma hinh chieu van con noi "dang cho". Ke tu do khong ai doi
 * soat duoc ben nao dung. Do la ly do khoi chu thich dau `settlement.repository.ts` dat ra quy uoc
 * *"neu mot viec can hai lan ghi thi do la MOT ham cua kho"*, va o day no ap nguyen van.
 *
 * ============================================================================================
 * CHONG GHI TRUNG NAM O KHO, KHONG NAM O DICH VU
 * ============================================================================================
 *
 * `@@unique([acceptanceId, idempotencyKey])` la cong THAT. Tang dich vu co doc truoc mot lan cho
 * duong phat lai nhanh, nhung mot phep doc-roi-ghi khong bao gio la nguyen tu: hai yeu cau cung
 * khoa den cung luc se cung thay "chua co" va cung ghi. Kho la cho duy nhat tra loi duoc cau hoi
 * do, y het `@@unique([sourceContext, sourceId])` cua `TX-05`.
 */

export interface AppendAcceptanceDecisionCommand {
  readonly runId: string;
  readonly outcome: CommercialAcceptanceOutcome;
  readonly reasonCode: string;
  readonly basis: CommercialAcceptanceBasis;
  readonly evidenceRefs: readonly string[];
  readonly externalNote: string | null;
  readonly counterpartyId: string | null;
  readonly supersedesId: string | null;
  readonly idempotencyKey: string;
  readonly decidedBy: string;
  /** Gio MAY CHU, do tang dich vu dat tu `TRANSPORT_CLOCK`. */
  readonly decidedAt: Date;
  /** Ngay nghiep vu cua ho so, tinh mot lan luc mo. */
  readonly businessDate: BusinessDate;
}

/**
 * TRANG THAI moi cua hinh chieu — SUY RA, khong nhan tu ben goi.
 *
 * Truoc day day la mot truong cua lenh, va trinh bien dich da chi ra dung van de: mot lenh mang CA
 * `outcome` LAN `state` co hai cho de chung lech nhau, trong khi chung LUON bang nhau theo dung
 * dinh nghia cua `stateAfter`. Mot nguon su that, mot phep suy.
 */
export const projectedStateOf = (
  command: AppendAcceptanceDecisionCommand,
): CommercialAcceptanceOutcome => stateAfter(command.outcome);

/**
 * KET QUA mot lan ghi — quyet dinh, ho so, va CO PHAI mot lan phat lai khong.
 *
 * `replayed` tach hai chuyen khac nhau ve the gioi: mot lan quyet dinh that su va mot lan goi lap.
 * Gop lai thi khong ai dem duoc so lan nguoi duyet thuc su bam nut — cung ly le da ghi o
 * `SettlementRecognition.replayed`.
 */
export interface AcceptanceDecisionOutcome {
  readonly acceptance: CommercialAcceptance;
  readonly decision: CommercialAcceptanceDecision;
  readonly replayed: boolean;
}

export abstract class AcceptanceRepository {
  /** Ho so cua mot vong chay. `null` khi chua co quyet dinh nao — tuc dang `PENDING`. */
  abstract findByRun(runId: string): Promise<CommercialAcceptance | null>;
  abstract findDetailByRun(runId: string): Promise<CommercialAcceptanceDetail | null>;
  /** Ho so cua NHIEU vong chay trong mot lan — hang cho khong duoc goi N+1 lan. */
  abstract findManyByRuns(runIds: readonly string[]): Promise<CommercialAcceptance[]>;
  abstract append(command: AppendAcceptanceDecisionCommand): Promise<AcceptanceDecisionOutcome>;
}

const iso = (value: Date): string => value.toISOString();

/**
 * BAN TRONG BO NHO — dung cho demo/CI khong co CSDL, va cho bai test mien.
 *
 * Bat chuoc CA HAI rang buoc duy nhat cua ban Prisma (`runId`, va `(acceptanceId,
 * idempotencyKey)`). Mot ban trong bo nho khong bat chuoc rang buoc se XANH ca nhung bai ma DB that
 * se do — dung bai hoc ma `transport-settlement.int.spec.ts` ghi lai.
 */
export class InMemoryAcceptanceRepository extends AcceptanceRepository {
  private readonly acceptances = new Map<string, CommercialAcceptance>();
  private readonly decisions = new Map<string, CommercialAcceptanceDecision[]>();
  private sequence = 0;

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${String(this.sequence).padStart(6, '0')}`;
  }

  async findByRun(runId: string): Promise<CommercialAcceptance | null> {
    return this.acceptances.get(runId) ?? null;
  }

  async findDetailByRun(runId: string): Promise<CommercialAcceptanceDetail | null> {
    const acceptance = this.acceptances.get(runId);
    if (!acceptance) return null;
    return { acceptance, decisions: [...(this.decisions.get(acceptance.id) ?? [])] };
  }

  async findManyByRuns(runIds: readonly string[]): Promise<CommercialAcceptance[]> {
    return runIds.flatMap((runId) => {
      const found = this.acceptances.get(runId);
      return found ? [found] : [];
    });
  }

  async append(command: AppendAcceptanceDecisionCommand): Promise<AcceptanceDecisionOutcome> {
    const existing = this.acceptances.get(command.runId);
    const history = existing ? (this.decisions.get(existing.id) ?? []) : [];

    const replay = history.find((entry) => entry.idempotencyKey === command.idempotencyKey);
    if (replay && existing) {
      return { acceptance: existing, decision: replay, replayed: true };
    }

    const acceptanceId = existing?.id ?? this.nextId('acc');
    const decision: CommercialAcceptanceDecision = {
      id: this.nextId('dec'),
      acceptanceId,
      sequence: history.length + 1,
      outcome: command.outcome,
      reasonCode: command.reasonCode,
      basis: command.basis,
      evidenceRefs: [...command.evidenceRefs],
      externalNote: command.externalNote,
      supersedesId: command.supersedesId,
      idempotencyKey: command.idempotencyKey,
      decidedBy: command.decidedBy,
      decidedAt: iso(command.decidedAt),
    };

    const acceptance: CommercialAcceptance = {
      id: acceptanceId,
      runId: command.runId,
      state: projectedStateOf(command),
      // Phap nhan ben A: mot lan khai SAU van duoc ghi nhan, nhung mot lan khai `null` KHONG xoa
      // gia tri da co. Xoa mot lien ket phap nhan la mot viec khac, va no chua ai yeu cau.
      counterpartyId: command.counterpartyId ?? existing?.counterpartyId ?? null,
      businessDate: existing?.businessDate ?? command.businessDate,
      latestDecisionId: decision.id,
      openedBy: existing?.openedBy ?? command.decidedBy,
      createdAt: existing?.createdAt ?? iso(command.decidedAt),
      updatedAt: iso(command.decidedAt),
    };

    this.acceptances.set(command.runId, acceptance);
    this.decisions.set(acceptanceId, [...history, decision]);
    return { acceptance, decision, replayed: false };
  }
}
