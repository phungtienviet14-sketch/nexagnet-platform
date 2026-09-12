import { describe, expect, it } from 'vitest';
import { TOLL_REVIEW_STATE_LABEL } from '../../customer-view';
import type {
  BusinessDate,
  TollAccount,
  TollAccountVehicleLink,
  TollCandidate,
  TollCandidatePage,
  TollImportPreview,
  TollProviderSurface,
} from '../../transport-types';
import {
  toTollAccountRows,
  toTollCandidateRow,
  toTollLinkRows,
  toTollPreviewModel,
  toTollProviderRows,
  toTollQueueModel,
  tollCapabilities,
} from '../toll';

/**
 * `#295` phan C — be mat van hanh ETC.
 *
 * Bo bai nay bao ve BON tinh chat, va ca bon deu la nhung thu mot man hinh de danh mat:
 *
 *   1. khong mot chu nao doc ra "da tra tien";
 *   2. mot dong chua giai duoc xe KHONG bi man hinh dien giup;
 *   3. "chua doc duoc bang ke cua nha cung cap nay" duoc noi nhu MOT KET QUA DA DO;
 *   4. nap lai dung mot tep KHONG tao them nghia vu — va man hinh phai noi ra.
 */
const DATE = '2026-09-01' as BusinessDate;

const account = (overrides: Partial<TollAccount> = {}): TollAccount => ({
  id: 'acc-1',
  provider: 'VETC',
  accountNo: '9704xxxx1234',
  holderName: 'Cong ty Van tai Mau',
  active: true,
  createdAt: '2026-09-01T01:00:00Z',
  updatedAt: '2026-09-01T01:00:00Z',
  ...overrides,
});

const link = (overrides: Partial<TollAccountVehicleLink> = {}): TollAccountVehicleLink => ({
  id: 'link-1',
  accountId: 'acc-1',
  vehicleId: 'veh-1',
  providerVehicleRef: null,
  effectiveFrom: DATE,
  effectiveTo: null,
  provenance: 'MANUAL',
  createdAt: '2026-09-01T02:00:00Z',
  createdBy: 'operator',
  ...overrides,
});

const candidate = (overrides: Partial<TollCandidate> = {}): TollCandidate => ({
  id: 'cand-1',
  importId: 'imp-1',
  provider: 'VETC',
  rowNumber: 1,
  parseStatus: 'ACCEPTED',
  rejectReason: null,
  accountNoRaw: '9704xxxx1234',
  accountId: 'acc-1',
  kind: 'TOLL_PASS',
  vehiclePlateRaw: '29H-123.45',
  vehicleId: 'veh-1',
  passedAt: '2026-09-07T03:00:00Z',
  businessDate: DATE,
  signedAmount: -120_000,
  currencyCode: 'VND',
  stationLabel: 'Tram Phap Van',
  providerRef: 'ref-1',
  fingerprint: 'fp-1',
  matchState: 'MATCHED',
  reviewState: 'PENDING',
  duplicateOfCandidateId: null,
  rawValues: {},
  createdAt: '2026-09-07T04:00:00Z',
  ...overrides,
});

const page = (items: readonly TollCandidate[], total = items.length): TollCandidatePage => ({
  items,
  total,
  limit: 20,
  offset: 0,
});

const preview = (overrides: Partial<TollImportPreview> = {}): TollImportPreview => ({
  provider: 'VETC',
  sourceKind: 'STATEMENT_FILE',
  sourceDigest: 'digest-1',
  rowCount: 3,
  acceptedCount: 2,
  rejectedCount: 1,
  rejectionsByReason: { TOLL_ROW_MISSING_AMOUNT: 1 },
  matchStateCounts: { MATCHED: 1, VEHICLE_UNRESOLVED: 1 },
  alreadyImportedId: null,
  sample: [],
  ...overrides,
});

/* ================================================================== *
 * 1. KHONG MOT CHU NAO DOC RA "DA TRA TIEN"
 * ================================================================== */

describe('doi soat KHAC da thanh toan', () => {
  it('ba nhan trang thai doi soat khong chua chu nao ve viec tien da di', () => {
    const forbidden = ['thanh toán', 'đã trả', 'đã chi', 'hạch toán', 'công nợ'];

    for (const label of Object.values(TOLL_REVIEW_STATE_LABEL)) {
      for (const word of forbidden) {
        expect(label.toLowerCase(), `nhan "${label}"`).not.toContain(word);
      }
    }
  });

  it('`CONFIRMED` doc la "da co nguoi xac nhan", khong phai "da thanh toan"', () => {
    const row = toTollCandidateRow(candidate({ reviewState: 'CONFIRMED' }));

    expect(row.reviewStateLabel).toBe('Đã có người xác nhận');
    expect(row.reviewStateTone).toBe('done');
  });

  it('`MATCHED` noi ve XE, khong noi ve tien', () => {
    expect(toTollCandidateRow(candidate()).matchStateLabel).toBe('Đã khớp xe');
  });
});

/* ================================================================== *
 * 2. MAN HINH KHONG CHON XE GIUP MAY CHU
 * ================================================================== */

describe('dong chua giai duoc xe o lai hang cho NGUOI', () => {
  it('`AMBIGUOUS` -> khong co xe nao duoc dien, va sac thai la `stop`', () => {
    const row = toTollCandidateRow(
      candidate({ matchState: 'AMBIGUOUS', vehicleId: null, vehiclePlateRaw: '29H-123.45' }),
    );

    // Bo trong la cau tra loi DUNG. Lay ung vien dau tien se gan mot chi phi vao mot chiec xe
    // khong ai xac nhan, roi no di tiep vao moi bao cao theo xe.
    expect(row.vehicleId).toBeNull();
    expect(row.matchStateLabel).toBe('Nhiều xe cùng khớp');
    expect(row.matchStateTone).toBe('stop');
    // Bien so THO van hien — do la bang chung tu tep, khong phai mot ket luan.
    expect(row.vehiclePlateRaw).toBe('29H-123.45');
  });

  it('`VEHICLE_UNRESOLVED` -> cung khong dien xe', () => {
    const row = toTollCandidateRow(
      candidate({ matchState: 'VEHICLE_UNRESOLVED', vehicleId: null }),
    );

    expect(row.vehicleId).toBeNull();
    expect(row.matchStateTone).toBe('wait');
  });

  it('nap tien / phi tai khoan KHONG gan vao mot chiec xe nao', () => {
    // Phan anh luat may chu (`TOLL_REVIEW_VEHICLE_NOT_APPLICABLE`): chi `TOLL_PASS` moi co xe.
    for (const kind of ['TOP_UP', 'ACCOUNT_FEE', 'ADJUSTMENT'] as const) {
      expect(toTollCandidateRow(candidate({ kind })).vehicleApplicable, kind).toBe(false);
    }
    expect(toTollCandidateRow(candidate({ kind: 'TOLL_PASS' })).vehicleApplicable).toBe(true);
  });

  it('dem "con cho nguoi" theo `reviewState`, KHONG theo `matchState`', () => {
    // Mot dong da khop xe VAN con cho nguoi xac nhan — chon duoc xe khong nghia la doi soat xong.
    const model = toTollQueueModel(
      page([
        candidate({ id: 'a', matchState: 'MATCHED', reviewState: 'PENDING' }),
        candidate({ id: 'b', matchState: 'MATCHED', reviewState: 'CONFIRMED' }),
        candidate({ id: 'c', matchState: 'AMBIGUOUS', vehicleId: null, reviewState: 'REOPENED' }),
      ]),
      'ADMIN',
    );

    expect(model.pendingCountLabel).toBe('2');
  });
});

/* ================================================================== *
 * 3. DO SAN SANG CUA NHA CUNG CAP — NOI THAT
 * ================================================================== */

describe('do san sang cua nha cung cap', () => {
  const surface: TollProviderSurface = {
    readiness: [
      {
        provider: 'VETC',
        statementReady: false,
        blockedReason: 'BLOCKED_SAMPLE_REQUIRED',
        apiStatus: 'NOT_PUBLICLY_PROVEN',
      },
      {
        provider: 'OTHER',
        statementReady: true,
        blockedReason: null,
        apiStatus: 'NOT_PUBLICLY_PROVEN',
      },
    ],
    api: [
      { provider: 'VETC', status: 'NOT_PUBLICLY_PROVEN', requestPath: 'NĐ 119/2024 Đ.26 kh.2' },
      { provider: 'OTHER', status: 'NOT_PUBLICLY_PROVEN', requestPath: 'NĐ 119/2024 Đ.26 kh.2' },
    ],
  };

  it('chua doc duoc bang ke -> noi RO ai phai lam gi, khong noi "sap co"', () => {
    const vetc = toTollProviderRows(surface)[0]!;

    expect(vetc.statementReady).toBe(false);
    expect(vetc.statementLabel).toBe('Cần một tệp mẫu của nhà cung cấp');
    expect(vetc.statementTone).toBe('wait');
  });

  it('khong co API -> `flat`, khong phai `stop`: do la su that da do, khong phai su co', () => {
    const vetc = toTollProviderRows(surface)[0]!;

    expect(vetc.apiStatusLabel).toBe('Chưa có tài liệu API công khai');
    expect(vetc.apiStatusTone).toBe('flat');
    // Duong doi hoi HOP PHAP phai hien ra — de nguoi van hanh biet loi ra, khong phai ngoi cho.
    expect(vetc.requestPathLabel).toBe('NĐ 119/2024 Đ.26 kh.2');
  });

  it('mot nha cung cap doc duoc bang ke van co the CHUA co API — hai truc doc lap', () => {
    const other = toTollProviderRows(surface)[1]!;

    expect(other.statementTone).toBe('go');
    expect(other.apiStatusTone).toBe('flat');
  });

  it('thieu ban chan doan cho mot nha cung cap thi MAC DINH la chua co API', () => {
    const rows = toTollProviderRows({ readiness: surface.readiness, api: [] });

    // Fail-closed: khong co thong tin thi khong duoc doc thanh "co API".
    expect(rows[0]?.apiStatusLabel).toBe('Chưa có tài liệu API công khai');
    expect(rows[0]?.requestPathLabel).toBeNull();
  });
});

/* ================================================================== *
 * 4. NAP LAI DUNG MOT TEP KHONG TAO THEM NGHIA VU
 * ================================================================== */

describe('ban doc thu cua mot lan nap tep', () => {
  it('tep chua tung nap -> khong co loi nhac nao', () => {
    const model = toTollPreviewModel(preview());

    expect(model.alreadyImportedId).toBeNull();
    expect(model.replayNotice).toBeNull();
  });

  it('dung bo byte da nap -> NOI RO rang khong nghia vu nao duoc tao them', () => {
    const model = toTollPreviewModel(preview({ alreadyImportedId: 'imp-cu' }));

    expect(model.alreadyImportedId).toBe('imp-cu');
    expect(model.replayNotice).toContain('không tạo thêm nghĩa vụ');
  });

  it('ly do bo dong duoc doi thanh chu, va sap TAT DINH', () => {
    const model = toTollPreviewModel(
      preview({
        rejectionsByReason: { TOLL_ROW_MISSING_DATE: 1, TOLL_ROW_MISSING_AMOUNT: 3 },
      }),
    );

    expect(model.rejections.map((row) => row.reasonLabel)).toEqual(['Thiếu số tiền', 'Thiếu ngày']);
    expect(model.rejections[0]?.countLabel).toBe('3');
  });

  it('mot ma chua co nhan tra lai CHINH MA — khong bia mot cau tieng Viet', () => {
    const model = toTollPreviewModel(
      preview({ rejectionsByReason: { TOLL_ROW_SOMETHING_NEW: 2 } }),
    );

    expect(model.rejections[0]?.reasonLabel).toBe('TOLL_ROW_SOMETHING_NEW');
  });

  it('noi ro ban doc thu la MOT PHAN cua tep, khong phai ca tep', () => {
    const model = toTollPreviewModel(
      preview({
        rowCount: 250,
        sample: [
          {
            rowNumber: 1,
            parseStatus: 'ACCEPTED',
            rejectReason: null,
            kind: 'TOLL_PASS',
            vehiclePlateRaw: '29H-123.45',
            businessDate: DATE,
            signedAmount: -120_000,
            stationLabel: 'Tram Phap Van',
            matchState: 'MATCHED',
          },
        ],
      }),
    );

    expect(model.sampleNotice).toContain('1');
    expect(model.sampleNotice).toContain('250');
    expect(model.sample[0]?.statusLabel).toBe('Đọc được');
  });
});

/* ================================================================== *
 * TAI KHOAN + SO DANG KY
 * ================================================================== */

describe('tai khoan va so dang ky xe nhan chi tra', () => {
  it('dem doan DANG hieu luc theo truong `effectiveTo`, khong so voi dong ho may', () => {
    const rows = toTollAccountRows(
      [account()],
      [
        link({ id: 'l1', effectiveTo: null }),
        link({ id: 'l2', effectiveTo: '2026-08-31' as BusinessDate }),
        link({ id: 'l3', accountId: 'acc-khac', effectiveTo: null }),
      ],
    );

    // Chi l1: l2 da het hieu luc, l3 thuoc tai khoan khac.
    expect(rows[0]?.effectiveLinkCountLabel).toBe('1');
  });

  it('doan dang hieu luc va doan da dong duoc phan biet bang sac thai', () => {
    const rows = toTollLinkRows(
      [link({ id: 'l1' }), link({ id: 'l2', effectiveTo: '2026-08-31' as BusinessDate })],
      () => 'VETC 1234',
      () => '29H-123.45',
    );

    expect(rows[0]?.effectiveNow).toBe(true);
    expect(rows[0]?.effectiveTone).toBe('go');
    expect(rows[1]?.effectiveNow).toBe(false);
    expect(rows[1]?.effectiveTone).toBe('flat');
  });

  it('nguon cua moi doan hien ra — nguoi khai KHAC doc tu tep', () => {
    const rows = toTollLinkRows(
      [
        link({ id: 'l1', provenance: 'MANUAL' }),
        link({ id: 'l2', provenance: 'STATEMENT_DECLARED' }),
      ],
      () => 'VETC 1234',
      () => '29H-123.45',
    );

    expect(rows[0]?.provenanceLabel).toBe('Người khai');
    expect(rows[1]?.provenanceLabel).toBe('Đọc từ tệp sao kê');
  });
});

/* ================================================================== *
 * QUYEN — NAM MA DA CO, KHONG MA MOI
 * ================================================================== */

describe('quyen cua man hinh ETC', () => {
  it('lai xe KHONG thay mot be mat ETC nao', () => {
    // `SALE` la vai cua lai xe: ho chi co cac ma pham vi chinh minh.
    const driver = tollCapabilities('SALE');

    expect(driver).toEqual({
      canReadAccounts: false,
      canManageAccounts: false,
      canImport: false,
      canReadReview: false,
      canResolveReview: false,
    });
  });

  it('ke toan doc VA doi soat duoc — ETC la chi phi cua cong ty, viec cua ke toan', () => {
    const accounting = tollCapabilities('ACCOUNTING');

    expect(accounting.canReadAccounts).toBe(true);
    expect(accounting.canReadReview).toBe(true);
    expect(accounting.canResolveReview).toBe(true);
  });

  it('quan tri co du nam quyen', () => {
    expect(tollCapabilities('ADMIN')).toEqual({
      canReadAccounts: true,
      canManageAccounts: true,
      canImport: true,
      canReadReview: true,
      canResolveReview: true,
    });
  });

  it('hang cho mang theo hai co quyen, de man hinh khong moi mot nut se bi tu choi', () => {
    const asDriver = toTollQueueModel(page([candidate()]), 'SALE');

    expect(asDriver.canRead).toBe(false);
    expect(asDriver.canResolve).toBe(false);
  });
});

describe('phan trang cua hang cho', () => {
  it('con trang sau -> `hasMore`', () => {
    const model = toTollQueueModel(page([candidate()], 40), 'ADMIN');

    expect(model.hasMore).toBe(true);
    expect(model.totalLabel).toBe('40');
    expect(model.shownLabel).toBe('1');
  });

  it('hang cho rong noi ro TAI SAO no rong', () => {
    const empty = toTollQueueModel(page([], 0), 'ADMIN');
    const filtered = toTollQueueModel(page([], 12), 'ADMIN');

    // Hai cau khac nhau: "chua nap tep nao" KHAC "bo loc dang chon khong khop gi".
    expect(empty.emptyNotice).toContain('Nạp một bảng kê');
    expect(filtered.emptyNotice).toContain('bộ lọc');
  });
});
