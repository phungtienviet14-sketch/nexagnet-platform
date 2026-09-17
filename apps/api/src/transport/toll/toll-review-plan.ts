import { TransportDomainError } from '../transport.errors.js';
import type { TollReviewReason } from './toll-decisions.js';
import {
  tollDuplicateChainError,
  tollDuplicateGate,
  tollDuplicateResolutionOf,
  traceTollDuplicateChain,
  type TollDuplicateGateReason,
} from './toll-duplicate-guard.js';
import type {
  TollMatchState,
  TollReviewAction,
  TollTransactionCandidateRecord,
} from './toll.types.js';

/**
 * MOT LAN QUYET cua nguoi doi soat -> TRANG THAI MOI cua dong. Tach khoi `TollService` o `#318`.
 *
 * ===========================================================================
 * KHONG mot nhanh nao o day noi ve TIEN DA TRA.
 *
 * #269 J7 cam gan nhan `paid`/`settled`/`accounted` cho mot quyet dinh so khop. Cai duy nhat thay
 * doi la: dong nay noi ve xe nao, no co trung dong nao khong, va da co nguoi nhin no chua. Viec no
 * co sinh ra mot nghia vu thanh toan hay khong la mot cau hoi CHUA AI TRA LOI o day.
 *
 * ===========================================================================
 * THU TU CAC CONG la mot phan cua hop dong: cong TRUNG truoc moi luat rieng cua tung viec. Mot dong
 * nghi trung khong duoc qua `CONFIRM` hay `RESOLVE_VEHICLE` bang BAT KY ly do nao khac, ke ca khi
 * mot luat rieng cua viec do cung se tu choi no.
 *
 * Va chi DUNG MOT viec dua dong vao `CONFIRMED` ma khong phai quyet dinh loai tru: `CONFIRM`.
 * `CLEAR_DUPLICATE` tra loi cau hoi trung roi de dong `PENDING`; xac nhan la mot buoc rieng sau do.
 */

export interface TollReviewCommand {
  readonly candidateId: string;
  readonly action: TollReviewAction;
  readonly vehicleId: string | null;
  readonly duplicateOfCandidateId: string | null;
  readonly note: string | null;
}

export interface TollReviewPlan {
  readonly reason: Extract<
    TollReviewReason,
    | 'TOLL_REVIEW_VEHICLE_RESOLVED'
    | 'TOLL_REVIEW_CONFIRMED'
    | 'TOLL_REVIEW_DUPLICATE_FLAGGED'
    | 'TOLL_REVIEW_DUPLICATE_CLEARED'
    | 'TOLL_REVIEW_REOPENED'
  >;
  readonly nextVehicleId: string | null;
  readonly nextMatchState: TollMatchState | null;
  readonly nextReviewState: 'PENDING' | 'CONFIRMED' | 'REOPENED';
  readonly duplicateOfCandidateId: string | null;
}

export interface TollReviewPlanPorts {
  readonly findCandidate: (id: string) => Promise<TollTransactionCandidateRecord | null>;
  readonly vehicleExists: (vehicleId: string) => Promise<boolean>;
  /** Ghi MOT quyet dinh `denied` co ma. Telemetry — fail-open, khong bao gio chan nghiep vu. */
  readonly deny: (reason: TollReviewReason, detail: Record<string, unknown>) => void;
}

const GATED_ACTION_TEXT: Readonly<Record<TollReviewAction, string>> = {
  RESOLVE_VEHICLE: 'chi dinh xe',
  CONFIRM: 'xac nhan',
  FLAG_DUPLICATE: 'ghi trung',
  CLEAR_DUPLICATE: 'bo nghi trung',
  REOPEN: 'mo lai',
};

const gateMessage = (
  reason: TollDuplicateGateReason,
  candidate: TollTransactionCandidateRecord,
  action: TollReviewAction,
): string => {
  const row = `Dong ${String(candidate.rowNumber)}`;
  switch (reason) {
    case 'TOLL_REVIEW_DUPLICATE_UNRESOLVED':
      return (
        `${row} con NGHI TRUNG chua giai: ghi no trung voi dong goc hoac bo nghi trung truoc khi ` +
        GATED_ACTION_TEXT[action]
      );
    case 'TOLL_REVIEW_DUPLICATE_DECLARED':
      return (
        `${row} da duoc ghi la TRUNG voi mot dong khac: mo lai dong roi quyet lai truoc khi ` +
        GATED_ACTION_TEXT[action]
      );
    case 'TOLL_REVIEW_DUPLICATE_NOT_SUSPECTED':
      return `${row} khong nam trong dien nghi trung — khong co nghi trung nao de bo`;
  }
};

export async function planTollReview(
  candidate: TollTransactionCandidateRecord,
  command: TollReviewCommand,
  ports: TollReviewPlanPorts,
): Promise<TollReviewPlan> {
  const resolution = tollDuplicateResolutionOf(candidate);
  const gate = tollDuplicateGate(command.action, resolution);
  if (gate !== null) {
    ports.deny(gate, { candidateId: candidate.id, action: command.action, resolution });
    throw TransportDomainError.conflict(gate, gateMessage(gate, candidate, command.action));
  }

  switch (command.action) {
    case 'RESOLVE_VEHICLE':
      return planResolveVehicle(candidate, command, ports);
    case 'FLAG_DUPLICATE':
      return planFlagDuplicate(candidate, command, ports);
    case 'CLEAR_DUPLICATE':
      return planClearDuplicate(candidate);
    case 'REOPEN':
      return {
        reason: 'TOLL_REVIEW_REOPENED',
        nextVehicleId: candidate.vehicleId,
        nextMatchState: candidate.matchState,
        nextReviewState: 'REOPENED',
        // Mo lai mot dong DA GHI TRUNG dua no ve NGHI TRUNG (`matchState` van la
        // `DUPLICATE_CANDIDATE`): van bi loai khoi tong chi phi, va lai phai quyet trung.
        duplicateOfCandidateId: null,
      };
    case 'CONFIRM':
      return {
        reason: 'TOLL_REVIEW_CONFIRMED',
        nextVehicleId: candidate.vehicleId,
        nextMatchState: candidate.matchState,
        nextReviewState: 'CONFIRMED',
        // Cong trung da bao dam dong nay KHONG thuoc dien trung, nen khong co con tro nao bi xoa.
        duplicateOfCandidateId: null,
      };
  }
}

async function planResolveVehicle(
  candidate: TollTransactionCandidateRecord,
  command: TollReviewCommand,
  ports: TollReviewPlanPorts,
): Promise<TollReviewPlan> {
  // Nap tien / phi tai khoan khong gan xe — gan mot chiec xe vao do la tao ra mot lien he khong co
  // that, va no se di tiep vao moi bao cao theo xe.
  if (candidate.kind !== 'TOLL_PASS') {
    ports.deny('TOLL_REVIEW_VEHICLE_NOT_APPLICABLE', {
      candidateId: candidate.id,
      kind: candidate.kind,
    });
    throw TransportDomainError.invalid(
      'TOLL_CANDIDATE_VEHICLE_NOT_APPLICABLE',
      `Dong loai ${String(candidate.kind)} khong gan vao mot chiec xe nao`,
    );
  }
  if (command.vehicleId === null || !(await ports.vehicleExists(command.vehicleId))) {
    throw TransportDomainError.notFound(
      'TOLL_VEHICLE_NOT_FOUND',
      `Khong tim thay xe ${String(command.vehicleId)}`,
    );
  }
  return {
    reason: 'TOLL_REVIEW_VEHICLE_RESOLVED',
    nextVehicleId: command.vehicleId,
    nextMatchState: 'MATCHED',
    // Chon duoc chiec xe KHONG dong nghia voi da doi soat xong: van con `PENDING` cho toi khi co
    // mot lan `CONFIRM` rieng.
    nextReviewState: 'PENDING',
    duplicateOfCandidateId: null,
  };
}

/**
 * GHI TRUNG vao DUNG MOT dong goc — va dong goc do khong duoc dan vong ve dong nay.
 *
 * Phep lan chuoi o day la de NOI RO voi nguoi dung (so dong, do dai vong). No KHONG du de chan hai
 * nguoi ghi cung luc: ca hai co the doc thay chuoi sach truoc khi ben nao ghi. Cong that su nam o
 * `applyReview` cua hai kho, noi phep lan chuoi chay lai TRONG lan ghi.
 */
async function planFlagDuplicate(
  candidate: TollTransactionCandidateRecord,
  command: TollReviewCommand,
  ports: TollReviewPlanPorts,
): Promise<TollReviewPlan> {
  const targetId = command.duplicateOfCandidateId;
  if (targetId === null) {
    throw TransportDomainError.invalid(
      'TOLL_DUPLICATE_TARGET_INVALID',
      'Phai chi ra mot dong KHAC ma dong nay trung',
    );
  }
  if (targetId === candidate.id) {
    ports.deny('TOLL_REVIEW_DUPLICATE_SELF', { candidateId: candidate.id });
    throw tollDuplicateChainError({ kind: 'SELF' });
  }

  const target = await ports.findCandidate(targetId);
  if (!target) {
    throw TransportDomainError.notFound(
      'TOLL_CANDIDATE_NOT_FOUND',
      `Khong tim thay dong ${targetId}`,
    );
  }
  if (target.provider !== candidate.provider) {
    throw TransportDomainError.invalid(
      'TOLL_CANDIDATE_PROVIDER_MISMATCH',
      'Hai dong cua hai nha cung cap khac nhau khong trung nhau duoc',
    );
  }

  const verdict = await traceTollDuplicateChain({
    sourceId: candidate.id,
    targetId,
    duplicateOf: async (id) =>
      id === target.id
        ? target.duplicateOfCandidateId
        : ((await ports.findCandidate(id))?.duplicateOfCandidateId ?? null),
  });
  if (verdict.kind === 'CYCLE') {
    ports.deny('TOLL_REVIEW_DUPLICATE_CYCLE', {
      candidateId: candidate.id,
      targetId,
      cycleLength: verdict.path.length - 1,
    });
    throw TransportDomainError.conflict(
      'TOLL_REVIEW_DUPLICATE_CYCLE',
      `Dong ${String(candidate.rowNumber)} khong ghi trung vao dong ${String(target.rowNumber)} duoc: ` +
        'chuoi dong goc cua dong do khong ket thuc o mot dong goc that (co vong trung). ' +
        'Chon dong goc o cuoi chuoi.',
    );
  }
  if (verdict.kind === 'TOO_DEEP') {
    ports.deny('TOLL_REVIEW_DUPLICATE_CHAIN_TOO_DEEP', {
      candidateId: candidate.id,
      targetId,
      hops: verdict.hops,
    });
    throw tollDuplicateChainError(verdict);
  }

  return {
    reason: 'TOLL_REVIEW_DUPLICATE_FLAGGED',
    nextVehicleId: null,
    nextMatchState: 'DUPLICATE_CANDIDATE',
    /*
     * CO Y khac `CLEAR_DUPLICATE`: GHI TRUNG TU NO la quyet dinh loai tru cua nguoi — khong con buoc
     * xac nhan nao sau no. Dong da ghi trung khong vao tong chi phi nao bat ke trang thai doi soat,
     * va `CONFIRM`/`RESOLVE_VEHICLE` tren no bi cong trung chan (`TOLL_REVIEW_DUPLICATE_DECLARED`).
     */
    nextReviewState: 'CONFIRMED',
    duplicateOfCandidateId: targetId,
  };
}

/**
 * "Hai dong giong nhau nay la HAI su kien that."
 *
 * Day chinh la tinh huong VETC tu cong bo: loi doc cheo lan sinh ra hai giao dich cho mot luot xe.
 * Nguoi doi soat phai noi duoc dieu do ra, va he thong phai GHI LAI — neu khong, moi lan nhin lai
 * dong nay se lai thay cai nhan cu.
 *
 * ===========================================================================
 * BO NGHI TRUNG KHONG PHAI LA XAC NHAN.
 *
 * `#318` chot hai buoc RIENG: tra loi cau hoi trung truoc, ROI MOI `CONFIRM`. Lenh nay chi tra loi
 * cau hoi trung — dong ve `PENDING` (ke ca khi truoc do no dang `CONFIRMED`: mot xac nhan ghi khi
 * cau hoi trung con mo, hoac lan ghi trung vua bi go, khong con dung cho dong nay nua), va vao cot
 * "chua doi soat xong" cua bao cao cho toi khi co mot lan `CONFIRM` rieng. Kieu tra ve khoa dieu do
 * luc bien dich: ham nay khong the tra `CONFIRMED`.
 */
function planClearDuplicate(
  candidate: TollTransactionCandidateRecord,
): TollReviewPlan & { readonly nextReviewState: 'PENDING' } {
  const resolved = candidate.vehicleId !== null || candidate.kind !== 'TOLL_PASS';
  return {
    reason: 'TOLL_REVIEW_DUPLICATE_CLEARED',
    nextVehicleId: candidate.vehicleId,
    nextMatchState: resolved ? 'MATCHED' : 'VEHICLE_UNRESOLVED',
    nextReviewState: 'PENDING',
    duplicateOfCandidateId: null,
  };
}
