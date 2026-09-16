import {
  EMPTY_VALUE,
  TOLL_MATCH_STATE_LABEL,
  TOLL_REVIEW_STATE_LABEL,
  formatBusinessDate,
  formatCount,
  formatInstant,
  formatMoney,
  tollMatchStateTone,
  tollReviewStateTone,
  type StatusTone,
} from '../customer-view';
import type { TollDuplicatePeerListing } from '../toll-report-types';
import type {
  TollCandidate,
  TollMatchState,
  TollReviewAction,
  TollReviewDecision,
} from '../transport-types';

/**
 * QUYET TRUNG va VIEC TREN TUNG DONG cua hang cho ETC — `#314` G8. Phan QUYET DINH, tach khoi phan ve.
 *
 * ============================================================================================
 * HAI LO MA MAY CHU KHONG CHAN, VA TEP NAY DONG O TANG KHUNG NHIN
 * ============================================================================================
 *
 *   1. VONG TRUNG. `planReview(FLAG_DUPLICATE)` chi kiem "dong dich khac chinh no" va "cung nha cung
 *      cap". A ghi "trung B" roi B ghi "trung A" la hop le voi may chu — va ca hai dong roi khoi moi
 *      tong chi phi. Nen o day, mot dong DA bi ghi trung khong bao gio duoc de xuat lam dong goc.
 *   2. CUA SAU CUA CAU HOI TRUNG. `CONFIRM` tren dong nghi trung khong noi no la hay khong la trung;
 *      `RESOLVE_VEHICLE` tren dong nghi trung lang le doi no thanh `MATCHED`. Nen dong nghi trung chi
 *      co MOT cua: quyet trung (`FLAG_DUPLICATE` voi dong goc, hoac `CLEAR_DUPLICATE`).
 *
 * Cong THAT van la may chu. Nhung lo tren khong phai "nut bam se 4xx" — may chu CHAP NHAN chung, va
 * sua ngu nghia review la viec cua chu mien toll (bao lai o #314), khong phai cua mot man hinh.
 */

/* ------------------------------------------------------------------ *
 * Viec tren tung dong
 * ------------------------------------------------------------------ */

export type TollQueueRowAction = 'RESOLVE_VEHICLE' | 'CONFIRM' | 'REOPEN' | 'REVIEW_DUPLICATE';

/**
 * VIEC NAO HIEN tren mot dong. Vai nguoi dung duoc gac rieng (`TollQueueModel.canResolve`).
 *
 * `RESOLVE_VEHICLE` phan anh luat may chu (chi `TOLL_PASS` gan duoc xe) va chi mo khi dong CHUA co xe:
 * man hinh khong bao gio chon xe giup — nguoi chon tu danh sach doi xe.
 */
export const tollQueueRowActions = (
  candidate: Pick<
    TollCandidate,
    'parseStatus' | 'kind' | 'vehicleId' | 'matchState' | 'reviewState'
  >,
): readonly TollQueueRowAction[] => {
  if (candidate.parseStatus !== 'ACCEPTED') return [];
  const isDuplicate = candidate.matchState === 'DUPLICATE_CANDIDATE';
  const canResolveVehicle =
    !isDuplicate && candidate.kind === 'TOLL_PASS' && candidate.vehicleId === null;

  if (candidate.reviewState === 'CONFIRMED') {
    return canResolveVehicle ? ['RESOLVE_VEHICLE', 'REOPEN'] : ['REOPEN'];
  }
  if (isDuplicate) return ['REVIEW_DUPLICATE'];
  return canResolveVehicle ? ['RESOLVE_VEHICLE', 'CONFIRM'] : ['CONFIRM'];
};

/* ------------------------------------------------------------------ *
 * Bang quyet trung
 * ------------------------------------------------------------------ */

export interface TollDuplicatePeerOption {
  readonly id: string;
  readonly rowNumber: number;
  readonly sourceLabel: string;
  readonly businessDateLabel: string;
  readonly passedAtLabel: string;
  readonly amountLabel: string;
  readonly stationLabel: string;
  readonly vehiclePlateRaw: string;
  readonly matchStateLabel: string;
  readonly matchStateTone: StatusTone;
  readonly reviewStateLabel: string;
  readonly reviewStateTone: StatusTone;
  /** Chon lam DONG GOC duoc khong. */
  readonly selectable: boolean;
  /** Vi sao khong chon duoc — `null` khi chon duoc. */
  readonly blockedReason: string | null;
}

export interface TollDuplicateReviewModel {
  readonly candidateId: string;
  readonly rowNumber: number;
  readonly canDecide: boolean;
  /** Vi sao KHONG quyet duoc luc nay, va duong di tiep neu co. */
  readonly lockedReason: string | null;
  readonly peers: readonly TollDuplicatePeerOption[];
  readonly peerNotice: string;
  readonly truncatedNotice: string | null;
  readonly canFlag: boolean;
  readonly canClear: boolean;
}

const lockedReasonOf = (candidate: TollCandidate, canResolve: boolean): string | null => {
  if (!canResolve) return 'Vai của bạn chỉ xem được, không quyết được dòng trùng.';
  if (candidate.parseStatus !== 'ACCEPTED') {
    return 'Dòng này bị bỏ qua lúc đọc tệp — không có gì để quyết.';
  }
  if (candidate.matchState !== 'DUPLICATE_CANDIDATE') {
    return 'Dòng này không nằm trong diện nghi trùng.';
  }
  if (candidate.reviewState === 'CONFIRMED') {
    return candidate.duplicateOfCandidateId !== null
      ? 'Dòng này đã được ghi là trùng. Mở lại dòng để quyết lại.'
      : 'Dòng này đã được xác nhận khi còn nghi trùng. Mở lại dòng để quyết rõ là trùng hay không.';
  }
  return null;
};

const blockedReasonOf = (peer: TollCandidate, current: TollCandidate): string | null => {
  if (peer.parseStatus !== 'ACCEPTED') return 'Dòng này bị bỏ qua lúc đọc tệp.';
  if (peer.duplicateOfCandidateId === current.id) {
    return 'Dòng này đã được ghi là trùng với chính dòng đang xem — chọn nó sẽ tạo một vòng trùng.';
  }
  if (peer.duplicateOfCandidateId !== null) {
    return 'Dòng này đã được ghi là trùng với một dòng khác, nên không làm dòng gốc được.';
  }
  return null;
};

const toPeerOption = (
  peer: { readonly candidate: TollCandidate; readonly importLabel: string | null },
  current: TollCandidate,
): TollDuplicatePeerOption => {
  const blockedReason = blockedReasonOf(peer.candidate, current);
  const row = peer.candidate;
  return {
    id: row.id,
    rowNumber: row.rowNumber,
    sourceLabel: peer.importLabel ?? EMPTY_VALUE,
    businessDateLabel: formatBusinessDate(row.businessDate),
    passedAtLabel: formatInstant(row.passedAt),
    amountLabel: formatMoney(row.signedAmount),
    stationLabel: row.stationLabel ?? EMPTY_VALUE,
    vehiclePlateRaw: row.vehiclePlateRaw === '' ? EMPTY_VALUE : row.vehiclePlateRaw,
    matchStateLabel: row.matchState ? TOLL_MATCH_STATE_LABEL[row.matchState] : EMPTY_VALUE,
    matchStateTone: row.matchState ? tollMatchStateTone(row.matchState) : 'flat',
    reviewStateLabel: TOLL_REVIEW_STATE_LABEL[row.reviewState],
    reviewStateTone: tollReviewStateTone(row.reviewState),
    selectable: blockedReason === null,
    blockedReason,
  };
};

const peerNoticeOf = (listing: TollDuplicatePeerListing | null, peerCount: number): string => {
  if (listing === null) return 'Chưa đọc được các dòng mang cùng dấu vân.';
  if (!listing.fingerprintAvailable) {
    return 'Dòng này không có dấu vân, nên hệ thống không đề xuất được dòng đối ứng nào — điều đó không có nghĩa là không có dòng trùng.';
  }
  if (peerCount === 0) {
    return 'Không còn dòng nào khác mang cùng dấu vân. Nếu đây là một sự kiện thật, hãy bỏ nghi trùng.';
  }
  return (
    `${formatCount(peerCount)} dòng khác mang cùng dấu vân (cùng nhà cung cấp, tài khoản, loại, biển số, ` +
    'thời điểm, số tiền, trạm và mã tham chiếu). Nếu dòng đang xem là bản trùng, chọn đúng một dòng làm dòng gốc.'
  );
};

export const toTollDuplicateReviewModel = (input: {
  readonly candidate: TollCandidate;
  readonly listing: TollDuplicatePeerListing | null;
  readonly canResolve: boolean;
}): TollDuplicateReviewModel => {
  const lockedReason = lockedReasonOf(input.candidate, input.canResolve);
  const canDecide = lockedReason === null;
  const peers = (input.listing?.peers ?? [])
    // May chu khong tra chinh dong do; loc them o day de mot phan hoi la khong the tao vong tu than.
    .filter((peer) => peer.candidate.id !== input.candidate.id)
    .map((peer) => toPeerOption(peer, input.candidate));

  return {
    candidateId: input.candidate.id,
    rowNumber: input.candidate.rowNumber,
    canDecide,
    lockedReason,
    peers,
    peerNotice: peerNoticeOf(input.listing, peers.length),
    truncatedNotice:
      input.listing?.truncated === true
        ? 'Còn dòng đối ứng khác ngoài các dòng hiển thị — lọc hàng chờ theo «Nghi trùng dòng» để xem hết.'
        : null,
    canFlag: canDecide && peers.some((peer) => peer.selectable),
    canClear: canDecide,
  };
};

/* ------------------------------------------------------------------ *
 * Cau hau qua — noi DUNG dieu may chu se lam
 * ------------------------------------------------------------------ */

const APPEND_ONLY_TAIL = 'Quyết định được ghi thêm vào lịch sử và mở lại được.';

export const flagDuplicateConsequence = (
  candidate: Pick<TollCandidate, 'rowNumber'>,
  target: Pick<TollDuplicatePeerOption, 'rowNumber' | 'sourceLabel'>,
): string =>
  `Dòng ${String(candidate.rowNumber)} sẽ được ghi là TRÙNG với dòng ${String(target.rowNumber)} của nguồn ` +
  `«${target.sourceLabel}». Số tiền của dòng ${String(candidate.rowNumber)} sẽ không được tính vào chi phí nào. ` +
  APPEND_ONLY_TAIL;

/**
 * Phan anh `planReview(CLEAR_DUPLICATE)`: co xe -> `MATCHED` va tinh cho xe; khong co xe ma la luot
 * qua tram -> `VEHICLE_UNRESOLVED`; khong co xe va khong phai luot qua tram -> cap tai khoan. Neu luat
 * may chu doi, day la cho phai sua theo.
 */
export const clearDuplicateConsequence = (
  candidate: Pick<TollCandidate, 'rowNumber' | 'kind' | 'vehicleId'>,
  vehicleLabel: string | null,
): string => {
  const head = `Dòng ${String(candidate.rowNumber)} sẽ được ghi là một sự kiện thật, không trùng.`;
  if (candidate.vehicleId !== null) {
    return `${head} Nó sẽ được tính vào chi phí của xe ${vehicleLabel ?? 'đã khớp'}. ${APPEND_ONLY_TAIL}`;
  }
  if (candidate.kind === 'TOLL_PASS') {
    return `${head} Dòng này chưa gắn xe, nên nó sẽ nằm ở mục «Chưa nhận ra xe» cho tới khi có người chỉ định xe. ${APPEND_ONLY_TAIL}`;
  }
  return `${head} Nó sẽ được tính ở mục cấp tài khoản, không thuộc xe nào. ${APPEND_ONLY_TAIL}`;
};

/* ------------------------------------------------------------------ *
 * Lich su quyet dinh
 * ------------------------------------------------------------------ */

/** Nhan QUA KHU cho lich su — `TOLL_REVIEW_ACTION_LABEL` la nhan cua NUT, doc len nhu mot loi moi. */
const DECISION_LABEL = {
  RESOLVE_VEHICLE: 'Đã chỉ định xe',
  CONFIRM: 'Đã xác nhận',
  FLAG_DUPLICATE: 'Đã ghi là trùng',
  CLEAR_DUPLICATE: 'Đã bỏ nghi trùng',
  REOPEN: 'Đã mở lại',
} as const satisfies Record<TollReviewAction, string>;

export interface TollDecisionEntry {
  readonly id: string;
  readonly atLabel: string;
  readonly actor: string;
  readonly actionLabel: string;
  readonly note: string | null;
  /** `— → 15C-556.33` khi xe doi; `null` khi khong doi. */
  readonly vehicleChange: string | null;
  readonly matchChange: string | null;
  readonly duplicateOfLabel: string | null;
}

const matchLabel = (state: TollMatchState | null): string =>
  state === null ? EMPTY_VALUE : TOLL_MATCH_STATE_LABEL[state];

export const toTollDecisionTimeline = (
  decisions: readonly TollReviewDecision[],
  lookups: {
    readonly vehicleLabelOf: (vehicleId: string) => string;
    readonly rowLabelOf: (candidateId: string) => string | null;
  },
): readonly TollDecisionEntry[] => {
  const vehicleText = (vehicleId: string | null): string =>
    vehicleId === null ? EMPTY_VALUE : lookups.vehicleLabelOf(vehicleId);

  return [...decisions]
    .sort((left, right) => (left.at < right.at ? -1 : left.at > right.at ? 1 : 0))
    .map((decision) => ({
      id: decision.id,
      atLabel: formatInstant(decision.at),
      actor: decision.actor,
      actionLabel: DECISION_LABEL[decision.action],
      note: decision.note,
      vehicleChange:
        decision.previousVehicleId === decision.nextVehicleId
          ? null
          : `${vehicleText(decision.previousVehicleId)} → ${vehicleText(decision.nextVehicleId)}`,
      matchChange:
        decision.previousMatchState === decision.nextMatchState
          ? null
          : `${matchLabel(decision.previousMatchState)} → ${matchLabel(decision.nextMatchState)}`,
      duplicateOfLabel:
        decision.duplicateOfCandidateId === null
          ? null
          : (lookups.rowLabelOf(decision.duplicateOfCandidateId) ?? 'một dòng khác'),
    }));
};
