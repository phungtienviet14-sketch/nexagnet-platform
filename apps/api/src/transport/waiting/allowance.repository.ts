import { randomUUID } from 'node:crypto';
import type { UniqueIndexRef } from '../storage-conflict.js';
import type {
  DriverWaitingAllowance,
  WaitingAllowanceOutcome,
  WaitingAllowanceStatus,
} from './allowance.types.js';

/**
 * HAI UNIQUE cua phu cap cho. DANH SACH thuoc capability nay, CO CHE nhan dien nam o
 * `../storage-conflict.js`.
 */

/**
 * MOT PHIEN CHO co NHIEU NHAT MOT khoan DA DUYET — unique MOT PHAN `WHERE status = 'APPROVED'`.
 *
 * Day la cong THAT cho `#279` O13 bai 11 (*"duplicate allowance approval does not pay twice"*), va
 * no manh hon khoa chong ghi trung: khoa kia chan hai lan bam CUNG mot lenh, cai nay chan hai
 * khoan DUOC DUYET tren cung mot khoang thoi gian — ke ca khi chung den tu hai de nghi khac nhau,
 * hai nguoi khac nhau, hai ngay khac nhau.
 *
 * Phai la unique MOT PHAN: mot phien cho CO THE co nhieu de nghi bi TU CHOI, va `#279` O6 doi
 * *"rejected/corrected history preserved"*.
 */
export const WAITING_ALLOWANCE_APPROVED_PER_SESSION: UniqueIndexRef = {
  indexName: 'TransportDriverWaitingAllowance_approvedSession_key',
  model: 'TransportDriverWaitingAllowance',
  column: 'waitingSessionId',
};

/** Mot lenh QUYET DINH gui lai khong duoc quyet lan hai — `#279` O6 *"same approval retry one effect"*. */
export const WAITING_ALLOWANCE_DECISION_KEY: UniqueIndexRef = {
  indexName: 'TransportDriverWaitingAllowance_decisionKey_key',
  model: 'TransportDriverWaitingAllowance',
  column: 'decisionIdempotencyKey',
};

export interface CreateWaitingAllowanceInput {
  readonly waitingSessionId: string;
  readonly driverId: string;
  readonly currencyCode: string;
  readonly candidateAmount: number;
  readonly reason: string;
  readonly proposedBy: string;
  readonly proposedAt: Date;
  readonly businessDate: string;
}

export interface DecideWaitingAllowanceInput {
  readonly allowanceId: string;
  readonly outcome: WaitingAllowanceOutcome;
  readonly approvedAmount: number | null;
  readonly decidedBy: string;
  readonly decidedAt: Date;
  readonly decisionNote: string | null;
  readonly decisionIdempotencyKey: string;
}

/** Tong khoan DA DUYET cua mot lai xe trong mot khoang ngay nghiep vu. */
export interface ApprovedWaitingAllowanceTotal {
  readonly driverId: string;
  /** So NGUYEN DONG, tong cua nhung khoan da duyet. */
  readonly totalAmount: number;
  /** Bao nhieu khoan — de phieu luong noi duoc "3 lan cho", khong chi mot con so gop. */
  readonly count: number;
}

/**
 * KHO PHU CAP CHO — mot bang co DUNG MOT lan chuyen trang thai.
 *
 * Cung hinh dang voi `WaitingSessionRepository`, va cung ly le: mot de nghi mo truoc, duoc quyet
 * sau. Vong doi do co DUNG hai canh (`PENDING -> APPROVED`, `PENDING -> REJECTED`), va khong co
 * `update` tong quat nao — khong ai sua duoc `candidateAmount`, `proposedBy` hay `waitingSessionId`
 * cua mot de nghi da ghi.
 *
 * Doi y ve sau la mot de nghi MOI tren cung phien cho, khong phai mot lan ghi de: `#279` O6 doi
 * *"append/audit/correction semantics"* va *"rejected/corrected history preserved"*.
 */
export abstract class WaitingAllowanceRepository {
  abstract create(input: CreateWaitingAllowanceInput): Promise<DriverWaitingAllowance>;
  abstract decide(input: DecideWaitingAllowanceInput): Promise<DriverWaitingAllowance>;
  abstract find(allowanceId: string): Promise<DriverWaitingAllowance | null>;
  abstract findByDecisionKey(key: string): Promise<DriverWaitingAllowance | null>;
  abstract listForSession(waitingSessionId: string): Promise<readonly DriverWaitingAllowance[]>;
  abstract listByStatus(status: WaitingAllowanceStatus): Promise<readonly DriverWaitingAllowance[]>;
  /**
   * Tong khoan DA DUYET theo lai xe, trong mot khoang NGAY NGHIEP VU.
   *
   * Duong ma `transport-workforce` doc qua `WorkforceWaitingAllowanceFacts`. Tra ve TONG chu khong
   * tung hang: phieu luong khong can biet tung phien cho, va tra ve tung hang se de mot mien tien
   * luong cam vao khoa cua mot phien cho — thu no khong co viec gi phai biet.
   */
  abstract approvedTotalsBetween(
    startDate: string,
    endDate: string,
  ): Promise<readonly ApprovedWaitingAllowanceTotal[]>;
}

/**
 * Da quyet roi — mot lop loi RIENG, khong mot `Error` chung.
 *
 * `WaitingAllowanceService` phai phan biet duoc no voi mot su co that de tra ve
 * `WAITING_ALLOWANCE_ALREADY_DECIDED` — mot ma nguoi dung doc duoc — thay vi 500.
 */
export class WaitingAllowanceAlreadyDecidedError extends Error {
  constructor(readonly allowanceId: string) {
    super(`De nghi phu cap ${allowanceId} da duoc quyet tu truoc`);
    this.name = 'WaitingAllowanceAlreadyDecidedError';
  }
}

/** Va cham unique gia lap, de duong trong-bo-nho hong GIONG duong Postgres. */
class InMemoryUniqueViolation extends Error {
  readonly code = 'P2002';
  readonly meta: { modelName: string; target: string[] };

  constructor(index: UniqueIndexRef) {
    super(`Unique constraint failed on the fields: (\`${index.column}\`)`);
    this.name = 'InMemoryUniqueViolation';
    this.meta = { modelName: index.model, target: [index.column] };
  }
}

/**
 * Ban trong-bo-nho — duong mac dinh cua demo/CI (`PERSISTENCE=memory`).
 *
 * No CUONG CHE ca hai unique, ke ca cai MOT PHAN. Bo qua chung se lam bo test trong-bo-nho xanh
 * trong khi Postgres do, va bai `#279` O13 bai 11 mat cho de dung o duong mac dinh.
 */
export class InMemoryWaitingAllowanceRepository extends WaitingAllowanceRepository {
  private readonly rows: DriverWaitingAllowance[] = [];

  async create(input: CreateWaitingAllowanceInput): Promise<DriverWaitingAllowance> {
    const row: DriverWaitingAllowance = {
      id: randomUUID(),
      waitingSessionId: input.waitingSessionId,
      driverId: input.driverId,
      status: 'PENDING',
      currencyCode: input.currencyCode,
      candidateAmount: input.candidateAmount,
      approvedAmount: null,
      reason: input.reason,
      proposedBy: input.proposedBy,
      proposedAt: input.proposedAt,
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      decisionIdempotencyKey: null,
      businessDate: input.businessDate,
      createdAt: input.proposedAt,
    };
    this.rows.push(row);
    return row;
  }

  async decide(input: DecideWaitingAllowanceInput): Promise<DriverWaitingAllowance> {
    const duplicateKey = this.rows.find(
      (row) => row.decisionIdempotencyKey === input.decisionIdempotencyKey,
    );
    if (duplicateKey) throw new InMemoryUniqueViolation(WAITING_ALLOWANCE_DECISION_KEY);

    const index = this.rows.findIndex((row) => row.id === input.allowanceId);
    const current = this.rows[index];
    if (current === undefined || current.status !== 'PENDING') {
      throw new WaitingAllowanceAlreadyDecidedError(input.allowanceId);
    }

    if (input.outcome === 'APPROVED') {
      const approvedAlready = this.rows.find(
        (row) => row.waitingSessionId === current.waitingSessionId && row.status === 'APPROVED',
      );
      if (approvedAlready)
        throw new InMemoryUniqueViolation(WAITING_ALLOWANCE_APPROVED_PER_SESSION);
    }

    const decided: DriverWaitingAllowance = {
      ...current,
      status: input.outcome,
      approvedAmount: input.outcome === 'APPROVED' ? input.approvedAmount : null,
      decidedBy: input.decidedBy,
      decidedAt: input.decidedAt,
      decisionNote: input.decisionNote,
      decisionIdempotencyKey: input.decisionIdempotencyKey,
    };
    this.rows[index] = decided;
    return decided;
  }

  async find(allowanceId: string): Promise<DriverWaitingAllowance | null> {
    return this.rows.find((row) => row.id === allowanceId) ?? null;
  }

  async findByDecisionKey(key: string): Promise<DriverWaitingAllowance | null> {
    return this.rows.find((row) => row.decisionIdempotencyKey === key) ?? null;
  }

  async listForSession(waitingSessionId: string): Promise<readonly DriverWaitingAllowance[]> {
    return this.rows.filter((row) => row.waitingSessionId === waitingSessionId);
  }

  async listByStatus(status: WaitingAllowanceStatus): Promise<readonly DriverWaitingAllowance[]> {
    return this.rows.filter((row) => row.status === status);
  }

  async approvedTotalsBetween(
    startDate: string,
    endDate: string,
  ): Promise<readonly ApprovedWaitingAllowanceTotal[]> {
    const totals = new Map<string, { total: number; count: number }>();
    for (const row of this.rows) {
      if (row.status !== 'APPROVED' || row.approvedAmount === null) continue;
      if (row.businessDate < startDate || row.businessDate > endDate) continue;
      const current = totals.get(row.driverId) ?? { total: 0, count: 0 };
      totals.set(row.driverId, {
        total: current.total + row.approvedAmount,
        count: current.count + 1,
      });
    }
    return [...totals.entries()].map(([driverId, value]) => ({
      driverId,
      totalAmount: value.total,
      count: value.count,
    }));
  }
}
