import { describe, expect, it } from 'vitest';
import type { TollDuplicatePeerListing } from '../../toll-report-types';
import type { TollCandidate, TollReviewDecision } from '../../transport-types';
import {
  clearDuplicateConsequence,
  flagDuplicateConsequence,
  toTollDecisionTimeline,
  toTollDuplicateReviewModel,
  tollQueueRowActions,
} from '../toll-duplicates';

/**
 * `#314` G8 — QUYET TRUNG tu giao dien, va nhung dieu giao dien khong duoc de lot.
 *
 * May chu nhan `FLAG_DUPLICATE` / `CLEAR_DUPLICATE` tu lau, nhung KHONG chan hai dieu: mot vong trung
 * (A trung B, B trung A — ca hai roi khoi moi tong) va mot `CONFIRM` mo ho tren dong nghi trung. Bo
 * bai nay giu hai lo do DONG o tang khung nhin, va giu cau hau qua noi DUNG dieu may chu se lam.
 */

const candidate = (over: Partial<TollCandidate> = {}): TollCandidate => ({
  id: 'cand-1',
  importId: 'imp-1',
  provider: 'VETC',
  rowNumber: 12,
  parseStatus: 'ACCEPTED',
  rejectReason: null,
  accountNoRaw: 'TK-001',
  accountId: 'acc-1',
  kind: 'TOLL_PASS',
  vehiclePlateRaw: '15C-556.33',
  vehicleId: 'veh-1',
  passedAt: '2026-08-31T16:40:00Z',
  businessDate: '2026-08-31',
  signedAmount: -52_000,
  currencyCode: 'VND',
  stationLabel: 'Tram Phap Van',
  providerRef: null,
  fingerprint: 'fp-1',
  matchState: 'DUPLICATE_CANDIDATE',
  reviewState: 'PENDING',
  duplicateOfCandidateId: null,
  rawValues: {},
  createdAt: '2026-09-02T02:00:00Z',
  ...over,
});

const listing = (
  peers: readonly { candidate: TollCandidate; importLabel: string | null }[],
  over: Partial<TollDuplicatePeerListing> = {},
): TollDuplicatePeerListing => ({
  candidateId: 'cand-1',
  fingerprintAvailable: true,
  peers,
  truncated: false,
  ...over,
});

describe('viec nao hien tren MOT dong cua hang cho', () => {
  it('dong da khop xe, chua ai nhin -> chi "Xac nhan"', () => {
    expect(tollQueueRowActions(candidate({ matchState: 'MATCHED' }))).toEqual(['CONFIRM']);
  });

  it('luot qua tram chua ro xe hoac nhieu xe cung khop -> chi dinh xe (nguoi chon) hoac xac nhan', () => {
    for (const matchState of ['VEHICLE_UNRESOLVED', 'AMBIGUOUS', 'ACCOUNT_UNRESOLVED'] as const) {
      expect(tollQueueRowActions(candidate({ matchState, vehicleId: null })), matchState).toEqual([
        'RESOLVE_VEHICLE',
        'CONFIRM',
      ]);
    }
  });

  it('nap tien khong gan xe -> KHONG co "chi dinh xe"', () => {
    expect(
      tollQueueRowActions(candidate({ kind: 'TOP_UP', vehicleId: null, matchState: 'MATCHED' })),
    ).toEqual(['CONFIRM']);
  });

  /**
   * `CONFIRM` tren dong nghi trung khong noi no LA hay KHONG LA trung; `RESOLVE_VEHICLE` tren dong
   * nghi trung thi lang le doi no thanh `MATCHED` ma khong ai noi "khong trung". Ca hai deu la cua
   * sau cua cau hoi trung — nen dong nghi trung CHI co mot cua: quyet trung.
   */
  it('dong NGHI TRUNG -> chi "quyet trung", KHONG xac nhan, KHONG chi dinh xe', () => {
    expect(tollQueueRowActions(candidate())).toEqual(['REVIEW_DUPLICATE']);
    expect(tollQueueRowActions(candidate({ vehicleId: null }))).toEqual(['REVIEW_DUPLICATE']);
    expect(tollQueueRowActions(candidate({ reviewState: 'REOPENED' }))).toEqual([
      'REVIEW_DUPLICATE',
    ]);
  });

  /**
   * `#318`: may chu tra dong VUA BO NGHI TRUNG o `PENDING`. Hang cho phai mo lai nut xac nhan cho mot
   * lan xac nhan RIENG — khong phai "Mo lai" nhu mot dong da co nguoi xac nhan.
   */
  it('dong vua bo nghi trung (PENDING) -> "Xac nhan" rieng; chua co xe thi chi dinh xe truoc hoac xac nhan', () => {
    expect(
      tollQueueRowActions(candidate({ matchState: 'MATCHED', reviewState: 'PENDING' })),
    ).toEqual(['CONFIRM']);
    expect(
      tollQueueRowActions(
        candidate({ matchState: 'VEHICLE_UNRESOLVED', vehicleId: null, reviewState: 'PENDING' }),
      ),
    ).toEqual(['RESOLVE_VEHICLE', 'CONFIRM']);
  });

  it('dong da co nguoi quyet -> mo lai; neu van chua co xe thi van chi dinh xe duoc', () => {
    expect(
      tollQueueRowActions(
        candidate({ reviewState: 'CONFIRMED', duplicateOfCandidateId: 'cand-0' }),
      ),
    ).toEqual(['REOPEN']);
    expect(
      tollQueueRowActions(
        candidate({ reviewState: 'CONFIRMED', matchState: 'VEHICLE_UNRESOLVED', vehicleId: null }),
      ),
    ).toEqual(['RESOLVE_VEHICLE', 'REOPEN']);
  });

  it('dong bi bo qua luc doc tep -> khong co viec nao (may chu tu choi)', () => {
    expect(tollQueueRowActions(candidate({ parseStatus: 'REJECTED', matchState: null }))).toEqual(
      [],
    );
  });
});

describe('bang quyet trung', () => {
  const origin = candidate({
    id: 'cand-0',
    rowNumber: 3,
    reviewState: 'CONFIRMED',
    matchState: 'MATCHED',
  });
  const declaredElsewhere = candidate({
    id: 'cand-7',
    rowNumber: 7,
    reviewState: 'CONFIRMED',
    duplicateOfCandidateId: 'cand-0',
  });

  it('chon DUNG MOT dong goc; dong da bi ghi trung KHONG lam dong goc duoc', () => {
    const model = toTollDuplicateReviewModel({
      candidate: candidate(),
      listing: listing([
        { candidate: origin, importLabel: 'VETC thang 8' },
        { candidate: declaredElsewhere, importLabel: 'VETC thang 8 bo sung' },
      ]),
      canResolve: true,
    });

    expect(model.canDecide).toBe(true);
    expect(model.lockedReason).toBeNull();
    expect(model.peers.map((peer) => [peer.rowNumber, peer.sourceLabel, peer.selectable])).toEqual([
      [3, 'VETC thang 8', true],
      [7, 'VETC thang 8 bo sung', false],
    ]);
    expect(model.peers[1]?.blockedReason).toContain('không làm dòng gốc được');
    expect(model.canFlag).toBe(true);
    expect(model.canClear).toBe(true);
    expect(model.peerNotice).toContain('2 dòng khác');
  });

  /** Vong trung: A da bi ghi "trung B"; neu B lai duoc ghi "trung A" thi ca hai roi khoi moi tong. */
  it('dong da bi ghi trung VOI CHINH dong dang xem -> khong chon duoc (chan vong trung)', () => {
    const model = toTollDuplicateReviewModel({
      candidate: candidate(),
      listing: listing([
        {
          candidate: candidate({
            id: 'cand-9',
            rowNumber: 9,
            duplicateOfCandidateId: 'cand-1',
            reviewState: 'CONFIRMED',
          }),
          importLabel: 'X',
        },
      ]),
      canResolve: true,
    });
    expect(model.peers[0]?.selectable).toBe(false);
    expect(model.peers[0]?.blockedReason).toContain('vòng trùng');
    expect(model.canFlag).toBe(false);
    expect(model.canClear).toBe(true);
  });

  it('khong con dong doi ung -> khong danh dau trung duoc, van bo nghi trung duoc', () => {
    const model = toTollDuplicateReviewModel({
      candidate: candidate(),
      listing: listing([]),
      canResolve: true,
    });
    expect(model.canFlag).toBe(false);
    expect(model.canClear).toBe(true);
    expect(model.peerNotice).toContain('Không còn dòng nào khác');
  });

  it('dong khong co dau van -> noi RO la khong de xuat duoc, KHONG noi la "khong trung"', () => {
    const model = toTollDuplicateReviewModel({
      candidate: candidate({ fingerprint: null }),
      listing: listing([], { fingerprintAvailable: false }),
      canResolve: true,
    });
    expect(model.peerNotice).toContain('không có nghĩa là không có dòng trùng');
    expect(model.canFlag).toBe(false);
  });

  it('chua doc duoc dong doi ung -> khong mo nut nao dua tren mot danh sach khong co', () => {
    const model = toTollDuplicateReviewModel({
      candidate: candidate(),
      listing: null,
      canResolve: true,
    });
    expect(model.canFlag).toBe(false);
    expect(model.peers).toEqual([]);
  });

  it('danh sach bi cat -> noi RO la con dong khac', () => {
    const model = toTollDuplicateReviewModel({
      candidate: candidate(),
      listing: listing([{ candidate: origin, importLabel: 'A' }], { truncated: true }),
      canResolve: true,
    });
    expect(model.truncatedNotice).not.toBeNull();
  });

  it('dong da duoc ghi la trung -> khoa, va chi ra duong: mo lai', () => {
    const model = toTollDuplicateReviewModel({
      candidate: candidate({ reviewState: 'CONFIRMED', duplicateOfCandidateId: 'cand-0' }),
      listing: listing([{ candidate: origin, importLabel: 'A' }]),
      canResolve: true,
    });
    expect(model.canDecide).toBe(false);
    expect(model.canFlag).toBe(false);
    expect(model.canClear).toBe(false);
    expect(model.lockedReason).toContain('Mở lại');
  });

  it('vai chi xem -> khong quyet duoc, va man hinh noi vi sao', () => {
    const model = toTollDuplicateReviewModel({
      candidate: candidate(),
      listing: listing([{ candidate: origin, importLabel: 'A' }]),
      canResolve: false,
    });
    expect(model.canDecide).toBe(false);
    expect(model.lockedReason).toContain('chỉ xem');
  });

  it('dong doi ung hien NGUON va SO TIEN, khong hien ma noi bo', () => {
    const model = toTollDuplicateReviewModel({
      candidate: candidate(),
      listing: listing([{ candidate: origin, importLabel: null }]),
      canResolve: true,
    });
    expect(model.peers[0]?.sourceLabel).toBe('—');
    expect(model.peers[0]?.amountLabel).toContain('52');
    expect(JSON.stringify(model.peers[0])).not.toContain('fp-1');
  });
});

describe('cau hau qua noi DUNG dieu may chu se lam', () => {
  it('danh dau trung: ca hai so dong, nguon, va "khong tinh" — khong co tien to "#"', () => {
    const sentence = flagDuplicateConsequence(candidate(), {
      rowNumber: 3,
      sourceLabel: 'VETC thang 8',
    });
    expect(sentence).toContain('Dòng 12');
    expect(sentence).toContain('dòng 3');
    expect(sentence).toContain('VETC thang 8');
    expect(sentence).toContain('không được tính');
    expect(sentence).not.toMatch(/#\d/);
  });

  /** Phan anh `planReview(CLEAR_DUPLICATE)`: co xe -> MATCHED; luot qua tram khong xe -> VEHICLE_UNRESOLVED. */
  it('bo nghi trung: co xe -> tinh cho xe; luot qua tram chua co xe -> cho chi dinh xe; nap tien -> cap tai khoan', () => {
    expect(clearDuplicateConsequence(candidate(), '15C-556.33')).toContain('của xe 15C-556.33');
    expect(clearDuplicateConsequence(candidate({ vehicleId: null }), null)).toContain(
      'Chưa nhận ra xe',
    );
    expect(
      clearDuplicateConsequence(candidate({ vehicleId: null, kind: 'TOP_UP' }), null),
    ).toContain('cấp tài khoản');
  });

  /** `#318`: may chu de dong `PENDING` sau khi bo nghi trung — cau hau qua khong duoc hua "xong". */
  it('bo nghi trung: ca ba nhanh deu noi CHUA xac nhan va con mot lan «Xác nhận» rieng', () => {
    const sentences = [
      clearDuplicateConsequence(candidate(), '15C-556.33'),
      clearDuplicateConsequence(candidate({ vehicleId: null }), null),
      clearDuplicateConsequence(candidate({ vehicleId: null, kind: 'TOP_UP' }), null),
    ];
    for (const sentence of sentences) {
      expect(sentence).toContain('chưa phải là xác nhận');
      expect(sentence).toContain('«Xác nhận» riêng');
    }
    expect(sentences[0]).toContain('«Chưa đối soát xong»');
  });
});

describe('lich su quyet dinh', () => {
  const decision = (over: Partial<TollReviewDecision> = {}): TollReviewDecision => ({
    id: 'dec-1',
    candidateId: 'cand-1',
    action: 'RESOLVE_VEHICLE',
    actor: 'ke-toan',
    at: '2026-09-03T02:00:00Z',
    reason: 'TOLL_REVIEW_VEHICLE_RESOLVED',
    note: null,
    previousVehicleId: null,
    nextVehicleId: 'veh-1',
    previousMatchState: 'VEHICLE_UNRESOLVED',
    nextMatchState: 'MATCHED',
    duplicateOfCandidateId: null,
    ...over,
  });

  it('theo THU TU THOI GIAN, voi ai / lam gi / doi xe nao / doi trang thai nao', () => {
    const entries = toTollDecisionTimeline(
      [
        decision({
          id: 'dec-2',
          action: 'CONFIRM',
          at: '2026-09-04T02:00:00Z',
          previousVehicleId: 'veh-1',
          previousMatchState: 'MATCHED',
          note: 'da doi chieu',
        }),
        decision(),
      ],
      { vehicleLabelOf: (id) => (id === 'veh-1' ? '15C-556.33' : id), rowLabelOf: () => null },
    );

    expect(entries.map((entry) => entry.id)).toEqual(['dec-1', 'dec-2']);
    expect(entries[0]?.actionLabel).toBe('Đã chỉ định xe');
    expect(entries[0]?.vehicleChange).toBe('— → 15C-556.33');
    expect(entries[0]?.matchChange).toBe('Chưa nhận ra xe → Đã khớp xe');
    expect(entries[1]?.vehicleChange).toBeNull();
    expect(entries[1]?.matchChange).toBeNull();
    expect(entries[1]?.note).toBe('da doi chieu');
  });

  it('dong goc cua mot lan danh dau trung doc ra bang SO DONG khi biet, "mot dong khac" khi khong', () => {
    const lookups = {
      vehicleLabelOf: (id: string) => id,
      rowLabelOf: (id: string) => (id === 'cand-0' ? 'dòng 3 (VETC thang 8)' : null),
    };
    const [known] = toTollDecisionTimeline(
      [decision({ action: 'FLAG_DUPLICATE', duplicateOfCandidateId: 'cand-0' })],
      lookups,
    );
    const [unknown] = toTollDecisionTimeline(
      [decision({ action: 'FLAG_DUPLICATE', duplicateOfCandidateId: 'cand-khac' })],
      lookups,
    );
    expect(known?.duplicateOfLabel).toBe('dòng 3 (VETC thang 8)');
    expect(unknown?.duplicateOfLabel).toBe('một dòng khác');
  });
});
