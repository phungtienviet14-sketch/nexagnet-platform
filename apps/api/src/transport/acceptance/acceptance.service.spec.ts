import { beforeEach, describe, expect, it } from 'vitest';
import type { BusinessDate } from '../business-date.js';
import type { OrderStatus } from '../movement/movement.types.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  AcceptanceCounterpartyFacts,
  AcceptanceEvidenceFacts,
  AcceptanceMovementFacts,
  type AcceptanceOrderContext,
  type AcceptanceOrderFacts,
} from './acceptance-facts.port.js';
import { InMemoryAcceptanceRepository } from './acceptance.repository.js';
import { CommercialAcceptanceService } from './acceptance.service.js';
import type { RecordAcceptanceDecisionCommand } from './acceptance.types.js';

/**
 * BAI DOI KHANG cua truc KET THUC DON — `#275` K7 va K8.
 *
 * Bo nay dung kho TRONG BO NHO va ba cong gia. Nhung dieu no chung minh la nhung dieu thuoc ve
 * TANG DICH VU: thu tu kiem, danh tinh den tu dau, gio den tu dau, cai gi duoc dung lam can cu, va
 * hai don tren CUNG mot vong chay quyet dinh doc lap duoc. Nhung dieu thuoc ve CSDL (rang buoc duy
 * nhat, trigger chi-ghi-them) nam o `transport-commercial-acceptance.int.spec.ts` va chay tren
 * Postgres that — mot kho trong bo nho theo dinh nghia khong co bien gioi do.
 */

const ORDER_DONE = 'don-da-giao';
/** Don THU HAI tren CUNG mot vong chay voi `ORDER_DONE` — `#275` K7 bai 3. */
const ORDER_SIBLING = 'don-cung-vong-chay';
const ORDER_OPEN = 'don-dang-cho';
const ORDER_CANCELLED = 'don-da-huy';
const TRIP_WITH_ORDER = 'chuyen-co-don';
const FOREIGN_DOC = 'media/transport-evidence/2026/09/cua-don-khac.jpg';
const OWN_DOC = 'media/transport-evidence/2026/09/phieu-giao.jpg';
const SHARED_RUN_CODE = 'RUN-CHUNG';

const orderOf = (id: string, status: OrderStatus): AcceptanceOrderFacts => ({
  id,
  code: `MA-${id}`,
  status,
  customerId: 'khach-1',
  originLabel: 'Ha Noi',
  destinationLabel: 'Hai Phong',
  businessDate: '2026-09-08' as BusinessDate,
});

class FakeMovement extends AcceptanceMovementFacts {
  private readonly orders = new Map<string, AcceptanceOrderFacts>([
    [ORDER_DONE, orderOf(ORDER_DONE, 'FULFILLED')],
    [ORDER_SIBLING, orderOf(ORDER_SIBLING, 'FULFILLED')],
    [ORDER_OPEN, orderOf(ORDER_OPEN, 'OPEN')],
    [ORDER_CANCELLED, orderOf(ORDER_CANCELLED, 'CANCELLED')],
  ]);

  async findOrder(orderId: string): Promise<AcceptanceOrderFacts | null> {
    return this.orders.get(orderId) ?? null;
  }

  /** Chi `TRIP_WITH_ORDER` da co nghia vu thuong mai; moi chuyen khac chua co don nao. */
  async findOrderForTrip(tripId: string): Promise<AcceptanceOrderFacts | null> {
    return tripId === TRIP_WITH_ORDER ? (this.orders.get(ORDER_DONE) ?? null) : null;
  }

  async listCompletableOrders(): Promise<AcceptanceOrderFacts[]> {
    return [...this.orders.values()].filter((order) => order.status === 'FULFILLED');
  }

  /** CA HAI don da giao deu nam tren CUNG mot vong chay — nen dung cho bai `#275` K7 bai 3. */
  async contextForOrders(orderIds: readonly string[]): Promise<readonly AcceptanceOrderContext[]> {
    return orderIds
      .filter((orderId) => orderId === ORDER_DONE || orderId === ORDER_SIBLING)
      .map((orderId) => ({ orderId, runCode: SHARED_RUN_CODE, vehicleId: 'xe-1' }));
  }
}

/** Chi MOT chung tu thuoc ve `ORDER_DONE`. Moi khoa khac la cua don khac hoac khong ton tai. */
class FakeEvidence extends AcceptanceEvidenceFacts {
  async belongingTo(orderId: string, refs: readonly string[]): Promise<readonly string[]> {
    return orderId === ORDER_DONE ? refs.filter((ref) => ref === OWN_DOC) : [];
  }

  async countFor(orderId: string): Promise<number> {
    return orderId === ORDER_DONE ? 1 : 0;
  }
}

class FakeCounterparties extends AcceptanceCounterpartyFacts {
  async exists(counterpartyId: string): Promise<boolean> {
    return counterpartyId === 'phap-nhan-A';
  }
}

/**
 * LOI cua mot lenh le ra phai bi tu choi.
 *
 * NEM khi lenh lai di qua, thay vi tra ve chinh ket qua thanh cong: mot bai so sanh thong diep loi
 * cua hai lenh ma mot trong hai lai thanh cong se so hai `undefined` voi nhau va BAO XANH — dung
 * cai bay ma bo bai chong do danh sach nay ton tai de tranh.
 */
async function failureOf(run: Promise<unknown>): Promise<TransportDomainError> {
  try {
    await run;
  } catch (error) {
    return error as TransportDomainError;
  }
  throw new Error('Lenh nay le ra phai bi tu choi nhung da di qua');
}

/** Dong ho GHIM. Moi gia tri `decidedAt` trong bo nay phai bang dung con so nay. */
const SERVER_NOW = new Date('2026-09-08T03:15:00.000Z');

const command = (
  patch: Partial<RecordAcceptanceDecisionCommand> = {},
): RecordAcceptanceDecisionCommand => ({
  orderId: ORDER_DONE,
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

describe('CommercialAcceptanceService — bai doi khang #275 K8', () => {
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

  describe('K8-12 — ket thuc truoc khi giao xong khong lam gi du dieu kien', () => {
    it('tu choi ket thuc mot don con dang cho giao', async () => {
      await expect(service.decide(command({ orderId: ORDER_OPEN }))).rejects.toMatchObject({
        reason: 'ACCEPTANCE_ORDER_NOT_FULFILLED',
      });
    });

    it('don DA HUY co ma rieng, khong gop vao "chua giao xong"', async () => {
      await expect(service.decide(command({ orderId: ORDER_CANCELLED }))).rejects.toMatchObject({
        reason: 'ACCEPTANCE_ORDER_CANCELLED',
      });
    });

    it('don khong ton tai -> NOT_FOUND, khong phai mot ho so rong', async () => {
      await expect(service.decide(command({ orderId: 'khong-co' }))).rejects.toMatchObject({
        reason: 'ACCEPTANCE_ORDER_NOT_FOUND',
      });
    });
  });

  describe('K8-06 va K8-07 — chung cu cua don khac, va khong do duoc danh sach', () => {
    it('chung tu cua don A khong ket thuc duoc don B', async () => {
      await expect(service.decide(command({ evidenceRefs: [FOREIGN_DOC] }))).rejects.toMatchObject({
        reason: 'ACCEPTANCE_EVIDENCE_NOT_FOR_ORDER',
      });
    });

    it('chung tu cua don A khong dung duoc khi dang ket thuc don SIBLING', async () => {
      // Cung mot khoa hop le voi `ORDER_DONE`, nhung tren mot don khac thi no khong con la can cu.
      await expect(
        service.decide(command({ orderId: ORDER_SIBLING, evidenceRefs: [OWN_DOC] })),
      ).rejects.toMatchObject({ reason: 'ACCEPTANCE_EVIDENCE_NOT_FOR_ORDER' });
    });

    it('tron mot khoa hop le voi mot khoa la thi CA LENH bi tu choi', async () => {
      // Loc bo khoa la roi ghi phan con lai se bien mot lan gian lan thanh mot lan ket thuc hop le.
      await expect(
        service.decide(command({ evidenceRefs: [OWN_DOC, FOREIGN_DOC] })),
      ).rejects.toMatchObject({ reason: 'ACCEPTANCE_EVIDENCE_NOT_FOR_ORDER' });
    });

    it('thong bao KHONG ke ten khoa nao bi loai — khong do duoc chung tu cua don khac', async () => {
      const failure = await failureOf(service.decide(command({ evidenceRefs: [FOREIGN_DOC] })));

      expect(failure).toBeInstanceOf(TransportDomainError);
      expect(failure.message).not.toContain(FOREIGN_DOC);
    });

    it('khoa KHONG TON TAI va khoa CUA DON KHAC cho ra cung mot cau tra loi', async () => {
      const foreign = await failureOf(service.decide(command({ evidenceRefs: [FOREIGN_DOC] })));
      const unknown = await failureOf(
        service.decide(command({ evidenceRefs: ['khoa-hoan-toan-bia-ra'] })),
      );

      expect(unknown.reason).toBe(foreign.reason);
      expect(unknown.message).toBe(foreign.message);
    });

    it('ket thuc theo chung tu ma khong tro toi chung tu nao thi bi tu choi', async () => {
      await expect(service.decide(command({ evidenceRefs: [] }))).rejects.toMatchObject({
        reason: 'ACCEPTANCE_EVIDENCE_REQUIRED',
      });
    });
  });

  describe('K8-03 va K8-16 — dong ho va danh tinh khong den tu ben goi', () => {
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

  describe('K8-04 — gui lai mot lenh khong sinh ra hai quyet dinh', () => {
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

  describe('K8-05 — hai nguoi cung bam, va lich su giu CA HAI quyet dinh', () => {
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

  describe('can cu ngoai — #275 K2', () => {
    it('ket thuc khong co ban so PHAI ghi ro B da nhan cai gi', async () => {
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

    it('ket thuc theo ban giay di duoc khi co ghi chu that', async () => {
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

  /**
   * `#275` K7 bai 3: *"A Run containing multiple Orders may have Order A approved and Order B
   * pending independently."*
   *
   * `FakeMovement.contextForOrders` dat CA HAI don da giao len CUNG mot vong chay `RUN-CHUNG`, nen
   * bai nay that su chay tren tinh huong do chu khong phai tren hai vong chay roi.
   */
  describe('#275 K7 — hai don tren CUNG mot vong chay quyet dinh doc lap', () => {
    it('ket thuc don A khong dong gi den don B', async () => {
      await service.decide(
        command({
          basis: 'EXTERNAL_PHYSICAL_CONFIRMATION',
          evidenceRefs: [],
          externalNote: 'B giu ban goc',
        }),
      );

      const rows = await service.queue();
      const a = rows.find((row) => row.orderId === ORDER_DONE);
      const b = rows.find((row) => row.orderId === ORDER_SIBLING);

      expect(a?.runCode).toBe(SHARED_RUN_CODE);
      expect(b?.runCode).toBe(SHARED_RUN_CODE);
      expect(a?.state).toBe('APPROVED');
      expect(a?.settlementEligible).toBe(true);
      expect(b?.state).toBe('PENDING');
      expect(b?.settlementEligible).toBe(false);
    });

    it('don B van ket thuc duoc sau do, doc lap voi don A', async () => {
      await service.decide(
        command({
          basis: 'EXTERNAL_PHYSICAL_CONFIRMATION',
          evidenceRefs: [],
          externalNote: 'B giu ban goc',
        }),
      );
      const detail = await service.decide(
        command({
          orderId: ORDER_SIBLING,
          basis: 'EXTERNAL_PHYSICAL_CONFIRMATION',
          evidenceRefs: [],
          externalNote: 'Ban giay cua don thu hai',
          idempotencyKey: 'idem-don-2',
        }),
      );
      expect(detail.acceptance.orderId).toBe(ORDER_SIBLING);
      expect(detail.acceptance.state).toBe('APPROVED');
    });
  });

  describe('#275 K4 — hang cho va phep suy du dieu kien doi soat', () => {
    it('don da giao nhung chua ai ket thuc thi dang PENDING va KHONG du dieu kien', async () => {
      const rows = await service.queue();
      const row = rows.find((entry) => entry.orderId === ORDER_DONE);

      expect(row?.state).toBe('PENDING');
      expect(row?.settlementEligible).toBe(false);
      expect(row?.acceptanceId).toBeNull();
    });

    it('hang cho KHONG chua don chua giao xong hay don da huy', async () => {
      const ids = (await service.queue()).map((row) => row.orderId);
      expect(ids).not.toContain(ORDER_OPEN);
      expect(ids).not.toContain(ORDER_CANCELLED);
    });

    it('dong hang cho mang du ngu canh nghiep vu ma #275 K4 doi', async () => {
      const row = (await service.queue()).find((entry) => entry.orderId === ORDER_DONE);
      expect(row).toMatchObject({
        orderCode: `MA-${ORDER_DONE}`,
        customerId: 'khach-1',
        originLabel: 'Ha Noi',
        destinationLabel: 'Hai Phong',
        evidenceCount: 1,
      });
    });

    it('sau khi ket thuc thi du dieu kien doi soat', async () => {
      await service.decide(command());
      const row = (await service.queue()).find((entry) => entry.orderId === ORDER_DONE);

      expect(row?.state).toBe('APPROVED');
      expect(row?.settlementEligible).toBe(true);
    });

    it.each(['REJECTED', 'NEEDS_CORRECTION'] as const)(
      'sau khi %s thi KHONG du dieu kien doi soat',
      async (outcome) => {
        await service.decide(command({ outcome, reasonCode: 'NO_EVIDENCE', evidenceRefs: [] }));
        const row = (await service.queue()).find((entry) => entry.orderId === ORDER_DONE);

        expect(row?.state).toBe(outcome);
        expect(row?.settlementEligible).toBe(false);
      },
    );

    it('loc theo trang thai tra dung nhung ho so dang cho', async () => {
      expect(await service.queue({ state: 'APPROVED' })).toEqual([]);
      expect((await service.queue({ state: 'PENDING' })).map((row) => row.orderId)).toEqual([
        ORDER_DONE,
        ORDER_SIBLING,
      ]);
    });
  });

  /**
   * `#275` K5 — hinh dang ma CONG DOI SOAT doc.
   *
   * Ba nhanh, ba y nghia khac nhau. Nhanh `NO_ORDER` la thu thay the
   * `NOT_PROJECTED => pass` cua `#273`, va no PHAI phan biet duoc voi `BLOCKED`: hai viec nguoi truc
   * phai lam khac han nhau.
   */
  describe('#275 K5 — dieu kien doi soat doc tu DON, khong tu vong chay', () => {
    it('chuyen chua co nghia vu thuong mai nao -> NO_ORDER', async () => {
      expect(await service.eligibilityForTrip('chuyen-chua-chieu')).toEqual({ kind: 'NO_ORDER' });
    });

    it('chuyen co don nhung chua ai ket thuc -> BLOCKED kem CA HAI ve dieu kien', async () => {
      expect(await service.eligibilityForTrip(TRIP_WITH_ORDER)).toEqual({
        kind: 'BLOCKED',
        orderId: ORDER_DONE,
        orderCode: `MA-${ORDER_DONE}`,
        orderStatus: 'FULFILLED',
        state: 'PENDING',
      });
    });

    it('sau khi ke toan ket thuc -> ELIGIBLE', async () => {
      const detail = await service.decide(command());
      expect(await service.eligibilityForTrip(TRIP_WITH_ORDER)).toEqual({
        kind: 'ELIGIBLE',
        orderId: ORDER_DONE,
        orderCode: `MA-${ORDER_DONE}`,
        acceptanceId: detail.acceptance.id,
      });
    });

    it.each(['REJECTED', 'NEEDS_CORRECTION'] as const)('%s van BLOCKED', async (outcome) => {
      await service.decide(command({ outcome, reasonCode: 'NO_EVIDENCE', evidenceRefs: [] }));
      expect(await service.eligibilityForTrip(TRIP_WITH_ORDER)).toMatchObject({
        kind: 'BLOCKED',
        state: outcome,
      });
    });

    it('don chua giao xong ma da co ho so thi van BLOCKED — khong duong tat', async () => {
      expect(await service.eligibilityForOrder(ORDER_OPEN)).toMatchObject({
        kind: 'BLOCKED',
        orderStatus: 'OPEN',
        state: 'PENDING',
      });
    });

    it('don khong ton tai -> NO_ORDER, khong nem', async () => {
      expect(await service.eligibilityForOrder('khong-co')).toEqual({ kind: 'NO_ORDER' });
    });
  });

  describe('doc mot ho so chua ai ket thuc', () => {
    it('tra ve PENDING chu khong nem NOT_FOUND — vang mat la mot cau tra loi nghiep vu', async () => {
      const detail = await service.detailForOrder(ORDER_DONE);
      expect(detail.acceptance.state).toBe('PENDING');
      expect(detail.decisions).toEqual([]);
    });

    it('don khong co that van la NOT_FOUND', async () => {
      await expect(service.detailForOrder('khong-co')).rejects.toMatchObject({
        reason: 'ACCEPTANCE_ORDER_NOT_FOUND',
      });
    });
  });
});
