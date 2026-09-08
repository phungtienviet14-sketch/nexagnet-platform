import { Inject, Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { toBusinessDate } from '../business-date.js';
import {
  TRANSPORT_CLOCK,
  TRANSPORT_CORE_POLICY,
  type TransportCorePolicy,
} from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import { TRANSPORT_COMMERCIAL_ACCEPTANCE_DECISIONS } from './acceptance-decisions.js';
import type { CommercialAcceptanceDecideReason } from './acceptance-decisions.js';
import {
  AcceptanceCounterpartyFacts,
  AcceptanceEvidenceFacts,
  AcceptanceMovementFacts,
  type AcceptanceRunFacts,
} from './acceptance-facts.port.js';
import {
  evaluateAcceptanceDecision,
  isRunAcceptable,
  isSettlementEligible,
} from './acceptance-lifecycle.js';
import { AcceptanceRepository } from './acceptance.repository.js';
import type {
  CommercialAcceptanceDetail,
  CommercialAcceptanceQueueRow,
  CommercialAcceptanceState,
  RecordAcceptanceDecisionCommand,
} from './acceptance.types.js';

/**
 * TANG UNG DUNG cua `transport-acceptance` — `#268` Lane I.
 *
 * ============================================================================================
 * DICH VU NAY KHONG CAM MOT CAI BUT NAO NGOAI BUT CUA CHINH NO
 * ============================================================================================
 *
 * No tiem DUNG MOT kho ghi (`AcceptanceRepository`) va ba cong CHI DOC. Do khong phai mot lua chon
 * ve kien truc cho dep — do la cach `#268` I3 duoc giu bang CAU TRUC:
 *
 *     *"Accounting may DECIDE acceptance but may NOT mutate source checkpoints / location proofs /
 *     uploaded delivery evidence"*
 *
 * Neu bat bien do chi song trong bang phan quyen, thi mot lan sua sau nay them mot loi goi ghi vao
 * day se pha no ma khong bai test nao do duoc. Vi dich vu KHONG CO tham chieu nao toi
 * `CheckpointRepository` hay `OperationalProofRepository`, cai ma no khong lam duoc thi no khong
 * lam duoc — ke ca khi ai do muon.
 *
 * (Tang phan quyen van giu phan cua no: `transport.checkpoint.record` va `transport.proof.withdraw`
 * deu nam trong `ACCOUNTING_DENIED` tu truoc lane nay. Hai lop, doc lap nhau.)
 *
 * ============================================================================================
 * DANH TINH TU PHIEN, GIO TU MAY CHU
 * ============================================================================================
 *
 * `decidedBy` den tu `command.authUserId`, ma controller lay bang `requireAuthUserId(request)` —
 * KHONG tu than yeu cau (`#268` I3: *"no caller-supplied `decidedBy`"*). `decidedAt` do dich vu nay
 * dat tu `TRANSPORT_CLOCK` (bai I7 so 14: *"Client clock cannot choose `approvedAt`"*).
 *
 * Ca hai deu duoc giu bang KIEU chu khong bang mot phep kiem: `RecordAcceptanceDecisionCommand`
 * khong co truong nao de ben goi dat hai gia tri do.
 */
@Injectable()
export class CommercialAcceptanceService {
  constructor(
    private readonly repository: AcceptanceRepository,
    private readonly movement: AcceptanceMovementFacts,
    private readonly evidence: AcceptanceEvidenceFacts,
    private readonly counterparties: AcceptanceCounterpartyFacts,
    @Inject(TRANSPORT_CORE_POLICY) private readonly corePolicy: TransportCorePolicy,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }

  private deny(reason: CommercialAcceptanceDecideReason, detail: Record<string, unknown>): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_COMMERCIAL_ACCEPTANCE_DECISIONS,
      point: 'commercial_acceptance.decide',
      outcome: 'denied',
      reason,
      detail,
    });
  }

  private async requireRun(runId: string): Promise<AcceptanceRunFacts> {
    const run = await this.movement.findRun(runId);
    if (!run) {
      this.deny('ACCEPTANCE_RUN_NOT_FOUND', { runId });
      throw TransportDomainError.notFound(
        'ACCEPTANCE_RUN_NOT_FOUND',
        `Khong thay vong chay ${runId}`,
      );
    }
    return run;
  }

  /**
   * GHI mot quyet dinh nghiem thu.
   *
   * THU TU la mot phan cua hop dong: vong chay -> phap nhan -> chung cu -> luat mien -> ghi.
   *
   * Chung cu duoc LOC TRUOC khi vao luat mien, va do la ca diem cua bai I7 so 4. Neu luat mien nhan
   * so luong khoa MA BEN GOI GUI, thi mot nguoi go dai ba chuoi bat ky se qua duoc dieu kien "co it
   * nhat mot chung tu". Cai di vao luat la so khoa DA XAC MINH thuoc ve dung vong chay nay.
   */
  async decide(command: RecordAcceptanceDecisionCommand): Promise<CommercialAcceptanceDetail> {
    const run = await this.requireRun(command.runId);

    /*
     * TRANG THAI VONG CHAY di TRUOC moi phep kiem khac — `acceptance-lifecycle.ts` dat ra thu tu do
     * va o day no phai duoc giu, khong chi o ham thuan. Neu de phep kiem chung cu chay truoc, mot
     * lenh tren mot chuyen DANG CHAY se bao "chung tu khong thuoc vong chay nay" thay vi "chuyen
     * chua chay xong" — mot cau tra loi dung ve ky thuat va sai ve nguyen nhan.
     */
    if (!isRunAcceptable(run.status)) {
      this.deny('ACCEPTANCE_RUN_NOT_COMPLETED', { runId: run.id, status: run.status });
      throw TransportDomainError.denied(
        'ACCEPTANCE_RUN_NOT_COMPLETED',
        `Vong chay ${run.code} dang ${run.status}; chua co gi de nghiem thu`,
      );
    }

    /*
     * PHAT LAI di TRUOC cong nghiep vu, va do la mot sua loi that chu khong phai mot toi uu.
     *
     * `#268` I4 doi *"Retry with same idempotency key returns the same business effect"*. Neu cong
     * nghiep vu chay truoc, thi lan gui lai cua MOT lenh da ghi thanh cong se va vao
     * `ACCEPTANCE_ALREADY_IN_OUTCOME` — tuc mot lan bam lai sau khi mat mang bi bao la loi, dung
     * luc nguoi dung khong biet lan dau co vao hay khong. Mot lan phat lai KHONG phai mot quyet
     * dinh moi, nen no khong di qua cong danh cho quyet dinh moi.
     */
    const history = await this.repository.findDetailByRun(run.id);
    const replay = history?.decisions.find(
      (entry) => entry.idempotencyKey === command.idempotencyKey,
    );
    if (history && replay) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_COMMERCIAL_ACCEPTANCE_DECISIONS,
        point: 'commercial_acceptance.decide',
        outcome: 'allowed',
        reason: 'ACCEPTANCE_REPLAYED',
        detail: { runId: run.id, acceptanceId: history.acceptance.id, decisionId: replay.id },
      });
      return history;
    }

    if (
      command.counterpartyId !== null &&
      !(await this.counterparties.exists(command.counterpartyId))
    ) {
      throw TransportDomainError.invalid(
        'ACCEPTANCE_COUNTERPARTY_NOT_FOUND',
        `Khong thay phap nhan ${command.counterpartyId}`,
      );
    }

    const owned =
      command.evidenceRefs.length === 0
        ? []
        : await this.evidence.belongingTo(run.id, command.evidenceRefs);

    if (owned.length !== command.evidenceRefs.length) {
      /*
       * KHONG ke ten khoa nao bi loai. Bai I7 so 5 (*"Unknown vs foreign IDs do not provide useful
       * enumeration"*): mot thong bao noi "khoa X khong thuoc vong chay nay" xac nhan rang khoa X
       * TON TAI o dau do — tuc bien cong nay thanh mot may do danh sach chung tu cua nguoi khac.
       */
      this.deny('ACCEPTANCE_EVIDENCE_NOT_FOR_RUN', {
        runId: run.id,
        requested: command.evidenceRefs.length,
        accepted: owned.length,
      });
      throw TransportDomainError.denied(
        'ACCEPTANCE_EVIDENCE_NOT_FOR_RUN',
        'Chung tu duoc tro toi khong thuoc vong chay nay',
      );
    }

    const current = history?.acceptance ?? null;
    const externalNote = command.externalNote?.trim() ?? null;

    const verdict = evaluateAcceptanceDecision({
      outcome: command.outcome,
      basis: command.basis,
      runStatus: run.status,
      currentState: current?.state ?? 'PENDING',
      latestDecisionId: current?.latestDecisionId ?? null,
      supersedesId: command.supersedesId,
      evidenceCount: owned.length,
      externalNote,
    });

    if (!verdict.allowed) {
      this.deny(verdict.reason, { runId: run.id, outcome: command.outcome });
      throw verdict.reason === 'ACCEPTANCE_SUPERSEDES_STALE'
        ? TransportDomainError.conflict(
            verdict.reason,
            'Co nguoi vua ghi mot quyet dinh moi hon — hay tai lai roi quyet lai',
          )
        : TransportDomainError.denied(
            verdict.reason,
            `Khong ghi duoc quyet dinh nghiem thu cho vong chay ${run.code}`,
          );
    }

    const at = this.now();
    const outcome = await this.repository.append({
      runId: run.id,
      outcome: command.outcome,
      reasonCode: command.reasonCode,
      basis: command.basis,
      evidenceRefs: owned,
      externalNote,
      counterpartyId: command.counterpartyId,
      supersedesId: command.supersedesId,
      idempotencyKey: command.idempotencyKey,
      decidedBy: command.authUserId,
      decidedAt: at,
      businessDate: toBusinessDate(at, this.corePolicy.timeZone),
    });

    this.telemetry?.decision({
      vocabulary: TRANSPORT_COMMERCIAL_ACCEPTANCE_DECISIONS,
      point: 'commercial_acceptance.decide',
      outcome: 'allowed',
      reason: outcome.replayed ? 'ACCEPTANCE_REPLAYED' : 'ACCEPTANCE_DECIDED',
      detail: {
        runId: run.id,
        acceptanceId: outcome.acceptance.id,
        state: outcome.acceptance.state,
        basis: outcome.decision.basis,
        evidenceCount: outcome.decision.evidenceRefs.length,
      },
    });

    const detail = await this.repository.findDetailByRun(run.id);
    if (!detail) {
      // Khong the xay ra: `append` vua ghi xong. Nem thay vi tra `null` de mot loi that khong bi
      // doc thanh "chua co ho so nao" o tang tren.
      throw TransportDomainError.notFound(
        'ACCEPTANCE_NOT_FOUND',
        `Khong doc lai duoc ho so nghiem thu cua vong chay ${run.code}`,
      );
    }
    return detail;
  }

  /**
   * HO SO cua MOT vong chay — kem CA lich su quyet dinh.
   *
   * `PENDING` duoc TRA VE chu khong phai `404` khi chua co quyet dinh nao: vang mat la mot cau tra
   * loi nghiep vu ("chua ai nghiem thu"), khong phai mot loi. Tra `404` o day se buoc giao dien
   * phai doc mot ma loi de biet mot dieu binh thuong.
   */
  async detailForRun(runId: string): Promise<CommercialAcceptanceDetail> {
    const run = await this.requireRun(runId);
    const found = await this.repository.findDetailByRun(run.id);
    if (found) return found;

    const at = this.now();
    return {
      acceptance: {
        id: '',
        runId: run.id,
        state: 'PENDING',
        counterpartyId: null,
        businessDate: run.businessDate,
        latestDecisionId: null,
        openedBy: '',
        createdAt: at.toISOString(),
        updatedAt: at.toISOString(),
      },
      decisions: [],
    };
  }

  /**
   * HANG CHO nguoi duyet — `#268` I6.
   *
   * Doc MOT lan cho ca danh sach (`findManyByRuns`) chu khong hoi tung vong chay: mot hang cho goi
   * N+1 lan se cham dan theo dung toc do doi xe lon len, va do la thu khong ai phat hien duoc luc
   * demo.
   *
   * SAP XEP: cho lau nhat len truoc (`businessDate` tang dan). Nguoi truc mo hang cho de tim viec
   * TON DONG, khong phai de xem viec vua xong.
   */
  async queue(
    filter: { readonly state?: CommercialAcceptanceState } = {},
  ): Promise<readonly CommercialAcceptanceQueueRow[]> {
    const runs = await this.movement.listCompletedRuns();
    const found = await this.repository.findManyByRuns(runs.map((run) => run.id));
    const byRun = new Map(found.map((entry) => [entry.runId, entry]));

    const rows = await Promise.all(
      runs.map(async (run): Promise<CommercialAcceptanceQueueRow> => {
        const acceptance = byRun.get(run.id) ?? null;
        const state: CommercialAcceptanceState = acceptance?.state ?? 'PENDING';
        return {
          acceptanceId: acceptance?.id ?? null,
          runId: run.id,
          runCode: run.code,
          runStatus: run.status,
          runCompletedAt: run.completedAt,
          vehicleId: run.vehicleId,
          state,
          counterpartyId: acceptance?.counterpartyId ?? null,
          businessDate: acceptance?.businessDate ?? run.businessDate,
          evidenceCount: await this.evidence.countFor(run.id),
          settlementEligible: isSettlementEligible({ runStatus: run.status, state }),
          latestDecidedAt: acceptance?.updatedAt ?? null,
          latestDecidedBy: acceptance?.openedBy ?? null,
        };
      }),
    );

    const filtered = filter.state ? rows.filter((row) => row.state === filter.state) : rows;
    return [...filtered].sort((left, right) => left.businessDate.localeCompare(right.businessDate));
  }
}
