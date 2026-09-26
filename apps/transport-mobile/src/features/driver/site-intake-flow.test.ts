import { describe, expect, it } from 'vitest';
import { attemptFor } from '../../api/command-attempt';
import { ApiError, classifyHttpError, networkError, timeoutError } from '../../api/errors';
import {
  classifyIntakeFailure,
  classifyLoadFailure,
  confirmBody,
  destinationBody,
  destinationIdentity,
  doneModel,
  INITIAL_INTAKE_FLOW,
  intakeFlowReducer,
  knownDestinationRows,
  locationFromFix,
  OFFICE_FOLLOW_UP_TEXT,
  OFFLINE_TEXT,
  openIntakeCard,
  pickSummary,
  pickupLine,
  proposalPrimary,
  refusalAction,
  REPLAY_NOTE,
  SEARCH_BUSY_TEXT,
  SEARCH_DISABLED_TEXT,
  searchOutcome,
  searchQueryProblem,
  showAssignedNote,
  SITE_INTAKE_START,
  type IntakeEvent,
  type IntakeFlowState,
} from './site-intake-flow';
import type {
  DriverIntakeView,
  KnownPlace,
  PlaceSearchResponse,
  SiteCandidateView,
  SiteIntakeProposal,
  SiteIntakeResult,
} from './types';

const SITE: SiteCandidateView = {
  siteId: 's1',
  siteName: 'Kho số 2',
  address: 'KCN Đình Vũ',
  counterpartyName: 'Công ty A',
  distanceMetres: 40,
  confidence: 'INSIDE',
};

const proposal = (over: Partial<SiteIntakeProposal> = {}): SiteIntakeProposal => ({
  outcome: 'UNIQUE',
  locationUnusable: null,
  candidates: [SITE],
  truncated: false,
  locationTrust: 'DRIVER_REPORTED',
  openRuns: [],
  canCreate: true,
  ...over,
});

const RESULT: SiteIntakeResult = {
  intakeId: 'i1',
  runId: 'r1',
  runCode: 'RUN-1',
  legId: 'l1',
  siteId: 's1',
  siteName: 'Kho số 2',
  counterpartyName: 'Công ty A',
  locationTrust: 'DRIVER_REPORTED',
  distanceMetres: 40,
  destinationPending: true,
  businessDate: '2026-09-26',
  replayed: false,
};

const intakeView = (over: Partial<DriverIntakeView> = {}): DriverIntakeView => ({
  intakeId: 'i1',
  runId: 'r1',
  runCode: 'RUN-1',
  siteName: 'Kho số 2',
  counterpartyName: 'Công ty A',
  confirmedAt: '2026-09-26T01:00:00Z',
  destinationLabel: null,
  stage: 'NEEDS_DESTINATION',
  canChooseDestination: true,
  ...over,
});

const PLACES: KnownPlace[] = [
  {
    id: 'p1',
    kind: 'CUSTOMER',
    name: 'Kho Đình Vũ',
    detail: null,
    point: { latitude: 20.8, longitude: 106.7 },
    radiusMetres: 200,
  },
  {
    id: 'p2',
    kind: 'COUNTERPARTY_SITE',
    name: 'Nhà máy B',
    detail: 'Công ty Bình Minh',
    point: { latitude: 21, longitude: 105.8 },
    radiusMetres: 150,
  },
];

const run = (events: readonly IntakeEvent[], from: IntakeFlowState = INITIAL_INTAKE_FLOW) =>
  events.reduce(intakeFlowReducer, from);

const FORBIDDEN_FOR_DRIVER = /Tạo chuyến|đơn|vòng chạy|chặng|order|run\b|leg\b/i;

describe('buoc nhan chuyen — bo may trang thai', () => {
  it('khong mang luc doc: buoc OFFLINE; khong mang luc gui: GIU de nghi, chi bao loi', () => {
    expect(run([{ type: 'OFFLINE' }]).step).toBe('OFFLINE');
    const loaded = run([
      { type: 'PROPOSAL_LOADED', proposal: proposal(), location: {}, locationNote: null },
      { type: 'OFFLINE' },
    ]);
    expect(loaded.step).toBe('PROPOSAL');
    expect(loaded.failure).toEqual({ kind: 'OFFLINE', message: OFFLINE_TEXT });
    expect(OFFLINE_TEXT).toBe('Cần mạng để nhận chuyến tại địa điểm này');
  });

  it('de nghi -> nhan chuyen -> "Giao tới đâu?" mang dung noi vua lay hang', () => {
    const state = run([
      { type: 'PROPOSAL_LOADED', proposal: proposal(), location: {}, locationNote: null },
      { type: 'SENDING' },
      { type: 'CONFIRMED', result: RESULT },
    ]);
    expect(state.step).toBe('RECEIVED');
    expect(state.busy).toBe(false);
    expect(state.received).toEqual({
      intakeId: 'i1',
      siteName: 'Kho số 2',
      counterpartyName: 'Công ty A',
      replayed: false,
    });
    expect(pickupLine(state.received!)).toBe('Công ty A — Kho số 2');
  });

  it('CHOOSE khong chon san; chon duoc; KHOA lua chon khi lenh truoc con chua chac', () => {
    const choose = proposal({
      outcome: 'AMBIGUOUS',
      candidates: [SITE, { ...SITE, siteId: 's2' }],
    });
    const loaded = run([
      { type: 'PROPOSAL_LOADED', proposal: choose, location: {}, locationNote: null },
    ]);
    expect(loaded.chosenSiteId).toBeNull();
    expect(proposalPrimary(loaded, true)).toMatchObject({ siteId: null, enabled: false });

    const chosen = intakeFlowReducer(loaded, { type: 'CHOOSE_SITE', siteId: 's2' });
    expect(proposalPrimary(chosen, true)).toMatchObject({
      label: 'Nhận chuyến tại đây',
      siteId: 's2',
      enabled: true,
    });

    const uncertain = run(
      [
        { type: 'SENDING' },
        { type: 'FAILED', failure: classifyIntakeFailure(networkError(new Error('x')), 'CONFIRM') },
        { type: 'CHOOSE_SITE', siteId: 's1' },
      ],
      chosen,
    );
    expect(uncertain.chosenSiteId).toBe('s2');
    expect(proposalPrimary(uncertain, true)).toMatchObject({
      label: 'Thử lại',
      siteId: 's2',
      locked: true,
    });
  });

  it('nut nhan chuyen tat khi khong co quyen xac nhan / may chu noi khong tao duoc / dang gui', () => {
    const loaded = run([
      { type: 'PROPOSAL_LOADED', proposal: proposal(), location: {}, locationNote: null },
    ]);
    expect(proposalPrimary(loaded, true)?.enabled).toBe(true);
    expect(proposalPrimary(loaded, false)?.enabled).toBe(false);
    expect(proposalPrimary(intakeFlowReducer(loaded, { type: 'SENDING' }), true)?.enabled).toBe(
      false,
    );
    const noCreate = run([
      {
        type: 'PROPOSAL_LOADED',
        proposal: proposal({ canCreate: false }),
        location: {},
        locationNote: null,
      },
    ]);
    expect(proposalPrimary(noCreate, true)?.enabled).toBe(false);
  });

  it('ACTIVE_RUN / NO_MATCH khong co nut nhan chuyen', () => {
    const active = run([
      {
        type: 'PROPOSAL_LOADED',
        proposal: proposal({ openRuns: [{ runId: 'r', code: 'X', status: 'ACTIVE' }] }),
        location: {},
        locationNote: null,
      },
    ]);
    expect(active.screen?.mode).toBe('ACTIVE_RUN');
    expect(proposalPrimary(active, true)).toBeNull();
    const none = run([
      {
        type: 'PROPOSAL_LOADED',
        proposal: proposal({ outcome: 'NO_MATCH', candidates: [] }),
        location: {},
        locationNote: null,
      },
    ]);
    expect(proposalPrimary(none, true)).toBeNull();
  });

  it('chon diem giao -> xong; "Chưa biết" -> xong ma KHONG co lenh nao (intake null)', () => {
    const received = run([
      { type: 'PROPOSAL_LOADED', proposal: proposal(), location: {}, locationNote: null },
      { type: 'CONFIRMED', result: RESULT },
    ]);
    const row = knownDestinationRows(PLACES, '')[0]!;
    const saved = run(
      [
        { type: 'OPEN_PICKER' },
        { type: 'PICK', row },
        { type: 'SENDING' },
        {
          type: 'DESTINATION_SAVED',
          response: {
            intake: intakeView({ stage: 'CONFIRMED', destinationLabel: 'Kho Đình Vũ' }),
            replayed: false,
          },
        },
      ],
      received,
    );
    expect(saved.step).toBe('DONE');
    expect(doneModel(saved.done!)).toEqual({
      heading: 'Đã nhận chuyến',
      lines: ['Giao tới Kho Đình Vũ'],
      closed: false,
    });

    const unknown = intakeFlowReducer(received, { type: 'DESTINATION_UNKNOWN' });
    expect(unknown.step).toBe('DONE');
    expect(unknown.done).toEqual({ intake: null, officeFollowUp: true, replayed: false });
    expect(doneModel(unknown.done!).lines).toEqual([OFFICE_FOLLOW_UP_TEXT]);
  });

  it('dong picker quay ve "Giao tới đâu?" va bo lua chon', () => {
    const received = run([{ type: 'CONFIRMED', result: RESULT }]);
    const back = run(
      [
        { type: 'OPEN_PICKER' },
        { type: 'PICK', row: knownDestinationRows(PLACES, '')[1]! },
        { type: 'CLOSE_PICKER' },
      ],
      received,
    );
    expect(back.step).toBe('RECEIVED');
    expect(back.pick).toBeNull();
  });

  it('mo lai tu man Viec: con chon duoc -> thang buoc chon diem giao; da du -> xong', () => {
    expect(run([{ type: 'RESUMED', intake: intakeView() }]).step).toBe('PICK_DESTINATION');
    const done = run([
      {
        type: 'RESUMED',
        intake: intakeView({
          stage: 'CONFIRMED',
          canChooseDestination: false,
          destinationLabel: 'X',
        }),
      },
    ]);
    expect(done.step).toBe('DONE');
    expect(doneModel(done.done!).lines).toEqual(['Giao tới X']);
  });

  it('gui lai (replayed) noi ro khong co chuyen thu hai', () => {
    const state = run([
      { type: 'CONFIRMED', result: { ...RESULT, replayed: true } },
      { type: 'DESTINATION_UNKNOWN' },
    ]);
    expect(doneModel(state.done!).lines).toContain(REPLAY_NOTE);
  });
});

describe('khoa chong ghi trung — mot khoa cho mot lan thu', () => {
  it('mat phan hoi: bam lai dung CUNG khoa; doi noi dung thi khoa moi', () => {
    let minted = 0;
    const mint = () => `k${++minted}`;
    const first = attemptFor(null, 's1', mint);
    // Lan gui dau mat phan hoi -> giu nguyen attempt -> lan bam lai:
    const retry = attemptFor(first, 's1', mint);
    expect(retry.key).toBe(first.key);
    expect(minted).toBe(1);
    expect(attemptFor(first, 's2', mint).key).toBe('k2');
    expect(attemptFor(null, 's1', mint).key).toBe('k3');
  });

  it('than lenh mang DUNG khoa va vi tri da dong bang; khong bao gio gui (0,0)', () => {
    expect(confirmBody('s1', 'k1', { latitude: 21, longitude: 105, accuracyMetres: 8 })).toEqual({
      siteId: 's1',
      clientEventId: 'k1',
      latitude: 21,
      longitude: 105,
      accuracyMetres: 8,
    });
    expect(confirmBody('s1', 'k1', {})).toEqual({ siteId: 's1', clientEventId: 'k1' });
    const choice = { kind: 'KNOWN_PLACE' as const, placeId: 'p1' };
    expect(destinationBody('k9', choice)).toEqual({ clientEventId: 'k9', destination: choice });
    expect(destinationIdentity(choice)).toBe('known:p1');
  });
});

describe('loi — chua chac khac bi tu choi', () => {
  it('mat mang / het gio / 5xx / dang xu ly -> CHUA CHAC, cau duoc duyet', () => {
    for (const error of [
      networkError(new Error('offline')),
      timeoutError(20_000),
      classifyHttpError(502, { message: 'bad gateway' }),
      classifyHttpError(409, { reason: 'SITE_INTAKE_CREATE_IN_FLIGHT', message: 'x' }),
      new Error('la'),
    ]) {
      const failure = classifyIntakeFailure(error, 'CONFIRM');
      expect(failure.kind).toBe('UNCERTAIN');
      expect(failure.message).toBe(
        'Chưa chắc lệnh đã tới máy chủ — bấm thử lại, sẽ không tạo chuyến thứ hai',
      );
    }
    expect(classifyIntakeFailure(networkError(null), 'DESTINATION').message).toContain(
      'điểm giao sẽ không bị ghi hai lần',
    );
  });

  it('may chu tu choi: cau tieng Viet + duong di tiep dung ma', () => {
    const open = classifyIntakeFailure(
      classifyHttpError(409, { reason: 'SITE_INTAKE_OPEN_RUN_EXISTS', message: 'Ban dang co' }),
      'CONFIRM',
    );
    expect(open).toMatchObject({ kind: 'REFUSED', next: 'BACK_TO_WORK' });
    expect(open.message).toBe('Bạn đang có chuyến chưa xong — ghi nhận vào chuyến đó ở màn Việc.');
    expect(
      classifyIntakeFailure(
        classifyHttpError(400, { reason: 'SITE_INTAKE_SITE_NOT_A_CANDIDATE' }),
        'CONFIRM',
      ),
    ).toMatchObject({ kind: 'REFUSED', next: 'RETRY_PROPOSAL' });
    expect(
      classifyIntakeFailure(
        classifyHttpError(400, { reason: 'SITE_INTAKE_NO_ASSIGNED_VEHICLE' }),
        'CONFIRM',
      ).message,
    ).toBe('Bạn chưa được giao xe nào — báo điều độ để nhận xe trước.');
    const odd = classifyIntakeFailure(classifyHttpError(400, { reason: 'LA_MA' }), 'DESTINATION');
    expect(odd).toMatchObject({ kind: 'REFUSED', next: 'STAY' });
    expect(refusalAction('STAY')).toBeNull();
    expect(refusalAction('BACK_TO_WORK')?.label).toBe('Về màn Việc');
    expect(refusalAction('RETRY_PROPOSAL')?.label).toBe('Tìm lại địa điểm');
  });

  it('moi ma tu choi cua lai xe duoc dich, va khong lo chu noi bo', () => {
    const reasons = [
      'SITE_INTAKE_DRIVER_BINDING_MISSING',
      'SITE_INTAKE_NO_ASSIGNED_VEHICLE',
      'SITE_INTAKE_SITE_NOT_FOUND',
      'SITE_INTAKE_SITE_INACTIVE',
      'SITE_INTAKE_OPEN_RUN_EXISTS',
      'SITE_INTAKE_LOCATION_UNUSABLE',
      'SITE_INTAKE_SITE_NOT_A_CANDIDATE',
      'SITE_INTAKE_OBSERVATION_NOT_FOUND',
      'SITE_INTAKE_OBSERVATION_NOT_OWNED',
      'SITE_INTAKE_OBSERVATION_ALREADY_USED',
      'SITE_INTAKE_NOT_FOUND',
      'SITE_INTAKE_DESTINATION_NOT_FOUND',
      'SITE_INTAKE_DESTINATION_UNVERIFIED',
      'SITE_INTAKE_DESTINATION_SEARCH_UNAVAILABLE',
      'SITE_INTAKE_COMMERCIAL_CLOSED',
    ];
    for (const reason of reasons) {
      const failure = classifyIntakeFailure(
        new ApiError('DOMAIN', 'khong dau', 409, reason),
        'CONFIRM',
      );
      expect(failure.message).not.toMatch(/Máy chủ từ chối|khong dau/);
      expect(failure.message).not.toMatch(FORBIDDEN_FOR_DRIVER);
    }
  });

  it('doc de nghi hong: mat mang = cau "Cần mạng…"; loi khac noi ly do', () => {
    expect(classifyLoadFailure(networkError(null))).toEqual({
      offline: true,
      message: OFFLINE_TEXT,
    });
    expect(classifyLoadFailure(classifyHttpError(403, { message: 'Khong co quyen' }))).toEqual({
      offline: false,
      message: 'Khong co quyen',
    });
  });
});

describe('vi tri', () => {
  it('khong lay duoc vi tri van di tiep voi {} va noi that', () => {
    expect(locationFromFix({ kind: 'FAILED', message: 'Chưa cấp quyền vị trí' })).toEqual({
      location: {},
      note: 'Chưa lấy được vị trí: Chưa cấp quyền vị trí',
    });
    expect(
      locationFromFix({ kind: 'OK', fix: { latitude: 0, longitude: 0, accuracyMetres: 5 } })
        .location,
    ).toEqual({});
    expect(
      locationFromFix({ kind: 'OK', fix: { latitude: 21, longitude: 105, accuracyMetres: 9 } }),
    ).toEqual({ location: { latitude: 21, longitude: 105, accuracyMetres: 9 }, note: null });
  });
});

describe('chon diem giao', () => {
  it('loc KHONG DAU, dong phu roi ve loai dia diem, testID theo placeId, khong chon san', () => {
    const rows = knownDestinationRows(PLACES, 'dinh vu');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      label: 'Kho Đình Vũ',
      detail: 'Địa điểm khách hàng',
      choice: { kind: 'KNOWN_PLACE', placeId: 'p1' },
      testID: 'site-intake-destination-option-p1',
    });
    expect(knownDestinationRows(PLACES, 'binh minh')[0]?.label).toBe('Nhà máy B');
    expect(knownDestinationRows(PLACES, '')).toHaveLength(2);
    expect(pickSummary(rows[0]!)).toBe('Giao tới Kho Đình Vũ');
    expect(pickSummary(null)).toBeNull();
  });

  it('tim theo ten: tat / ban noi cau rieng; ket qua OK mang DUNG chuoi da gui, bo (0,0)', () => {
    const base: PlaceSearchResponse = {
      status: 'OK',
      reason: null,
      results: [],
      attribution: '© OpenStreetMap contributors',
      fromCache: false,
    };
    expect(searchOutcome({ ...base, status: 'DISABLED' }, 'kho').notice).toBe(SEARCH_DISABLED_TEXT);
    expect(SEARCH_DISABLED_TEXT).toBe(
      'Tìm theo tên đang tắt — chọn trong danh sách địa điểm đã biết',
    );
    expect(searchOutcome({ ...base, status: 'BUSY' }, 'kho').notice).toBe(SEARCH_BUSY_TEXT);
    const outcome = searchOutcome(
      {
        ...base,
        results: [
          { label: 'Null', address: null, point: { latitude: 0, longitude: 0 } },
          {
            label: 'Cảng Hải Phòng',
            address: 'Hải Phòng',
            point: { latitude: 20.86, longitude: 106.68 },
          },
        ],
      },
      '  cang hai phong ',
    );
    expect(outcome.rows).toHaveLength(1);
    expect(outcome.rows[0]?.choice).toEqual({
      kind: 'PLACE_SEARCH',
      query: 'cang hai phong',
      label: 'Cảng Hải Phòng',
      latitude: 20.86,
      longitude: 106.68,
    });
    expect(outcome.attribution).toBe('© OpenStreetMap contributors');
    expect(searchOutcome(base, 'xyz').notice).not.toBeNull();
    expect(searchQueryProblem('a')).not.toBeNull();
    expect(searchQueryProblem(' ab ')).toBeNull();
  });
});

describe('xong + man Viec', () => {
  it('cau xong KHONG co chu noi bo; van phong bo sung noi ro; da dung thi noi da dung', () => {
    const models = [
      doneModel({
        intake: intakeView({ stage: 'CONFIRMED', destinationLabel: 'A' }),
        officeFollowUp: false,
        replayed: true,
      }),
      doneModel({
        intake: intakeView({ stage: 'OFFICE_FOLLOW_UP', destinationLabel: 'A' }),
        officeFollowUp: false,
        replayed: false,
      }),
      doneModel({ intake: null, officeFollowUp: true, replayed: false }),
    ];
    expect(models[1]?.lines).toEqual(['Giao tới A', OFFICE_FOLLOW_UP_TEXT]);
    for (const model of models) {
      expect(`${model.heading} ${model.lines.join(' ')}`).not.toMatch(FORBIDDEN_FOR_DRIVER);
    }
    expect(
      doneModel({
        intake: intakeView({ stage: 'CLOSED' }),
        officeFollowUp: false,
        replayed: false,
      }),
    ).toMatchObject({ heading: 'Chuyến này đã dừng', closed: true });
  });

  it('the "Chưa có điểm giao": co nut khi duoc chon; OFFICE_FOLLOW_UP chi co dong chu', () => {
    expect(openIntakeCard(intakeView(), true)).toEqual({
      title: 'Chưa có điểm giao',
      detail: 'Đã nhận hàng tại Công ty A — Kho số 2',
      chooseLabel: 'Chọn điểm giao',
      caption: null,
    });
    expect(openIntakeCard(intakeView(), false)).toMatchObject({
      chooseLabel: null,
      caption: OFFICE_FOLLOW_UP_TEXT,
    });
    expect(openIntakeCard(intakeView({ stage: 'OFFICE_FOLLOW_UP' }), true)).toMatchObject({
      chooseLabel: null,
      caption: OFFICE_FOLLOW_UP_TEXT,
    });
    expect(openIntakeCard(intakeView({ stage: 'CONFIRMED' }), true)).toBeNull();
    expect(openIntakeCard(null, true)).toBeNull();
    expect(SITE_INTAKE_START).toEqual({
      title: 'Bạn được gọi đi lấy hàng?',
      button: 'Nhận chuyến tại địa điểm hiện tại',
    });
  });

  it('"Văn phòng đã giao việc này" KHONG hien tren chuyen lai xe tu nhan', () => {
    expect(showAssignedNote(true, intakeView({ runId: 'r1' }), 'r1')).toBe(false);
    expect(showAssignedNote(true, intakeView({ runId: 'r1' }), 'r2')).toBe(true);
    expect(showAssignedNote(true, null, 'r2')).toBe(true);
    expect(showAssignedNote(false, null, 'r2')).toBe(false);
  });

  it('pickupLine khong in null', () => {
    expect(pickupLine({ counterpartyName: null, siteName: 'Kho' })).toBe('Kho');
    expect(pickupLine({ counterpartyName: null, siteName: null })).toBe('Địa điểm vừa nhận chuyến');
  });
});
