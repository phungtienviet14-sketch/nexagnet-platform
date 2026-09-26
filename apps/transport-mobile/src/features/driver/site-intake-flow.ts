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
  /** Vi tri chup luc mo man — toa do VA moc thoi gian cua no di cung nhau (`#398` §3.1). */
  readonly captured: CapturedLocation;
  readonly locationNote: string | null;
  readonly chosenSiteId: string | null;
  readonly received: ReceivedPickup | null;
  readonly pick: DestinationRow | null;
  readonly done: IntakeDone | null;
  readonly failure: IntakeFailure | null;
  readonly loadFailure: string | null;
  readonly busy: boolean;
}

/**
 * VI TRI DA CHUP, kem MOC cua no tren dong ho MAY (`#398` §3.1).
 *
 * Toa do khong co moc la mot toa do khong biet tuoi — va may chu chi chan duoc vi tri cu khi biet
 * tuoi. Nen hai thu di cung mot khoi: khong co cach cap nhat mot ben ma quen ben kia.
 */
export interface CapturedLocation {
  readonly location: SiteIntakeLocationInput;
  /** Epoch ms theo dong ho MAY luc co ban dinh vi. `null` = khong co toa do nao. */
  readonly fixAtMs: number | null;
}

export const NO_CAPTURED_LOCATION: CapturedLocation = { location: {}, fixAtMs: null };

export const INITIAL_INTAKE_FLOW: IntakeFlowState = {
  step: 'LOCATING',
  screen: null,
  captured: NO_CAPTURED_LOCATION,
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
      readonly captured: CapturedLocation;
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
        captured: event.captured,
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
        /** Dau thoi gian CUA CHINH ban dinh vi (ISO) — `FrozenFix.capturedAt`. */
        readonly capturedAt: string;
      };
    }
  | { readonly kind: 'FAILED' | 'TIMEOUT'; readonly message: string };

const UNUSABLE_FIX_NOTE = 'Máy báo một vị trí không dùng được — chưa gửi vị trí nào.';

/**
 * Khong co vi tri van DI TIEP voi `{}` — may chu tra `NO_MATCH` va man noi that vi sao. Toa do hong
 * (Null Island, NaN) cung la "khong co vi tri", khong bao gio la mot diem gui di. Mot ban dinh vi
 * khong doc duoc dau thoi gian cung vay: khong biet tuoi thi khong gui toa do.
 *
 * `receivedAtMs` = `Date.now()` NGAY khi `captureFixWithin` tra ve (xem `fixTakenAtMs`).
 */
export function locationFromFix(
  outcome: IntakeFixOutcome,
  receivedAtMs: number,
): { readonly captured: CapturedLocation; readonly note: string | null } {
  if (outcome.kind !== 'OK') {
    return { captured: NO_CAPTURED_LOCATION, note: `Chưa lấy được vị trí: ${outcome.message}` };
  }
  const location = siteLocationInput(outcome.fix);
  const fixAtMs = fixTakenAtMs(outcome.fix.capturedAt, receivedAtMs);
  if (location.latitude === undefined || fixAtMs === null) {
    return { captured: NO_CAPTURED_LOCATION, note: UNUSABLE_FIX_NOTE };
  }
  return { captured: { location, fixAtMs }, note: null };
}

/* ------------------------------------------------------------------ *
 * TUOI CUA VI TRI — `#398` §3.1 "vi tri cu phai that bai dong"
 * ------------------------------------------------------------------ */

/**
 * Ban chup luc mo man con dung cho lan bam neu chua qua 2 phut. THAP HON han 300 giay cua may chu
 * (`DEFAULT_SITE_CANDIDATE_POLICY.maxAgeSeconds`) de con cho cho thoi gian gui va mot lan chup lai.
 */
export const FRESH_FIX_MAX_AGE_MS = 120_000;

/**
 * Sai so lon nhat may chu con dung mot ban dinh vi (`DEFAULT_SITE_CANDIDATE_POLICY.maxAccuracyMetres`).
 * Ban CHUP LAI te hon muc nay thi may chu CHAC CHAN tu choi (`SITE_INTAKE_LOCATION_UNUSABLE`) — va
 * lai xe dung duoi mai ton se ket o "Tìm lại địa điểm". Coi no nhu "khong co ban moi": gui khong toa
 * do, may chu ghi `NO_LOCATION`, phan thuong mai doi van phong xac nhan noi lay.
 */
export const USABLE_ACCURACY_MAX_METRES = 150;

const tooCoarse = (location: SiteIntakeLocationInput): boolean =>
  typeof location.accuracyMetres === 'number' &&
  location.accuracyMetres > USABLE_ACCURACY_MAX_METRES;

/** Tran `locationAgeMs` cua may chu. Cu hon thi gui DUNG tran — van la "qua han", khong phai 400. */
export const LOCATION_AGE_MAX_MS = 86_400_000;

/**
 * MOC cua ban dinh vi tren dong ho MAY: cai CU HON giua dau thoi gian cua chinh ban dinh vi va luc
 * app nhan duoc no — cung quy uoc voi ban dinh vi cua Lane B o may chu.
 *
 *   · Dau thoi gian cua ban dinh vi noi that khi no CU: tren web, `expo-location` hoi trinh duyet
 *     voi `maximumAge: Infinity`, nen mot lan "lay vi tri" co the tra lai ban trong bo nho dem tu
 *     nhieu phut truoc. Lay luc nhan lam moc se lam ban cu do tre ra.
 *   · Luc nhan chan tren: mot dau thoi gian o TUONG LAI (dong ho GPS lech dong ho may) khong duoc
 *     lam ban dinh vi "moi mai" cho toi khi dong ho may duoi kip.
 *
 * Khong doc duoc mot trong hai -> `null` (khong biet tuoi).
 */
export function fixTakenAtMs(capturedAt: string, receivedAtMs: number): number | null {
  const stamped = Date.parse(capturedAt);
  if (!Number.isFinite(stamped) || !Number.isFinite(receivedAtMs)) return null;
  return Math.min(stamped, receivedAtMs);
}

/**
 * Tuoi gui kem (`locationAgeMs`), tinh LUC GUI tren CUNG dong ho da dong moc — hieu hai moc cua mot
 * dong ho, nen lech gio giua dien thoai va may chu khong lot vao. Am (dong ho may vua lui) ep ve 0:
 * lan bam da qua `needsFreshFix`, noi mot tuoi am da buoc chup lai.
 */
export function fixAgeMs(fixAtMs: number, nowMs: number): number {
  const age = Math.round(nowMs - fixAtMs);
  if (!Number.isFinite(age)) return LOCATION_AGE_MAX_MS;
  return Math.min(Math.max(age, 0), LOCATION_AGE_MAX_MS);
}

/**
 * Ban chup luc de nghi con dung cho lan bam khong. `null` (khong co toa do) -> khong co gi de lam
 * moi. Tuoi am = dong ho may da lui sau luc chup -> khong con tin moc, chup lai.
 */
export function needsFreshFix(fixAtMs: number | null, nowMs: number): boolean {
  if (fixAtMs === null) return false;
  const age = nowMs - fixAtMs;
  return !Number.isFinite(age) || age < 0 || age > FRESH_FIX_MAX_AGE_MS;
}

/**
 * VI TRI GUI KEM LAN BAM "Nhận chuyến tại đây".
 *
 * Man chup MOT ban dinh vi luc mo; lai xe co the bam nhieu phut sau. Ban con moi -> gui no. Ban da
 * cu -> chup LAI (co han, `recapture`) va gui ban moi. Chup lai khong ra ban nao MOI -> KHONG gui
 * toa do: may chu ghi `NO_LOCATION`, viec van hanh van ra doi, con phan thuong mai doi van phong xac
 * nhan noi lay (`ORIGIN_LOCATION_UNVERIFIED`) — that bai DONG ve thuong mai, khong chan lai xe.
 *
 * Khong gui lai ban cu voi tuoi that cua no: may chu se tu choi (`LOCATION_STALE`), va tren web ban
 * chup lai co the chinh la ban cu trong bo nho dem — lai xe se bi ket trong vong "Tìm lại địa điểm".
 * Cung ly do, ban chup lai QUA THO (sai so > `USABLE_ACCURACY_MAX_METRES`) cung tinh la "khong co ban
 * moi": mot dien thoai tra ban te khong duoc thiet hon mot dien thoai khong tra gi.
 */
export async function confirmLocation(
  snapshot: CapturedLocation,
  recapture: () => Promise<IntakeFixOutcome>,
  clock: () => number,
): Promise<CapturedLocation> {
  if (!needsFreshFix(snapshot.fixAtMs, clock())) return snapshot;
  const outcome = await recapture();
  const { captured } = locationFromFix(outcome, clock());
  if (
    captured.fixAtMs === null ||
    needsFreshFix(captured.fixAtMs, clock()) ||
    tooCoarse(captured.location)
  ) {
    return NO_CAPTURED_LOCATION;
  }
  return captured;
}

/**
 * Toa do + tuoi tinh LUC GUI. Khong toa do, hoac toa do khong biet tuoi -> KHONG gui gi: mot cap so
 * khong kem tuoi se roi vao duong cua may khach `#267` cu, noi may chu coi no la "vua doc".
 */
export function proposalBody(
  captured: CapturedLocation,
  nowMs: number,
): Readonly<Record<string, unknown>> {
  const { location, fixAtMs } = captured;
  if (fixAtMs === null || location.latitude === undefined || location.longitude === undefined) {
    return {};
  }
  return { ...location, locationAgeMs: fixAgeMs(fixAtMs, nowMs) };
}

/* ------------------------------------------------------------------ *
 * LOI
 * ------------------------------------------------------------------ */

export type IntakeCommand = 'CONFIRM' | 'DESTINATION';

const UNCERTAIN_TEXT: Readonly<Record<IntakeCommand, string>> = {
  CONFIRM: 'Chưa chắc lệnh đã tới máy chủ — bấm thử lại, sẽ không tạo chuyến thứ hai',
  DESTINATION: 'Chưa chắc lệnh đã tới máy chủ — bấm thử lại, điểm giao sẽ không bị ghi hai lần',
};

/**
 * Ma nghia "gui lai DUNG khoa cu la di tiep" — khong phai tu choi: lenh cung khoa dang chay
 * (`CREATE_IN_FLIGHT`), hoac viec vua doi giua lan doc va lan ghi cua may chu (`STATE_CHANGED`).
 */
const RETRY_SAME_KEY = new Set(['SITE_INTAKE_CREATE_IN_FLIGHT', 'SITE_INTAKE_STATE_CHANGED']);

const NEXT_BY_REASON: Readonly<Record<string, RefusalNext>> = {
  SITE_INTAKE_OPEN_RUN_EXISTS: 'BACK_TO_WORK',
  // Xe cua ban dang giu mot chuyen chua ket thuc (vd van phong vua lap) — viec do se hien o Viec.
  SITE_INTAKE_VEHICLE_BUSY: 'BACK_TO_WORK',
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

/**
 * Than `POST confirmations` — `clientEventId` la khoa CUA LAN THU; vi tri la ban `confirmLocation`
 * da chon, tuoi tinh LUC GUI (`proposalBody`).
 */
export function confirmBody(
  siteId: string,
  clientEventId: string,
  captured: CapturedLocation,
  nowMs: number,
): Readonly<Record<string, unknown>> {
  return { siteId, clientEventId, ...proposalBody(captured, nowMs) };
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
