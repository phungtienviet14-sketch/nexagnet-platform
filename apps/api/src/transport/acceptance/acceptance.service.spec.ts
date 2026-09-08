import { beforeEach, describe, expect, it } from 'vitest';
import type { BusinessDate } from '../business-date.js';
import type { VehicleRunStatus } from '../movement/movement.types.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  AcceptanceCounterpartyFacts,
  AcceptanceEvidenceFacts,
  AcceptanceMovementFacts,
  type AcceptanceRunFacts,
} from './acceptance-facts.port.js';
import { InMemoryAcceptanceRepository } from './acceptance.repository.js';
import { CommercialAcceptanceService } from './acceptance.service.js';
import type { RecordAcceptanceDecisionCommand } from './acceptance.types.js';

/**
 * BAI DOI KHANG cua truc nghiem thu — `#268` I7.
 *
 * Bo nay dung kho TRONG BO NHO va ba cong gia. Nhung dieu no chung minh la nhung dieu thuoc ve
 * TANG DICH VU: thu tu kiem, danh tinh den tu dau, gio den tu dau, va cai gi duoc dung lam can cu.
 * Nhung dieu thuoc ve CSDL (rang buoc duy nhat, trigger chi-ghi-them) nam o
 * `transport-commercial-acceptance.int.spec.ts` va chay tren Postgres that — mot kho trong bo nho
 * theo dinh nghia khong co bien gioi do.
 */

const RUN_DONE = 'run-xong';
const RUN_RUNNING = 'run-dang-chay';
const FOREIGN_DOC = 'media/transport-evidence/2026/09/cua-nguoi-khac.jpg';
const OWN_DOC = 'media/transport-evidence/2026/09/phieu-giao.jpg';

const runOf = (id: string, status: VehicleRunStatus): AcceptanceRunFacts => ({
  id,
  code: `MA-${id}`,
  status,
  vehicleId: 'xe-1',
  businessDate: '2026-09-08' as BusinessDate,
  completedAt: status === 'COMPLETED' ? '2026-09-08T02:00:00.000Z' : null,
});

class FakeMovement extends AcceptanceMovementFacts {
  private readonly runs = new Map<string, AcceptanceRunFacts>([
    [RUN_DONE, runOf(RUN_DONE, 'COMPLETED')],
    [RUN_RUNNING, runOf(RUN_RUNNING, 'ACTIVE')],
  ]);

  async findRun(runId: string): Promise<AcceptanceRunFacts | null> {
    return this.runs.get(runId) ?? null;
  }

  async listCompletedRuns(): Promise<AcceptanceRunFacts[]> {
    return [...this.runs.values()].filter((run) => run.status === 'COMPLETED');
  }
}

/** Chi MOT chung tu thuoc ve `RUN_DONE`. Moi khoa khac la cua nguoi khac hoac khong ton tai. */
class FakeEvidence extends AcceptanceEvidenceFacts {
  async belongingTo(runId: string, refs: readonly string[]): Promise<readonly string[]> {
    return runId === RUN_DONE ? refs.filter((ref) => ref === OWN_DOC) : [];
  }

  async countFor(runId: string): Promise<number> {
    return runId === RUN_DONE ? 1 : 0;
  }
}

class FakeCounterparties extends AcceptanceCounterpartyFacts {
  async exists(counterpartyId: string): Promise<boolean> {
    return counterpartyId === 'phap-nhan-A';
  }
}

/** Dong ho GHIM. Moi gia tri `decidedAt` trong bo nay phai bang dung con so nay. */
const SERVER_NOW = new Date('2026-09-08T03:15:00.000Z');

const command = (
  patch: Partial<RecordAcceptanceDecisionCommand> = {},
): RecordAcceptanceDecisionCommand => ({
  runId: RUN_DONE,
  outcome: 'APPROVED',
  reasonCode: 'DOCUMENT_RECEIVED',
  basis: 'DOCUMENT',
  evidenceRefs: [OWN_DOC],
  externalNote: null,
  counterpartyId: null,
  supersedesId: null,
  idempotencyKey: 'idem-lan-1',
  authUserId: 'ke-toan-1',
  ...patch,
});

describe('CommercialAcceptanceService — bai doi khang #268 I7', () => {
  let service: CommercialAcceptanceService;

  beforeEach(() => {
    service = new CommercialAcceptanceService(
      new InMemoryAcceptanceRepository(),
      new FakeMovement(),
      new FakeEvidence(),
      new FakeCounterparties(),
      { timeZone: 'Asia/Ho_Chi_Minh' },
      undefined,
      () => SERVER_NOW,
    );
  });

  describe('I7-06 — duyet truoc khi chay xong khong lam gi du dieu kien', () => {
    it('tu choi duyet mot vong chay dang chay', async () => {
      await expect(service.decide(command({ runId: RUN_RUNNING }))).rejects.toMatchObject({
        reason: 'ACCEPTANCE_RUN_NOT_COMPLETED',
      });
    });

    it('vong chay khong ton tai -> NOT_FOUND, khong phai mot ho so rong', async () => {
      await expect(service.decide(command({ runId: 'khong-co' }))).rejects.toMatchObject({
        reason: 'ACCEPTANCE_RUN_NOT_FOUND',
      });
    });
  });

  describe('I7-04 va I7-05 — chung cu cua nguoi khac, va khong do duoc danh sach', () => {
    it('khoa chung tu khong thuoc vong chay nay thi khong duyet duoc', async () => {
      await expect(service.decide(command({ evidenceRefs: [FOREIGN_DOC] }))).rejects.toMatchObject({
        reason: 'ACCEPTANCE_EVIDENCE_NOT_FOR_RUN',
      });
    });

    it('tron mot khoa hop le voi mot khoa la thi CA LENH bi tu choi', async () => {
      // Loc bo khoa la roi ghi phan con lai se bien mot lan gian lan thanh mot lan duyet hop le.
      await expect(
        service.decide(command({ evidenceRefs: [OWN_DOC, FOREIGN_DOC] })),
      ).rejects.toMatchObject({ reason: 'ACCEPTANCE_EVIDENCE_NOT_FOR_RUN' });
    });

    it('thong bao KHONG ke ten khoa nao bi loai — khong do duoc chung tu cua nguoi khac', async () => {
      const failure = await service
        .decide(command({ evidenceRefs: [FOREIGN_DOC] }))
        .catch((error: unknown) => error as TransportDomainError);

      expect(failure).toBeInstanceOf(TransportDomainError);
      expect(failure.message).not.toContain(FOREIGN_DOC);
    });

    it('khoa KHONG TON TAI va khoa CUA NGUOI KHAC cho ra cung mot cau tra loi', async () => {
      const foreign = await service
        .decide(command({ evidenceRefs: [FOREIGN_DOC] }))
        .catch((error: unknown) => error as TransportDomainError);
      const unknown = await service
        .decide(command({ evidenceRefs: ['khoa-hoan-toan-bia-ra'] }))
        .catch((error: unknown) => error as TransportDomainError);

      expect(unknown.reason).toBe(foreign.reason);
      expect(unknown.message).toBe(foreign.message);
    });

    it('duyet theo chung tu ma khong tro toi chung tu nao thi bi tu choi', async () => {
      await expect(service.decide(command({ evidenceRefs: [] }))).rejects.toMatchObject({
        reason: 'ACCEPTANCE_EVIDENCE_REQUIRED',
      });
    });
  });

  describe('I7-14 — dong ho cua may khach khong chon duoc gio duyet', () => {
    it('`decidedAt` den tu dong ho MAY CHU', async () => {
      const detail = await service.decide(command());
      expect(detail.decisions).toHaveLength(1);
      expect(detail.decisions[0]?.decidedAt).toBe(SERVER_NOW.toISOString());
    });

    it('`decidedBy` den tu PHIEN, khong tu than yeu cau', async () => {
      const detail = await service.decide(command({ authUserId: 'giam-doc-9' }));
      expect(detail.decisions[0]?.decidedBy).toBe('giam-doc-9');
    });
  });

  describe('I7-09 — gui lai mot lenh khong sinh ra hai quyet dinh', () => {
    it('cung `idempotencyKey` tra ve dung mot quyet dinh', async () => {
      await service.decide(command());
      const again = await service.decide(command());

      expect(again.decisions).toHaveLength(1);
      expect(again.acceptance.state).toBe('APPROVED');
    });

    it('KHAC `idempotencyKey` ma khong khai ban dang sua thi bi tu choi', async () => {
      await service.decide(command());
      await expect(service.decide(command({ idempotencyKey: 'idem-lan-2' }))).rejects.toMatchObject(
        { reason: 'ACCEPTANCE_ALREADY_IN_OUTCOME' },
      );
    });
  });

  describe('I7-10 va I7-11 — tu choi roi sua lai giu CA HAI quyet dinh', () => {
    it('lich su giu du ban goc sau khi doi y', async () => {
      const first = await service.decide(
        command({ outcome: 'NEEDS_CORRECTION', reasonCode: 'MISSING_RECEIPT', evidenceRefs: [] }),
      );
      const firstId = first.acceptance.latestDecisionId;
      expect(firstId).not.toBeNull();

      const second = await service.decide(
        command({ idempotencyKey: 'idem-lan-2', supersedesId: firstId }),
      );

      expect(second.decisions).toHaveLength(2);
      expect(second.decisions[0]?.outcome).toBe('NEEDS_CORRECTION');
      expect(second.decisions[0]?.reasonCode).toBe('MISSING_RECEIPT');
      expect(second.decisions[1]?.outcome).toBe('APPROVED');
      expect(second.decisions[1]?.supersedesId).toBe(firstId);
      expect(second.acceptance.state).toBe('APPROVED');
    });

    it('khong sua duoc khi dua vao mot ban KHONG con moi nhat', async () => {
      const first = await service.decide(
        command({ outcome: 'REJECTED', reasonCode: 'NO_EVIDENCE', evidenceRefs: [] }),
      );
      const staleId = first.acceptance.latestDecisionId;

      await service.decide(
        command({
          outcome: 'NEEDS_CORRECTION',
          reasonCode: 'RESUBMIT',
          evidenceRefs: [],
          idempotencyKey: 'idem-lan-2',
          supersedesId: staleId,
        }),
      );

      // Nguoi thu ba van dang cam ban dau tien — man hinh cua ho da loi thoi.
      await expect(
        service.decide(command({ idempotencyKey: 'idem-lan-3', supersedesId: staleId })),
      ).rejects.toMatchObject({ reason: 'ACCEPTANCE_SUPERSEDES_STALE' });
    });
  });

  describe('can cu ngoai — #268 I2', () => {
    it('duyet khong co ban so PHAI ghi ro B da nhan cai gi', async () => {
      await expect(
        service.decide(
          command({
            basis: 'EXTERNAL_PHYSICAL_CONFIRMATION',
            evidenceRefs: [],
            externalNote: null,
          }),
        ),
      ).rejects.toMatchObject({ reason: 'ACCEPTANCE_EXTERNAL_BASIS_NOTE_REQUIRED' });
    });

    it('ghi chu chi co khoang trang KHONG duoc tinh la mot can cu', async () => {
      await expect(
        service.decide(
          command({
            basis: 'EXTERNAL_PHYSICAL_CONFIRMATION',
            evidenceRefs: [],
            externalNote: '   ',
          }),
        ),
      ).rejects.toMatchObject({ reason: 'ACCEPTANCE_EXTERNAL_BASIS_NOTE_REQUIRED' });
    });

    it('duyet theo ban giay di duoc khi co ghi chu that', async () => {
      const detail = await service.decide(
        command({
          basis: 'EXTERNAL_PHYSICAL_CONFIRMATION',
          evidenceRefs: [],
          externalNote: 'B giu ban goc phieu giao ky ngay 08/09',
        }),
      );
      expect(detail.acceptance.state).toBe('APPROVED');
      expect(detail.decisions[0]?.basis).toBe('EXTERNAL_PHYSICAL_CONFIRMATION');
      expect(detail.decisions[0]?.evidenceRefs).toEqual([]);
    });
  });

  describe('phap nhan ben A', () => {
    it('khai mot phap nhan khong co that thi bi tu choi', async () => {
      await expect(
        service.decide(command({ counterpartyId: 'phap-nhan-ma' })),
      ).rejects.toMatchObject({ reason: 'ACCEPTANCE_COUNTERPARTY_NOT_FOUND' });
    });

    it('khai mot phap nhan co that thi duoc ghi lai', async () => {
      const detail = await service.decide(command({ counterpartyId: 'phap-nhan-A' }));
      expect(detail.acceptance.counterpartyId).toBe('phap-nhan-A');
    });
  });

  describe('#268 I6 — hang cho va phep suy du dieu kien doi soat', () => {
    it('vong chay da chay xong nhung chua ai nghiem thu thi dang PENDING va KHONG du dieu kien', async () => {
      const rows = await service.queue();
      const row = rows.find((entry) => entry.runId === RUN_DONE);

      expect(row?.state).toBe('PENDING');
      expect(row?.settlementEligible).toBe(false);
      expect(row?.acceptanceId).toBeNull();
    });

    it('hang cho KHONG chua vong chay dang chay', async () => {
      const rows = await service.queue();
      expect(rows.map((row) => row.runId)).not.toContain(RUN_RUNNING);
    });

    it('sau khi duyet thi du dieu kien doi soat', async () => {
      await service.decide(command());
      const row = (await service.queue()).find((entry) => entry.runId === RUN_DONE);

      expect(row?.state).toBe('APPROVED');
      expect(row?.settlementEligible).toBe(true);
    });

    it.each(['REJECTED', 'NEEDS_CORRECTION'] as const)(
      'sau khi %s thi KHONG du dieu kien doi soat',
      async (outcome) => {
        await service.decide(command({ outcome, reasonCode: 'NO_EVIDENCE', evidenceRefs: [] }));
        const row = (await service.queue()).find((entry) => entry.runId === RUN_DONE);

        expect(row?.state).toBe(outcome);
        expect(row?.settlementEligible).toBe(false);
      },
    );

    it('loc theo trang thai tra dung nhung ho so dang cho', async () => {
      expect(await service.queue({ state: 'APPROVED' })).toEqual([]);
      expect((await service.queue({ state: 'PENDING' })).map((row) => row.runId)).toEqual([
        RUN_DONE,
      ]);
    });
  });

  describe('doc mot ho so chua ai nghiem thu', () => {
    it('tra ve PENDING chu khong nem NOT_FOUND — vang mat la mot cau tra loi nghiep vu', async () => {
      const detail = await service.detailForRun(RUN_DONE);
      expect(detail.acceptance.state).toBe('PENDING');
      expect(detail.decisions).toEqual([]);
    });

    it('vong chay khong co that van la NOT_FOUND', async () => {
      await expect(service.detailForRun('khong-co')).rejects.toMatchObject({
        reason: 'ACCEPTANCE_RUN_NOT_FOUND',
      });
    });
  });
});
