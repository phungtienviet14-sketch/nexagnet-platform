import { ApiError } from '../../api/errors';
import { reasonText } from '../../i18n/reasons';
import { normalizeSearch } from '../office/form-input';
import {
  ACTIVE_RUN_BACK_LABEL,
  intakeTarget,
  siteLocationInput,
  SITE_INTAKE_CONFIRM_LABEL,
  toSiteIntakeScreen,
  type SiteIntakeScreen,
} from './site-intake';
import type {
  DestinationChoice,
  DriverDestinationResponse,
  DriverIntakeView,
  KnownPlace,
  KnownPlaceKind,
  PlaceSearchResponse,
  SiteIntakeLocationInput,
  SiteIntakeProposal,
  SiteIntakeResult,
} from './types';

/**
 * NHAN CHUYEN TAI DIA DIEM — BUOC CUA MAN TOAN MAN HINH (`#398`), HAM THUAN.
 *
 * `site-intake.ts` quyet dinh lai xe THAY GI tu mot de nghi; tep nay noi cac buoc lai voi nhau:
 * doc mang + vi tri -> de nghi -> nhan chuyen -> "Giao tới đâu?" -> chon diem giao -> xong. Man hinh
 * chi `dispatch` su kien va ve lai; moi quyet dinh (nut nao, chu nao, loi nao lam gi) nam o day.
 *
 * ============================================================================================
 * TRUC TUYEN, KHONG QUA HANG DOI
 * ============================================================================================
 *
 * Nhan chuyen tao ra mot chuyen THAT tren may chu. Mot "da nhan" nam tren may trong khi may chu chua
 * biet la mot chuyen ma — nen buoc nay KHONG vao hang doi ngoai tuyen, khong co trang thai gia tren
 * may. Khong mang thi noi thang "Cần mạng…" va dung lai.
 *
 * ============================================================================================
 * CHUA CHAC != BI TU CHOI
 * ============================================================================================
 *
 * Mat song giua luc gui va luc nhan (`UNCERTAIN`) la "chua biet may chu da ghi chua": giu NGUYEN khoa
 * (`clientEventId`) va lua chon, bam lai la phat lai DUNG lenh cu — may chu tra lai ket qua cu, khong
 * co chuyen thu hai. May chu TU CHOI (`REFUSED`) thi da phan quyet: noi ly do va chi duong di tiep.
 */

export type IntakeStep =
  'LOCATING' | 'OFFLINE' | 'LOAD_FAILED' | 'PROPOSAL' | 'RECEIVED' | 'PICK_DESTINATION' | 'DONE';

/** Viec lai xe lam tiep sau mot lan bi tu choi — moi ma mot duong, khong "thu lai" mu. */
export type RefusalNext = 'STAY' | 'RETRY_PROPOSAL' | 'BACK_TO_WORK';

export type IntakeFailure =
  | { readonly kind: 'OFFLINE'; readonly message: string }
  | { readonly kind: 'UNCERTAIN'; readonly message: string; readonly detail: string | null }
  | {
      readonly kind: 'REFUSED';
      readonly reason: string | null;
      readonly message: string;
      readonly next: RefusalNext;
    };

export interface ReceivedPickup {
  readonly intakeId: string;
  readonly siteName: string | null;
  readonly counterpartyName: string | null;
  readonly replayed: boolean;
}

/** Mot hang chon duoc cua buoc diem giao. `choice` la DUNG than gui may chu. */
export interface DestinationRow {
  readonly key: string;
  readonly label: string;
  readonly detail: string | null;
  readonly choice: DestinationChoice;
  readonly testID: string;
}

export interface IntakeDone {
  /** `null` khi lai xe chon "Chưa biết" — khong co lenh nao di may chu. */
  readonly intake: DriverIntakeView | null;
  readonly officeFollowUp: boolean;
  readonly replayed: boolean;
}

export interface IntakeFlowState {
  readonly step: IntakeStep;
  readonly screen: SiteIntakeScreen | null;
  readonly location: SiteIntakeLocationInput;
  readonly locationNote: string | null;
  readonly chosenSiteId: string | null;
  readonly received: ReceivedPickup | null;
  readonly pick: DestinationRow | null;
  readonly done: IntakeDone | null;
  readonly failure: IntakeFailure | null;
  readonly loadFailure: string | null;
  readonly busy: boolean;
}

export const INITIAL_INTAKE_FLOW: IntakeFlowState = {
  step: 'LOCATING',
  screen: null,
  location: {},
  locationNote: null,
  chosenSiteId: null,
  received: null,
  pick: null,
  done: null,
  failure: null,
  loadFailure: null,
  busy: false,
};

export type IntakeEvent =
  | { readonly type: 'LOCATE' }
  | { readonly type: 'OFFLINE' }
  | {
      readonly type: 'PROPOSAL_LOADED';
      readonly proposal: SiteIntakeProposal;
      readonly location: SiteIntakeLocationInput;
      readonly locationNote: string | null;
    }
  | { readonly type: 'LOAD_FAILED'; readonly message: string }
  | { readonly type: 'CHOOSE_SITE'; readonly siteId: string }
  | { readonly type: 'SENDING' }
  | { readonly type: 'CONFIRMED'; readonly result: SiteIntakeResult }
  | { readonly type: 'RESUMED'; readonly intake: DriverIntakeView }
  | { readonly type: 'FAILED'; readonly failure: IntakeFailure }
  | { readonly type: 'OPEN_PICKER' }
  | { readonly type: 'CLOSE_PICKER' }
  | { readonly type: 'PICK'; readonly row: DestinationRow | null }
  | { readonly type: 'DESTINATION_SAVED'; readonly response: DriverDestinationResponse }
  | { readonly type: 'DESTINATION_UNKNOWN' };

export const OFFLINE_TEXT = 'Cần mạng để nhận chuyến tại địa điểm này';
export const OFFLINE_DETAIL =
  'Nhận chuyến phải tới được máy chủ ngay lúc bấm — không lưu trên máy để gửi sau. Có sóng thì bấm Thử lại.';

/** Dang cho mot lenh CHUA CHAC: khong doi lua chon, de lan bam lai phat lai dung lenh cu. */
const isLocked = (state: IntakeFlowState): boolean => state.failure?.kind === 'UNCERTAIN';

export function intakeFlowReducer(state: IntakeFlowState, event: IntakeEvent): IntakeFlowState {
  switch (event.type) {
    case 'LOCATE':
      return INITIAL_INTAKE_FLOW;
    case 'OFFLINE':
      return state.step === 'LOCATING'
        ? { ...state, step: 'OFFLINE', busy: false }
        : { ...state, busy: false, failure: { kind: 'OFFLINE', message: OFFLINE_TEXT } };
    case 'PROPOSAL_LOADED':
      return {
        ...INITIAL_INTAKE_FLOW,
        step: 'PROPOSAL',
        screen: toSiteIntakeScreen(event.proposal),
        location: event.location,
        locationNote: event.locationNote,
      };
    case 'LOAD_FAILED':
      return { ...state, step: 'LOAD_FAILED', loadFailure: event.message, busy: false };
    case 'CHOOSE_SITE':
      if (state.step !== 'PROPOSAL' || state.screen?.mode !== 'CHOOSE' || isLocked(state)) {
        return state;
      }
      return { ...state, chosenSiteId: event.siteId, failure: null };
    case 'SENDING':
      return { ...state, busy: true, failure: null };
    case 'CONFIRMED':
      return {
        ...state,
        step: 'RECEIVED',
        busy: false,
        failure: null,
        received: {
          intakeId: event.result.intakeId,
          siteName: event.result.siteName,
          counterpartyName: event.result.counterpartyName,
          replayed: event.result.replayed,
        },
      };
    case 'RESUMED': {
      const received: ReceivedPickup = {
        intakeId: event.intake.intakeId,
        siteName: event.intake.siteName,
        counterpartyName: event.intake.counterpartyName,
        replayed: false,
      };
      return event.intake.canChooseDestination
        ? { ...INITIAL_INTAKE_FLOW, step: 'PICK_DESTINATION', received }
        : {
            ...INITIAL_INTAKE_FLOW,
            step: 'DONE',
            received,
            done: {
              intake: event.intake,
              officeFollowUp: event.intake.stage === 'OFFICE_FOLLOW_UP',
              replayed: false,
            },
          };
    }
    case 'FAILED':
      return { ...state, busy: false, failure: event.failure };
    case 'OPEN_PICKER':
      return state.received ? { ...state, step: 'PICK_DESTINATION', failure: null } : state;
    case 'CLOSE_PICKER':
      return state.received
        ? { ...state, step: 'RECEIVED', pick: null, failure: null, busy: false }
        : state;
    case 'PICK':
      return isLocked(state) ? state : { ...state, pick: event.row, failure: null };
    case 'DESTINATION_SAVED':
      return {
        ...state,
        step: 'DONE',
        busy: false,
        failure: null,
        done: {
          intake: event.response.intake,
          officeFollowUp: false,
          replayed: event.response.replayed || (state.received?.replayed ?? false),
        },
      };
    case 'DESTINATION_UNKNOWN':
      return state.received
        ? {
            ...state,
            step: 'DONE',
            busy: false,
            failure: null,
            done: { intake: null, officeFollowUp: true, replayed: state.received.replayed },
          }
        : state;
  }
}

/* ------------------------------------------------------------------ *
 * VI TRI
 * ------------------------------------------------------------------ */

/** Hinh dang `captureFixWithin` tra ve — chep KIEU o day de tep nay khong keo `expo-location`. */
export type IntakeFixOutcome =
  | {
      readonly kind: 'OK';
      readonly fix: {
        readonly latitude: number;
        readonly longitude: number;
        readonly accuracyMetres: number | null;
      };
    }
  | { readonly kind: 'FAILED' | 'TIMEOUT'; readonly message: string };

/**
 * Khong co vi tri van DI TIEP voi `{}` — may chu tra `NO_MATCH` va man noi that vi sao. Toa do hong
 * (Null Island, NaN) cung la "khong co vi tri", khong bao gio la mot diem gui di.
 */
export function locationFromFix(outcome: IntakeFixOutcome): {
  readonly location: SiteIntakeLocationInput;
  readonly note: string | null;
} {
  if (outcome.kind !== 'OK') {
    return { location: {}, note: `Chưa lấy được vị trí: ${outcome.message}` };
  }
  const location = siteLocationInput(outcome.fix);
  return location.latitude === undefined
    ? { location, note: 'Máy báo một vị trí không dùng được — chưa gửi vị trí nào.' }
    : { location, note: null };
}

/* ------------------------------------------------------------------ *
 * LOI
 * ------------------------------------------------------------------ */

export type IntakeCommand = 'CONFIRM' | 'DESTINATION';

const UNCERTAIN_TEXT: Readonly<Record<IntakeCommand, string>> = {
  CONFIRM: 'Chưa chắc lệnh đã tới máy chủ — bấm thử lại, sẽ không tạo chuyến thứ hai',
  DESTINATION: 'Chưa chắc lệnh đã tới máy chủ — bấm thử lại, điểm giao sẽ không bị ghi hai lần',
};

/** Ma nghia "lenh CUNG khoa dang chay" — gui lai dung khoa cu, khong phai tu choi. */
const RETRY_SAME_KEY = new Set(['SITE_INTAKE_CREATE_IN_FLIGHT']);

const NEXT_BY_REASON: Readonly<Record<string, RefusalNext>> = {
  SITE_INTAKE_OPEN_RUN_EXISTS: 'BACK_TO_WORK',
  SITE_INTAKE_NO_ASSIGNED_VEHICLE: 'BACK_TO_WORK',
  SITE_INTAKE_DRIVER_BINDING_MISSING: 'BACK_TO_WORK',
  SITE_INTAKE_NOT_FOUND: 'BACK_TO_WORK',
  SITE_INTAKE_COMMERCIAL_CLOSED: 'BACK_TO_WORK',
  SITE_INTAKE_LOCATION_UNUSABLE: 'RETRY_PROPOSAL',
  SITE_INTAKE_SITE_NOT_A_CANDIDATE: 'RETRY_PROPOSAL',
  SITE_INTAKE_SITE_NOT_FOUND: 'RETRY_PROPOSAL',
  SITE_INTAKE_SITE_INACTIVE: 'RETRY_PROPOSAL',
  SITE_INTAKE_OBSERVATION_NOT_FOUND: 'RETRY_PROPOSAL',
  SITE_INTAKE_OBSERVATION_NOT_OWNED: 'RETRY_PROPOSAL',
  SITE_INTAKE_OBSERVATION_ALREADY_USED: 'RETRY_PROPOSAL',
};

export function classifyIntakeFailure(error: unknown, command: IntakeCommand): IntakeFailure {
  if (!(error instanceof ApiError)) {
    const detail = error instanceof Error && error.message ? error.message : null;
    return { kind: 'UNCERTAIN', message: UNCERTAIN_TEXT[command], detail };
  }
  if (error.isRetryable) {
    return { kind: 'UNCERTAIN', message: UNCERTAIN_TEXT[command], detail: error.message };
  }
  if (error.reason !== null && RETRY_SAME_KEY.has(error.reason)) {
    return {
      kind: 'UNCERTAIN',
      message: UNCERTAIN_TEXT[command],
      detail: reasonText(error.reason),
    };
  }
  const reason = error.kind === 'NOT_MOUNTED' ? 'NOT_MOUNTED' : error.reason;
  return {
    kind: 'REFUSED',
    reason,
    message: reasonText(reason, error.message),
    next: (reason !== null ? NEXT_BY_REASON[reason] : undefined) ?? 'STAY',
  };
}

/** Doc de nghi / doc lai viec hong. Mat mang (`NETWORK`) = khong mang, noi cung mot cau. */
export function classifyLoadFailure(error: unknown): {
  readonly offline: boolean;
  readonly message: string;
} {
  if (error instanceof ApiError) {
    if (error.kind === 'NETWORK') return { offline: true, message: OFFLINE_TEXT };
    const reason = error.kind === 'NOT_MOUNTED' ? 'NOT_MOUNTED' : error.reason;
    return { offline: false, message: reasonText(reason, error.message) };
  }
  return {
    offline: false,
    message: error instanceof Error && error.message ? error.message : 'Có lỗi không xác định.',
  };
}

/** Nut di tiep cua mot lan bi tu choi. `null` = o lai buoc nay (chon khac roi bam lai). */
export function refusalAction(
  next: RefusalNext,
): { readonly label: string; readonly next: RefusalNext } | null {
  if (next === 'RETRY_PROPOSAL') return { label: 'Tìm lại địa điểm', next };
  if (next === 'BACK_TO_WORK') return { label: ACTIVE_RUN_BACK_LABEL, next };
  return null;
}

/* ------------------------------------------------------------------ *
 * BUOC DE NGHI
 * ------------------------------------------------------------------ */

export interface ProposalPrimary {
  readonly label: string;
  /** Kho SE nhan chuyen — `null` thi nut tat. */
  readonly siteId: string | null;
  readonly enabled: boolean;
  /** Lua chon bi khoa vi dang cho mot lenh chua chac. */
  readonly locked: boolean;
}

/**
 * Nut "Nhận chuyến tại đây" cua CONFIRM/CHOOSE. Tat khi: chua chon kho (CHOOSE khong chon san), may
 * chu noi khong tao duoc (`canCreate`), tai khoan khong co quyen xac nhan, hoac dang gui.
 */
export function proposalPrimary(
  state: IntakeFlowState,
  canConfirm: boolean,
): ProposalPrimary | null {
  const screen = state.screen;
  if (!screen || (screen.mode !== 'CONFIRM' && screen.mode !== 'CHOOSE')) return null;
  const locked = isLocked(state);
  const siteId = intakeTarget(screen, state.chosenSiteId);
  return {
    label: locked ? 'Thử lại' : SITE_INTAKE_CONFIRM_LABEL,
    siteId,
    enabled: siteId !== null && screen.canCreate && canConfirm && !state.busy,
    locked,
  };
}

/** Than `POST confirmations` — `clientEventId` la khoa CUA LAN THU, vi tri DA dong bang luc de nghi. */
export function confirmBody(
  siteId: string,
  clientEventId: string,
  location: SiteIntakeLocationInput,
): Readonly<Record<string, unknown>> {
  return { siteId, clientEventId, ...location };
}

/* ------------------------------------------------------------------ *
 * "GIAO TOI DAU?"
 * ------------------------------------------------------------------ */

/** "<Cong ty> — <Kho>"; thieu mot ben thi dung ben con lai, khong in "null". */
export function pickupLine(place: {
  readonly counterpartyName: string | null;
  readonly siteName: string | null;
}): string {
  const parts = [place.counterpartyName, place.siteName].filter(
    (part): part is string => typeof part === 'string' && part.trim() !== '',
  );
  return parts.length === 0 ? 'Địa điểm vừa nhận chuyến' : parts.join(' — ');
}

export const REPLAY_NOTE =
  'Lần bấm này gửi lại đúng lệnh cũ — không có chuyến thứ hai nào được tạo.';

export const RECEIVED_COPY = {
  title: 'Đã nhận hàng tại:',
  heading: 'Giao tới đâu?',
  choose: 'Chọn điểm giao',
  unknown: 'Chưa biết — để văn phòng bổ sung',
} as const;

const KIND_DETAIL: Readonly<Record<KnownPlaceKind, string>> = {
  DEPOT: 'Kho, bãi của công ty',
  COUNTERPARTY_SITE: 'Địa điểm của đối tác',
  CUSTOMER: 'Địa điểm khách hàng',
};

/** Dia diem DA BIET, loc khong dau theo ten + dong phu. Giu thu tu may chu, KHONG chon san. */
export function knownDestinationRows(
  places: readonly KnownPlace[],
  filter: string,
): readonly DestinationRow[] {
  const needle = normalizeSearch(filter);
  return places
    .filter(
      (place) =>
        needle === '' || normalizeSearch(`${place.name} ${place.detail ?? ''}`).includes(needle),
    )
    .map((place) => ({
      key: `known:${place.id}`,
      label: place.name,
      detail: place.detail ?? KIND_DETAIL[place.kind] ?? null,
      choice: { kind: 'KNOWN_PLACE', placeId: place.id },
      testID: `site-intake-destination-option-${place.id}`,
    }));
}

/** Tran duoi cua may chu (`placeSearchSchema`) — go it hon thi khong goi. */
export const SEARCH_MIN_CHARS = 2;
export const SEARCH_MAX_CHARS = 200;

export function searchQueryProblem(query: string): string | null {
  const length = [...query.trim()].length;
  if (length < SEARCH_MIN_CHARS) return `Gõ ít nhất ${SEARCH_MIN_CHARS} ký tự để tìm theo tên.`;
  if (length > SEARCH_MAX_CHARS) return `Tên tìm tối đa ${SEARCH_MAX_CHARS} ký tự.`;
  return null;
}

export const SEARCH_DISABLED_TEXT = 'Tìm theo tên đang tắt — chọn trong danh sách địa điểm đã biết';
export const SEARCH_BUSY_TEXT =
  'Tìm theo tên đang bận — thử lại sau, hoặc chọn trong danh sách địa điểm đã biết';

export interface SearchOutcome {
  readonly rows: readonly DestinationRow[];
  readonly notice: string | null;
  readonly attribution: string | null;
}

const usablePoint = (latitude: number, longitude: number): boolean =>
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  Math.abs(latitude) <= 90 &&
  Math.abs(longitude) <= 180 &&
  !(Math.abs(latitude) < 1e-9 && Math.abs(longitude) < 1e-9);

/**
 * Ket qua tim theo ten. `query` phai la DUNG chuoi da gui: may chu TIM LAI bang chuoi do va chi nhan
 * ket qua trung nhan + toa do. Toa do hong / (0,0) bi bo — khong bao gio gui di.
 */
export function searchOutcome(response: PlaceSearchResponse, query: string): SearchOutcome {
  if (response.status === 'DISABLED') {
    return { rows: [], notice: SEARCH_DISABLED_TEXT, attribution: null };
  }
  if (response.status !== 'OK') return { rows: [], notice: SEARCH_BUSY_TEXT, attribution: null };
  const sent = query.trim();
  const rows = response.results
    .filter((candidate) => usablePoint(candidate.point.latitude, candidate.point.longitude))
    .map((candidate, index): DestinationRow => ({
      key: `search:${index}`,
      label: candidate.label,
      detail: candidate.address,
      choice: {
        kind: 'PLACE_SEARCH',
        query: sent,
        label: candidate.label,
        latitude: candidate.point.latitude,
        longitude: candidate.point.longitude,
      },
      testID: `site-intake-destination-search-${index}`,
    }));
  return {
    rows,
    notice:
      rows.length === 0
        ? 'Không tìm thấy nơi nào khớp — thử tên khác hoặc chọn trong danh sách.'
        : null,
    attribution: response.attribution,
  };
}

/** Danh tinh cua mot lua chon — doi lua chon thi doi khoa chong ghi trung. */
export function destinationIdentity(choice: DestinationChoice): string {
  return choice.kind === 'KNOWN_PLACE'
    ? `known:${choice.placeId}`
    : `search:${choice.query}|${choice.label}|${choice.latitude},${choice.longitude}`;
}

export function destinationBody(
  clientEventId: string,
  choice: DestinationChoice,
): Readonly<Record<string, unknown>> {
  return { clientEventId, destination: choice };
}

export function pickSummary(row: DestinationRow | null): string | null {
  return row === null ? null : `Giao tới ${row.label}`;
}

/* ------------------------------------------------------------------ *
 * XONG
 * ------------------------------------------------------------------ */

export const OFFICE_FOLLOW_UP_TEXT = 'Văn phòng sẽ bổ sung phần còn thiếu';

export interface DoneModel {
  readonly heading: string;
  readonly lines: readonly string[];
  readonly closed: boolean;
}

/**
 * "Đã nhận chuyến" + DUNG nhung gi may chu noi: co diem giao thi noi diem giao, con thieu thi noi van
 * phong bo sung, gui lai thi noi khong co chuyen thu hai. Khong mot chu "đơn" nao — viec tiep theo
 * la nut may chu tinh o man Viec, khong bia o day.
 */
export function doneModel(done: IntakeDone): DoneModel {
  const stage = done.intake?.stage ?? null;
  if (stage === 'CLOSED') {
    return {
      heading: 'Chuyến này đã dừng',
      lines: ['Văn phòng đã dừng việc này — xem lại ở màn Việc.'],
      closed: true,
    };
  }
  const lines: string[] = [];
  const label = done.intake?.destinationLabel ?? null;
  if (label !== null && stage !== 'NEEDS_DESTINATION') lines.push(`Giao tới ${label}`);
  if (done.officeFollowUp || stage === 'OFFICE_FOLLOW_UP' || stage === 'NEEDS_DESTINATION') {
    lines.push(OFFICE_FOLLOW_UP_TEXT);
  }
  if (done.replayed) lines.push(REPLAY_NOTE);
  return { heading: 'Đã nhận chuyến', lines, closed: false };
}

/* ------------------------------------------------------------------ *
 * MAN VIEC
 * ------------------------------------------------------------------ */

export const SITE_INTAKE_START = {
  title: 'Bạn được gọi đi lấy hàng?',
  button: 'Nhận chuyến tại địa điểm hiện tại',
} as const;

export interface OpenIntakeCard {
  readonly title: string;
  readonly detail: string;
  /** `null` = khong co nut (khong co quyen / giai doan khong cho chon). */
  readonly chooseLabel: string | null;
  readonly caption: string | null;
}

/**
 * The "Chưa có điểm giao" tren man Viec — dua lai buoc diem giao khi lai xe da thoat giua chung.
 * Chi hai giai doan co the; da du (`CONFIRMED`) hay da dung (`CLOSED`) thi man Viec tu noi.
 */
export function openIntakeCard(
  intake: DriverIntakeView | null | undefined,
  canChoose: boolean,
): OpenIntakeCard | null {
  if (!intake) return null;
  const place = `Đã nhận hàng tại ${pickupLine(intake)}`;
  if (intake.stage === 'NEEDS_DESTINATION') {
    const choosable = canChoose && intake.canChooseDestination;
    return {
      title: 'Chưa có điểm giao',
      detail: place,
      chooseLabel: choosable ? RECEIVED_COPY.choose : null,
      caption: choosable ? null : OFFICE_FOLLOW_UP_TEXT,
    };
  }
  if (intake.stage === 'OFFICE_FOLLOW_UP') {
    // KHONG lap lai chu "Đã nhận chuyến" cua man xong: man Viec van song (an) sau man Nhan chuyen.
    return {
      title: 'Chuyến bạn vừa nhận',
      detail: intake.destinationLabel ? `Giao tới ${intake.destinationLabel}` : place,
      chooseLabel: null,
      caption: OFFICE_FOLLOW_UP_TEXT,
    };
  }
  return null;
}

/**
 * "Văn phòng đã giao việc này cho bạn" SAI voi chuyen lai xe TU nhan — an cau do khi chuyen dang
 * hien la cua lan nhan viec con mo.
 */
export function showAssignedNote(
  canIntake: boolean,
  openIntake: DriverIntakeView | null | undefined,
  currentRunId: string | null,
): boolean {
  if (!canIntake) return false;
  return !(openIntake && currentRunId !== null && openIntake.runId === currentRunId);
}
