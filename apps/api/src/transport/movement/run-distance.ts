import type { RunLeg } from './movement.types.js';

/**
 * KM CO HANG vs KM RONG -- phep gop ma R8 analytics se dung, va la ly do `RunLegKind` ton tai.
 *
 * HAM THUAN, khong I/O. #234 doi "enough server/read model for later analytics to compute
 * loaded/empty km WITHOUT GUESSING". Cau "khong doan" la rang buoc thiet ke chinh cua tep nay,
 * va no dan toi hai quyet dinh cu the:
 *
 *  1. `distanceKm === null` KHONG duoc coi la 0. Mot chang chua nhap km khong phai mot chang dai
 *     0 km. Coi no la 0 se lam `emptyRatio` nho di mot cach co he thong -- va sai theo huong
 *     LAM DEP so lieu, tuc kieu sai khong ai di kiem tra.
 *  2. Khi con mot chang thieu km, ket qua tra `complete = false` va `emptyRatio = null`. Mot ty le
 *     tinh tren du lieu khuyet la mot con so trong ma nguoi doc khong phan biet duoc voi con so
 *     that -- nen o day khong tra con so do, tra ra su that la "chua du du lieu".
 *
 * Chang DA HUY khong duoc dem: xe khong chay no. Chang huy la mot ke hoach bi bo, khong phai mot
 * quang duong da di.
 */

export interface RunDistanceSummary {
  readonly loadedKm: number;
  readonly emptyKm: number;
  readonly totalKm: number;
  /**
   * `emptyKm / totalKm`, hoac `null` khi khong tinh duoc -- vi thieu km o mot chang nao do, hoac
   * vi tong bang 0 (khong co gi de chia).
   */
  readonly emptyRatio: number | null;
  /** `true` khi MOI chang duoc dem deu co km. Chi khi do cac con so tren moi la day du. */
  readonly complete: boolean;
  /** So chang bi thieu km, tach theo loai -- de nguoi van hanh biet di nhap cho nao. */
  readonly legsMissingDistance: { readonly loaded: number; readonly empty: number };
  /** So chang duoc dem (da tru chang huy) -- de doc gia biet mau lon the nao. */
  readonly countedLegs: number;
}

const countsTowardsDistance = (leg: RunLeg): boolean => leg.status !== 'CANCELLED';

export function summariseRunDistance(legs: readonly RunLeg[]): RunDistanceSummary {
  let loadedKm = 0;
  let emptyKm = 0;
  let missingLoaded = 0;
  let missingEmpty = 0;
  let countedLegs = 0;

  for (const leg of legs) {
    if (!countsTowardsDistance(leg)) continue;
    countedLegs += 1;

    if (leg.distanceKm === null) {
      if (leg.kind === 'LOADED') missingLoaded += 1;
      else missingEmpty += 1;
      continue;
    }

    if (leg.kind === 'LOADED') loadedKm += leg.distanceKm;
    else emptyKm += leg.distanceKm;
  }

  const totalKm = loadedKm + emptyKm;
  const complete = missingLoaded === 0 && missingEmpty === 0;

  return {
    loadedKm,
    emptyKm,
    totalKm,
    emptyRatio: complete && totalKm > 0 ? emptyKm / totalKm : null,
    complete,
    legsMissingDistance: { loaded: missingLoaded, empty: missingEmpty },
    countedLegs,
  };
}

/* ------------------------------------------------------------------------------------------- *
 * DA DI vs DU DINH — #276 L6
 * ------------------------------------------------------------------------------------------- */

/**
 * `summariseRunDistance()` o tren tra ve MOT con so gop, va no van dung cho cau hoi no tra loi:
 * "vong chay nay tong cong bao nhieu km". Cai no KHONG tra loi duoc la cau hoi cua `#276` L6:
 *
 *   *"Distinguish at least: planned empty leg; actual operational/checkpoint/GPS evidence where
 *    available; cancelled/future planned leg that was never executed. Reports must not count a
 *    cancelled plan as actual empty km."*
 *
 * Mot chang con `PLANNED` la mot DU DINH. Gop km cua no vao cung mot o voi chang da chay xong se
 * lam bao cao km rong noi rang xe da chay mot quang duong ma no chua di — va sai theo huong LAM
 * DEP hay LAM XAU deu tuy vao ke hoach hom do, tuc khong ai kiem chung duoc.
 *
 * ============================================================================================
 * HAI O, VA MOT QUY TAC DOC KHONG DOI XUNG
 * ============================================================================================
 *
 *   `actual`   chi dem chang `COMPLETED`, va CHI doc `distanceKm` (so da ghi nhan).
 *              `plannedDistanceKm` KHONG BAO GIO chay vao day: mot uoc luong khong tro thanh mot
 *              quang duong da di chi vi chang do dong lai.
 *
 *   `planned`  dem chang `PLANNED` va `IN_TRANSIT`, doc `plannedDistanceKm ?? distanceKm`.
 *              Chieu nay thi CO nhan ca so da ghi tay, va do la dung: mot con so nhap tren mot
 *              chang chua chay xong van chi la mot ky vong.
 *
 * Chang `CANCELLED` khong vao o nao — dem rieng o `cancelledLegs` de nguoi doc biet co bao nhieu
 * ke hoach da bi bo, thay vi chung bien mat khong dau vet.
 */
export interface RunMovementSummary {
  /** Quang duong DA DI. Nguon: chang da hoan thanh, cot km da ghi nhan. */
  readonly actual: RunDistanceSummary;
  /** Quang duong DU DINH. Nguon: chang chua chay xong. */
  readonly planned: RunDistanceSummary;
  /** So chang da huy — khong dem vao o nao, nhung khong duoc bien mat. */
  readonly cancelledLegs: number;
}

/** Gia tri km dung cho tung o. Tach ra de quy tac doc khong doi xung nam o DUNG MOT cho. */
type KmReader = (leg: RunLeg) => number | null;

const ACTUAL_KM: KmReader = (leg) => leg.distanceKm;
const PLANNED_KM: KmReader = (leg) => leg.plannedDistanceKm ?? leg.distanceKm;

function bucket(legs: readonly RunLeg[], readKm: KmReader): RunDistanceSummary {
  let loadedKm = 0;
  let emptyKm = 0;
  let missingLoaded = 0;
  let missingEmpty = 0;

  for (const leg of legs) {
    const km = readKm(leg);
    if (km === null) {
      if (leg.kind === 'LOADED') missingLoaded += 1;
      else missingEmpty += 1;
      continue;
    }
    if (leg.kind === 'LOADED') loadedKm += km;
    else emptyKm += km;
  }

  const totalKm = loadedKm + emptyKm;
  const complete = missingLoaded === 0 && missingEmpty === 0;

  return {
    loadedKm,
    emptyKm,
    totalKm,
    emptyRatio: complete && totalKm > 0 ? emptyKm / totalKm : null,
    complete,
    legsMissingDistance: { loaded: missingLoaded, empty: missingEmpty },
    countedLegs: legs.length,
  };
}

export function summariseRunMovement(legs: readonly RunLeg[]): RunMovementSummary {
  const completed = legs.filter((leg) => leg.status === 'COMPLETED');
  const open = legs.filter((leg) => leg.status === 'PLANNED' || leg.status === 'IN_TRANSIT');
  const cancelled = legs.filter((leg) => leg.status === 'CANCELLED');

  return {
    actual: bucket(completed, ACTUAL_KM),
    planned: bucket(open, PLANNED_KM),
    cancelledLegs: cancelled.length,
  };
}
