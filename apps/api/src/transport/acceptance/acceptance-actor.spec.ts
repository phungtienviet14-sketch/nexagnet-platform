import { describe, expect, it } from 'vitest';
import type { UserRole } from '../../auth/auth.types.js';
import { InMemoryUserRepository, type AuthUserRecord } from '../../auth/user.repository.js';
import { DEMO_SEED_ACTOR } from '../demo/demo-seed.js';
import {
  AcceptanceActorFactsAdapter,
  SEED_DATA_ACTOR_ID,
  SEED_DATA_ACTOR_LABEL,
  UNRESOLVED_ACTOR_LABEL,
  acceptanceActorView,
  type AcceptanceActorAccount,
} from './acceptance-actor.js';
import { CommercialAcceptanceReadModel } from './acceptance-read-model.js';
import type {
  CommercialAcceptanceDecision,
  CommercialAcceptanceDetail,
  CommercialAcceptanceQueueRow,
} from './acceptance.types.js';

/**
 * `#334` (UAT BUG-04) — AI DA QUYET, doc duoc boi con nguoi.
 *
 * UAT thay cot "Người quyết" in nguyen van `cmu6cius10000p91cob6nwivs`. Bo nay khoa ba dieu:
 *
 *   1. ma tho `decidedBy` di NGUYEN VEN — phep phan giai chi them nhan, khong thay the;
 *   2. nhan la TEN tu nguon tai khoan (`UserRepository`), khong phai mot ten viet cung;
 *   3. ma khong con tai khoan nao thi ra mot cau du phong, KHONG BAO GIO ra chinh cai ma.
 *
 * Ten ke toan trong bo nay CO Y khong phai ten persona mau: neu ai do viet cung "Kế toán mẫu" vao
 * phep phan giai, bai van do.
 */

const KNOWN_ID = 'cmu6cius10000p91cob6nwivs';
const DISABLED_ID = 'cmu6cz8pq0001p91c7hd2kx4e';
const DELETED_ID = 'cmu6d0ld80003p91cxk2mzq7h';
const UNNAMED_ID = 'cmu6d1a2b0004p91c9fj3lq8w';

const user = (
  id: string,
  username: string,
  name: string,
  role: UserRole = 'ACCOUNTING',
  disabledAt: Date | null = null,
): AuthUserRecord => ({
  id,
  username,
  name,
  email: null,
  phone: null,
  passwordHash: 'x',
  role,
  disabledAt,
  credentialVersion: 1,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  lastLoginAt: null,
  passwordChangedAt: null,
});

const USERS = [
  user(KNOWN_ID, 'thu-ha', 'Nguyễn Thu Hà'),
  user(DISABLED_ID, 'minh-cu', 'Trần Minh', 'ADMIN', new Date('2026-09-15T00:00:00.000Z')),
  user(UNNAMED_ID, 'ke-toan-2', '   '),
];

/** Dem so lan hoi nguon tai khoan — hang cho khong duoc hoi mot ma hai lan. */
class CountingUsers extends InMemoryUserRepository {
  readonly asked: string[] = [];

  override async findById(id: string): Promise<AuthUserRecord | null> {
    this.asked.push(id);
    return super.findById(id);
  }
}

const account = (patch: Partial<AcceptanceActorAccount> = {}): AcceptanceActorAccount => ({
  id: KNOWN_ID,
  name: 'Nguyễn Thu Hà',
  username: 'thu-ha',
  isDisabled: false,
  ...patch,
});

describe('phep phan giai MOT nguoi quyet — #334', () => {
  it('tai khoan con hoat dong -> TEN nguoi dung, ma tho giu nguyen', () => {
    expect(acceptanceActorView(KNOWN_ID, account())).toEqual({
      id: KNOWN_ID,
      label: 'Nguyễn Thu Hà',
      kind: 'USER',
    });
  });

  it('ten rong -> ten dang nhap, khong phai ma', () => {
    expect(acceptanceActorView(KNOWN_ID, account({ name: '  ' }))).toEqual({
      id: KNOWN_ID,
      label: 'thu-ha',
      kind: 'USER',
    });
  });

  it('tai khoan da khoa van la NGUOI da quyet — ten giu nguyen, `kind` noi no da khoa', () => {
    expect(
      acceptanceActorView(DISABLED_ID, account({ id: DISABLED_ID, isDisabled: true })),
    ).toEqual({ id: DISABLED_ID, label: 'Nguyễn Thu Hà', kind: 'DISABLED_USER' });
  });

  it('ma khong con tai khoan nao -> cau du phong, KHONG PHAI chinh cai ma', () => {
    const view = acceptanceActorView(DELETED_ID, undefined);
    expect(view).toEqual({ id: DELETED_ID, label: UNRESOLVED_ACTOR_LABEL, kind: 'UNRESOLVED' });
    expect(view.label).not.toContain(DELETED_ID);
  });

  it('tai khoan khong co ten lan ten dang nhap -> cau du phong', () => {
    expect(
      acceptanceActorView(UNNAMED_ID, account({ id: UNNAMED_ID, name: '', username: ' ' })),
    ).toMatchObject({ label: UNRESOLVED_ACTOR_LABEL, kind: 'UNRESOLVED' });
  });

  it('hang du lieu mau -> "Dữ liệu khởi tạo", khong phai chu `demo-seed`', () => {
    expect(acceptanceActorView(SEED_DATA_ACTOR_ID, undefined)).toEqual({
      id: SEED_DATA_ACTOR_ID,
      label: SEED_DATA_ACTOR_LABEL,
      kind: 'SEED_DATA',
    });
  });

  /**
   * Ma tac nhan gieo du lieu la mot BAN SAO chu khong mot lan import — `demo-seed.ts` khong nam
   * trong do thi nap cua ung dung, va keo no vao chi de lay mot chuoi se keo theo ca bo du lieu
   * mau. Ban sao khong duoc lech trong im lang: bai nay do neu mot ben doi.
   */
  it('ma tac nhan gieo du lieu khop voi `DEMO_SEED_ACTOR` cua buoc gieo', () => {
    expect(SEED_DATA_ACTOR_ID).toBe(DEMO_SEED_ACTOR);
  });
});

describe('cua so doc nguon tai khoan — #334', () => {
  it('tra ve dung bon truong can de goi ten; mat khau/email/SDT khong di ra khoi day', async () => {
    const accounts = await new AcceptanceActorFactsAdapter(
      new InMemoryUserRepository(USERS),
    ).accountsFor([KNOWN_ID]);

    expect(accounts).toEqual([
      { id: KNOWN_ID, name: 'Nguyễn Thu Hà', username: 'thu-ha', isDisabled: false },
    ]);
    expect(Object.keys(accounts[0] ?? {}).sort()).toEqual(['id', 'isDisabled', 'name', 'username']);
  });

  it('ma khong con tai khoan thi VANG MAT, khong nem', async () => {
    const accounts = await new AcceptanceActorFactsAdapter(
      new InMemoryUserRepository(USERS),
    ).accountsFor([DELETED_ID, DISABLED_ID]);

    expect(accounts).toEqual([
      { id: DISABLED_ID, name: 'Trần Minh', username: 'minh-cu', isDisabled: true },
    ]);
  });

  it('hoi MOI ma dung mot lan, du ma do lap lai tren nhieu dong', async () => {
    const users = new CountingUsers(USERS);
    await new AcceptanceActorFactsAdapter(users).accountsFor([KNOWN_ID, KNOWN_ID, DELETED_ID]);
    expect([...users.asked].sort()).toEqual([DELETED_ID, KNOWN_ID].sort());
  });
});

const decision = (sequence: number, decidedBy: string): CommercialAcceptanceDecision => ({
  id: `dec-${sequence}`,
  acceptanceId: 'acc-1',
  sequence,
  outcome: sequence === 1 ? 'NEEDS_CORRECTION' : 'APPROVED',
  reasonCode: 'DOCUMENT_RECEIVED',
  basis: 'EXTERNAL_PHYSICAL_CONFIRMATION',
  evidenceRefs: [],
  externalNote: 'Bên A đã ký biên bản',
  supersedesId: sequence === 1 ? null : `dec-${sequence - 1}`,
  idempotencyKey: `idem-${sequence}`,
  decidedBy,
  decidedAt: `2026-09-20T0${sequence}:00:00.000Z`,
});

const detailOf = (
  decisions: readonly CommercialAcceptanceDecision[],
): CommercialAcceptanceDetail => ({
  acceptance: {
    id: 'acc-1',
    orderId: 'ord-1',
    state: 'APPROVED',
    counterpartyId: null,
    businessDate: '2026-09-20' as CommercialAcceptanceDetail['acceptance']['businessDate'],
    latestDecisionId: decisions[decisions.length - 1]?.id ?? null,
    openedBy: decisions[0]?.decidedBy ?? '',
    createdAt: '2026-09-20T01:00:00.000Z',
    updatedAt: '2026-09-20T02:00:00.000Z',
  },
  decisions,
});

const queueRow = (
  orderId: string,
  latestDecidedBy: string | null,
): CommercialAcceptanceQueueRow => ({
  acceptanceId: latestDecidedBy === null ? null : `acc-${orderId}`,
  orderId,
  orderCode: `MA-${orderId}`,
  orderStatus: 'FULFILLED',
  customerId: null,
  originLabel: 'Hà Nội',
  destinationLabel: 'Hải Phòng',
  state: latestDecidedBy === null ? 'PENDING' : 'APPROVED',
  counterpartyId: null,
  businessDate: '2026-09-20' as CommercialAcceptanceQueueRow['businessDate'],
  evidenceCount: 0,
  settlementEligible: latestDecidedBy !== null,
  runCode: null,
  vehicleId: null,
  latestDecidedAt: latestDecidedBy === null ? null : '2026-09-20T02:00:00.000Z',
  latestDecidedBy,
});

const readModel = (users = new InMemoryUserRepository(USERS)): CommercialAcceptanceReadModel =>
  new CommercialAcceptanceReadModel(new AcceptanceActorFactsAdapter(users));

describe('hinh chieu doc cua ket thuc don — #334', () => {
  it('lich su: moi quyet dinh GIU ma tho va THEM mot nhan doc duoc', async () => {
    const detail = detailOf([decision(1, DELETED_ID), decision(2, KNOWN_ID)]);
    const shown = await readModel().detail(detail);

    expect(shown.acceptance).toEqual(detail.acceptance);
    expect(shown.decisions.map((entry) => entry.decidedBy)).toEqual([DELETED_ID, KNOWN_ID]);
    expect(shown.decisions.map((entry) => entry.decidedByActor)).toEqual([
      { id: DELETED_ID, label: UNRESOLVED_ACTOR_LABEL, kind: 'UNRESOLVED' },
      { id: KNOWN_ID, label: 'Nguyễn Thu Hà', kind: 'USER' },
    ]);
  });

  it('lich su: moi truong KHAC cua quyet dinh di nguyen ven', async () => {
    const original = decision(2, KNOWN_ID);
    const [shown] = (await readModel().detail(detailOf([original]))).decisions;
    const { decidedByActor: _label, ...rest } = shown ?? { decidedByActor: null };
    expect(rest).toEqual(original);
  });

  it('hang cho: nguoi quyet moi nhat co ten; don chua ai quyet thi khong co nhan', async () => {
    const rows = await readModel().queue([
      queueRow('da-quyet', KNOWN_ID),
      queueRow('chua-quyet', null),
      queueRow('du-lieu-mau', SEED_DATA_ACTOR_ID),
      queueRow('tai-khoan-da-khoa', DISABLED_ID),
    ]);

    expect(
      rows.map((row) => [row.latestDecidedBy, row.latestDecidedByActor?.label ?? null]),
    ).toEqual([
      [KNOWN_ID, 'Nguyễn Thu Hà'],
      [null, null],
      [SEED_DATA_ACTOR_ID, SEED_DATA_ACTOR_LABEL],
      [DISABLED_ID, 'Trần Minh'],
    ]);
  });

  it('KHONG mot nhan nao la mot ma tai khoan tho', async () => {
    const ids = [KNOWN_ID, DISABLED_ID, DELETED_ID, UNNAMED_ID, SEED_DATA_ACTOR_ID];
    const detail = await readModel().detail(
      detailOf(ids.map((id, index) => decision(index + 1, id))),
    );
    const queue = await readModel().queue(ids.map((id) => queueRow(`don-${id}`, id)));

    const labels = [
      ...detail.decisions.map((entry) => entry.decidedByActor.label),
      ...queue.map((row) => row.latestDecidedByActor?.label ?? ''),
    ];
    for (const label of labels) {
      for (const id of ids) expect(label).not.toContain(id);
    }
  });

  it('hang cho dai chi hoi nguon tai khoan MOT lan cho moi nguoi quyet', async () => {
    const users = new CountingUsers(USERS);
    await readModel(users).queue(
      Array.from({ length: 30 }, (_, index) => queueRow(`don-${index}`, KNOWN_ID)),
    );
    expect(users.asked).toEqual([KNOWN_ID]);
  });
});
