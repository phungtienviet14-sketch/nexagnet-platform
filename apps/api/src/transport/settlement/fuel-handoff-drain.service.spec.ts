import { describe, expect, it } from 'vitest';
import type { OrderCompletionEligibility } from '../acceptance/acceptance.types.js';
import { fuelHandoffDrainEnabled } from './fuel-handoff-drain.scheduler.js';
import {
  FUEL_HANDOFF_DRAIN_BATCH,
  FUEL_HANDOFF_SCAN_PAGE,
  FuelHandoffDrainService,
} from './fuel-handoff-drain.service.js';
import { InMemorySettlementRepository } from './in-memory-settlement.repository.js';
import { SettlementOrderCompletionGate } from './settlement-order-completion.port.js';
import {
  FuelSettlementSource,
  SettlementCoreFacts,
  type FuelHandoffFacts,
  type FuelHandoffScanPosition,
  type SettlementTripFacts,
} from './settlement.ports.js';
import { SettlementService } from './settlement.service.js';

/**
 * `#295` Lane V P0 — LUAT DIEU PHOI cua vong quet, tach khoi phep tinh tien.
 *
 * ===========================================================================
 * BO BAI NAY KHONG NOI VE SO TIEN. `transport-fuel-handoff-drain.int.spec.ts` lam viec do, tren
 * Postgres that, vi moi bat bien tien cua duong nay song o rang buoc CSDL.
 *
 * Cai con lai — thu tu doc, chan lo, co lap loi, fail-closed khi doc hong, va TIEN DO — la luat cua
 * TANG UNG DUNG, va chung kiem duoc o day nhanh gap tram lan. Dat chung vao bo int se lam mot bai
 * ve "chan lo la 25" phai dung mot CSDL that de dem toi 26.
 *
 * ===========================================================================
 * HAI BAI `V-LIVE-1`/`V-LIVE-2` DUNG O CON SO SAN XUAT, va do khong phai su tinh co.
 *
 * Chung dung lai dung hai canh ma vong soat doc lap chi ra, o dung `FUEL_HANDOFF_SCAN_PAGE = 500`
 * va `FUEL_HANDOFF_DRAIN_BATCH = 25`. Ha con so xuong cho bai chay nhanh se lam bai van xanh khi ai
 * do nang chan doc len 5000 — tuc xoa mat chinh cai luoi vua dung.
 */

class NoTrips extends SettlementCoreFacts {
  async findTrip(): Promise<SettlementTripFacts | null> {
    return null;
  }

  async listTrips(): Promise<SettlementTripFacts[]> {
    return [];
  }
}

class UnusedGate extends SettlementOrderCompletionGate {
  eligibilityForTrip(): Promise<OrderCompletionEligibility> {
    throw new Error('Duong ban giao cay xang khong hoi cong ket thuc don');
  }

  eligibilityForOrder(): Promise<OrderCompletionEligibility> {
    throw new Error('Duong ban giao cay xang khong hoi cong ket thuc don');
  }
}

/** Thoi diem phat ban giao thu `index` — moi ky cach nhau mot giay, nhu khi dong lan luot. */
const emittedAt = (index: number): string =>
  new Date(Date.UTC(2026, 8, 15, 0, 0, index)).toISOString();

/** Dem 0 o dau de thu tu TU DIEN cua id trung voi thu tu so — `h010` truoc `h100`. */
const pad = (index: number): string => String(index).padStart(3, '0');

const handoff = (
  overrides: Partial<FuelHandoffFacts> & { handoffId: string },
): FuelHandoffFacts => ({
  reconciliationId: `ky-${overrides.handoffId}`,
  revision: 1,
  supersedesId: null,
  supplierId: 'cay-xang-1',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  acceptedAmount: 1_000_000,
  currencyCode: 'VND',
  acceptedLineCount: 1,
  acceptedLineIds: ['dong-1'],
  emittedAt: emittedAt(0),
  ...overrides,
});

/** `count` ban giao xep theo thu tu phat, moi ban mot ky rieng. */
const handoffRun = (count: number, prefix = 'h'): FuelHandoffFacts[] =>
  Array.from({ length: count }, (_unused, index) =>
    handoff({ handoffId: `${prefix}${pad(index)}`, emittedAt: emittedAt(index) }),
  );

/**
 * HOP THU GIA — tra ve dung nhung gi bai dang dung can, VA DEM so lan bi hoi.
 *
 * `askedFor` la thu phan biet "vong quet bo qua ky da tieu thu" voi "vong quet doc lai ca chuoi cua
 * no roi moi phat hien khong co gi de lam". Hai hanh vi do cho cung ket qua tren bang, va rat khac
 * nhau khi co ba tram ky.
 *
 * ===========================================================================
 * `pendingHandoffs` O DAY PHAI TON TRONG KEYSET Y NHU HAI KHO THAT.
 *
 * Mot ban gia "de tinh" (bo qua `after`, luon tra ve tu dau) se lam hai bai `V-LIVE-1`/`V-LIVE-2`
 * xanh ngay ca khi ban sua bi go ra khoi ma san xuat — tuc bien chung thanh hai bai vo nghia. Nen
 * phep so sanh o day duoc viet lai dung nhu trong `prisma-fuel.repository.ts`.
 */
class FakeOutbox extends FuelSettlementSource {
  readonly askedFor: string[] = [];
  readonly pageRequests: (FuelHandoffScanPosition | null)[] = [];
  failRead = false;

  constructor(private readonly rows: FuelHandoffFacts[]) {
    super();
  }

  async latestHandoff(reconciliationId: string): Promise<FuelHandoffFacts | null> {
    return this.rows.filter((row) => row.reconciliationId === reconciliationId).at(-1) ?? null;
  }

  async handoffRevisions(reconciliationId: string): Promise<FuelHandoffFacts[]> {
    this.askedFor.push(reconciliationId);
    return this.rows.filter((row) => row.reconciliationId === reconciliationId);
  }

  async pendingHandoffs(input: {
    readonly after: FuelHandoffScanPosition | null;
    readonly limit: number;
  }): Promise<FuelHandoffFacts[]> {
    if (this.failRead) throw new Error('hop thu khong mo duoc');
    this.pageRequests.push(input.after);

    const ordered = [...this.rows].sort(
      (left, right) =>
        left.emittedAt.localeCompare(right.emittedAt) ||
        left.handoffId.localeCompare(right.handoffId),
    );

    const after = input.after;
    const page =
      after === null
        ? ordered
        : ordered.filter((row) => {
            const byTime = row.emittedAt.localeCompare(after.emittedAt);
            return byTime > 0 || (byTime === 0 && row.handoffId.localeCompare(after.handoffId) > 0);
          });

    return page.slice(0, input.limit);
  }
}

/** Hop thu trong do mot so ky KHONG co chuoi ban sua doi — tuc `ingestFuelHandoff()` se nem. */
class PoisonOutbox extends FakeOutbox {
  constructor(
    rows: FuelHandoffFacts[],
    private readonly poisoned: ReadonlySet<string>,
  ) {
    super(rows);
  }

  override async handoffRevisions(reconciliationId: string): Promise<FuelHandoffFacts[]> {
    if (this.poisoned.has(reconciliationId)) return [];
    return super.handoffRevisions(reconciliationId);
  }
}

const build = (outbox: FuelSettlementSource, repository = new InMemorySettlementRepository()) => {
  const settlement = new SettlementService(repository, new NoTrips(), outbox, new UnusedGate());
  return { repository, drain: new FuelHandoffDrainService(settlement, repository, outbox) };
};

describe('Vong quet ban giao cay xang — luat dieu phoi', () => {
  it('hop thu rong: khong lam gi, va khong bao loi', async () => {
    const { drain } = build(new FakeOutbox([]));

    expect(await drain.drain()).toEqual({
      ingested: 0,
      alreadyCurrent: 0,
      failed: 0,
      saturated: false,
      /* Hop thu chua bao gio co gi thi khong co vong nao de dong lai. */
      wrapped: false,
    });
  });

  it('doc hop thu that bai: FAIL CLOSED — khong xu ly ky nao', async () => {
    const outbox = new FakeOutbox([handoff({ handoffId: 'a' })]);
    outbox.failRead = true;
    const { drain } = build(outbox);

    const summary = await drain.drain();

    expect(summary.ingested).toBe(0);
    /*
     * Diem mau chot: KHONG phai "0 ky can lam" ma la "khong biet co ky nao can lam". Hai thu do
     * cung cho `ingested: 0`, va chi cai duoi moi duoc phep de lai hop thu chua doc.
     */
    expect(outbox.askedFor).toEqual([]);
    /* Va mot lan doc hong TUYET DOI khong duoc bi hieu thanh "het hop thu roi, quay ve dau". */
    expect(summary.wrapped).toBe(false);
  });

  it('ky da tieu thu KHONG bi doc lai chuoi ban sua doi', async () => {
    const outbox = new FakeOutbox([handoff({ handoffId: 'a' })]);
    const { drain } = build(outbox);

    await drain.drain();
    outbox.askedFor.length = 0;

    const summary = await drain.drain();

    expect(summary).toMatchObject({ ingested: 0, alreadyCurrent: 1 });
    expect(outbox.askedFor).toEqual([]);
  });

  it('mot ky hong KHONG chan nhung ky sau no', async () => {
    /*
     * `ky-a` khong co ban sua doi nao trong hop thu gia, nen `ingestFuelHandoff()` nem
     * `SETTLEMENT_DOCUMENT_NOT_FOUND`. Neu ca lo nam trong mot `try`, `ky-b` se khong bao gio duoc
     * xu ly — va vi thu tu la cu-truoc-moi-sau, no se khong bao gio duoc xu ly o luot sau.
     */
    const rows = [
      handoff({ handoffId: 'a', emittedAt: emittedAt(0) }),
      handoff({ handoffId: 'b', emittedAt: emittedAt(1) }),
    ];
    const { drain, repository } = build(new PoisonOutbox(rows, new Set(['ky-a'])));

    const summary = await drain.drain();

    expect(summary).toMatchObject({ failed: 1, ingested: 1 });

    const cursors = await repository.fuelHandoffCursors(['ky-a', 'ky-b']);
    expect(cursors.has('ky-a')).toBe(false);
    expect(cursors.get('ky-b')).toBe(1);
  });

  it('chan lo: nhieu hon mot lo thi dung lai va bao con viec', async () => {
    const { drain } = build(new FakeOutbox(handoffRun(FUEL_HANDOFF_DRAIN_BATCH + 5)));

    const summary = await drain.drain();

    expect(summary.ingested).toBe(FUEL_HANDOFF_DRAIN_BATCH);
    expect(summary.saturated).toBe(true);
    /* Cham chan ghi KHONG phai het hop thu — quan ve dau o day se lam mat cho dang dung. */
    expect(summary.wrapped).toBe(false);
  });

  it('lo con lai duoc lam o nhip sau, va KHONG phai duyet lai lo truoc', async () => {
    const outbox = new FakeOutbox(handoffRun(FUEL_HANDOFF_DRAIN_BATCH + 5));
    const { drain } = build(outbox);

    await drain.drain();
    const second = await drain.drain();

    expect(second.ingested).toBe(5);
    /*
     * `alreadyCurrent: 0` la CAI MOI o day. Ban dau nhip hai doc lai tu dau bang va phai di qua 25
     * ky vua lam — vo hai voi 30 ky, va la chinh co che giet chet ky thu 501 khi so ky lon hon
     * chan doc. Gio nhip hai bat dau tu cho nhip mot dung lai.
     */
    expect(second.alreadyCurrent).toBe(0);
    expect(second.saturated).toBe(false);
  });

  it('do dai trang duoc truyen xuong nguyen ven, va nhip dau doc tu DAU hop thu', async () => {
    const outbox = new (class extends FakeOutbox {
      asked = -1;

      override async pendingHandoffs(input: {
        readonly after: FuelHandoffScanPosition | null;
        readonly limit: number;
      }): Promise<FuelHandoffFacts[]> {
        this.asked = input.limit;
        return super.pendingHandoffs(input);
      }
    })([]);

    await build(outbox).drain.drain();

    expect(outbox.asked).toBe(FUEL_HANDOFF_SCAN_PAGE);
    expect(outbox.pageRequests).toEqual([null]);
  });

  it('cong tac van hanh: mac dinh BAT, chi `off` moi tat', () => {
    expect(fuelHandoffDrainEnabled(undefined)).toBe(true);
    expect(fuelHandoffDrainEnabled('')).toBe(true);
    expect(fuelHandoffDrainEnabled('on')).toBe(true);
    expect(fuelHandoffDrainEnabled('OFF')).toBe(false);
    expect(fuelHandoffDrainEnabled('  off  ')).toBe(false);
  });
});

/**
 * ===========================================================================
 * BON BAI HOI QUY CUA VONG SOAT DOC LAP — `INDEPENDENT_CHATGPT_REVIEW`, 15/09/2026.
 * ===========================================================================
 *
 * `V-LIVE-1` va `V-LIVE-2` deu DO tren ban truoc cua `fuel-handoff-drain.service.ts`, va do la ly
 * do chung ton tai. Neu mot ban sua tuong lai lam mot trong hai bai nay do lai, thi diem can nhin
 * khong phai bai kiem — la mot khoan phai tra cho cay xang vua bien mat khoi so sach.
 */
describe('Vong quet ban giao cay xang — TIEN DO va CONG BANG', () => {
  it('V-LIVE-1: 501 ky, 500 ky dau da co cong no — ky thu 501 VAN phai toi luot', async () => {
    /*
     * ===========================================================================
     * DUNG CANH MA BAN TRUOC CHET.
     *
     * `pendingHandoffs` cu tra ve 500 hang DAU theo `emittedAt` tang dan. 500 hang do deu da co
     * cong no, nen moi nhip ket luan "khong con viec gi" — va hang thu 501, mot ban giao hop le
     * cua mot ky vua dong, khong bao gio duoc nhin thay. Quet 5 nhip hay 5 nghin nhip deu vay.
     *
     * So 501 khong phai mot con so to cho vui: no la `FUEL_HANDOFF_SCAN_PAGE + 1`, tuc hang dau
     * tien nam ngoai tam voi cua ban cu.
     */
    const rows = handoffRun(FUEL_HANDOFF_SCAN_PAGE + 1);
    const moi = rows[FUEL_HANDOFF_SCAN_PAGE]!;
    const { drain, repository } = build(new FakeOutbox(rows));

    /*
     * Dat 500 ky dau vao trang thai "da tieu thu" TRUC TIEP tren kho, khong di qua vong quet.
     *
     * Di qua vong quet cung toi dich, nhung se lam bai kiem phu thuoc vao chinh co che dang duoc
     * kiem. Day la mot so sach DA DAY tu truoc, dung nhu luc ke toan dong ky thu 501 vao mot he
     * thong da chay hai nam.
     */
    for (const row of rows.slice(0, FUEL_HANDOFF_SCAN_PAGE)) {
      await repository.advanceFuelHandoffCursor({
        reconciliationId: row.reconciliationId,
        revision: row.revision,
        handoffId: row.handoffId,
      });
    }

    let ingested = 0;
    for (let tick = 0; tick < 5; tick += 1) ingested += (await drain.drain()).ingested;

    expect(ingested).toBe(1);

    const cursors = await repository.fuelHandoffCursors([moi.reconciliationId]);
    expect(cursors.get(moi.reconciliationId)).toBe(moi.revision);
  });

  it('V-LIVE-2: 25 ky hong lien tiep KHONG duoc chan ky lanh manh dung sau chung', async () => {
    /*
     * ===========================================================================
     * BIEN THE THU HAI CUA CUNG MOT LOI.
     *
     * Chan ghi dung o `ingested + failed >= 25`. Neu dung 25 ky dau hang deu ghi hong, moi nhip
     * tieu tron chan ghi vao chung roi dung — va ky lanh manh thu 26 doi vinh vien.
     *
     * Thu bat duoc no la: vi tri quet tien qua ca hang vua GHI HONG. Viec cua 25 ky hong khong
     * mat (con tro TIEU THU cua chung chua he duoc day), no chi duoc lam lai o VONG sau.
     */
    const poison = handoffRun(FUEL_HANDOFF_DRAIN_BATCH, 'x');
    const khoe = handoff({
      handoffId: 'z-khoe',
      emittedAt: emittedAt(FUEL_HANDOFF_DRAIN_BATCH + 10),
    });
    const outbox = new PoisonOutbox(
      [...poison, khoe],
      new Set(poison.map((row) => row.reconciliationId)),
    );
    const { drain, repository } = build(outbox);

    const first = await drain.drain();
    expect(first).toMatchObject({
      failed: FUEL_HANDOFF_DRAIN_BATCH,
      ingested: 0,
      saturated: true,
    });

    /* Nhip hai: day chinh la dieu ban truoc KHONG lam duoc. */
    const second = await drain.drain();
    expect(second.ingested).toBe(1);

    const cursors = await repository.fuelHandoffCursors([khoe.reconciliationId]);
    expect(cursors.get(khoe.reconciliationId)).toBe(khoe.revision);

    /*
     * VA VIEC CUA 25 KY HONG KHONG BI MAT. Nhip hai vua cham day hop thu nen da quay ve dau; nhip
     * ba phai thu lai dung 25 ky do. Neu doan nay do, thi ban sua da doi mot loi doi (starvation)
     * lay mot loi mat viec — te hon han.
     */
    expect(second.wrapped).toBe(true);
    const third = await drain.drain();
    expect(third.failed).toBe(FUEL_HANDOFF_DRAIN_BATCH);

    const poisonCursors = await repository.fuelHandoffCursors(
      poison.map((row) => row.reconciliationId),
    );
    expect(poisonCursors.size).toBe(0);
  });

  it('V-LIVE-3: hai ky phat cung mot mili giay — khong nhay qua, khong doc lai mai', async () => {
    /*
     * Keyset chi tren `emittedAt` se hoac bo mat hang thu hai (`>`), hoac doc lai hang thu nhat
     * mai mai (`>=`). Dong ky mot loat cuoi thang la luc hai ban giao trung mili giay, tuc luc
     * loi nay xay ra that.
     */
    const cung = emittedAt(7);
    const rows = [
      handoff({ handoffId: 'a', emittedAt: cung }),
      handoff({ handoffId: 'b', emittedAt: cung }),
    ];
    const { drain, repository } = build(new FakeOutbox(rows));

    const first = await drain.drain({ scanPage: 1, drainBatch: 10 });
    expect(first.ingested).toBe(1);

    const second = await drain.drain({ scanPage: 1, drainBatch: 10 });
    expect(second.ingested).toBe(1);

    const cursors = await repository.fuelHandoffCursors(['ky-a', 'ky-b']);
    expect(cursors.get('ky-a')).toBe(1);
    expect(cursors.get('ky-b')).toBe(1);
  });

  it('V-LIVE-4: vi tri quet song qua mot lan khoi dong lai', async () => {
    /*
     * `restart-safe` cua `OWNER_DECISION_2026_09_13` khong phai "timer nho duoc" ma la "khong can
     * nho": moi trang thai nam trong kho. Mot dich vu MOI dung tren cung mot kho phai doc tiep tu
     * cho dich vu cu dung lai, chu khong quay ve dau.
     */
    const rows = handoffRun(4);
    const outbox = new FakeOutbox(rows);
    const repository = new InMemorySettlementRepository();

    await build(outbox, repository).drain.drain({ scanPage: 2, drainBatch: 10 });
    expect(outbox.pageRequests).toEqual([null]);

    /* Mot tien trinh khac, mot dich vu khac, cung mot kho. */
    await build(outbox, repository).drain.drain({ scanPage: 2, drainBatch: 10 });

    expect(outbox.pageRequests[1]).toEqual({
      emittedAt: rows[1]!.emittedAt,
      handoffId: rows[1]!.handoffId,
    });
  });
});
