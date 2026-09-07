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
