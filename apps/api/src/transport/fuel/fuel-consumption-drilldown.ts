import type { BusinessDate } from '../business-date.js';
import type { FuelReviewReason, FuelVerificationStatus } from './fuel-lifecycle.js';
import { computeConsumption, exceedsConsumptionNorm } from './fuel-quantity.js';
import type { FuelEntry } from './fuel.types.js';

/**
 * DRILL-DOWN TIEU HAO THEO XE / KY — `#313`, dong `G10` cua `#295`.
 *
 * ===========================================================================
 * HAM THUAN, CHI DOC — va no KHONG thay the con so da luu tren tung phieu.
 *
 * `FuelService.measureConsumption` chup `previousOdometerKm`/`consumptionUnits` LUC GHI, lay odo cua
 * phieu lien truoc BAT KY cua xe (`findPreviousOdometer`, ke ca phieu sau nay bi tu choi). Con so do
 * dung tai thoi diem khai va KHONG duoc ham nay sua. Cai ham nay tra loi la mot cau khac: *"voi bo
 * phieu dang con hieu luc HOM NAY, chuoi km cua xe nay noi gi"* — va khi hai cau tra loi lech nhau,
 * no noi ra bang `RECORDED_SNAPSHOT_DIFFERS` thay vi chon ngam mot ben.
 *
 * ===========================================================================
 * MOC KM HOP LE
 *
 * Duyet theo `(businessDate, occurredAt, id)` — dung thu tu cua `findPreviousOdometer`. Phieu
 * `REJECTED` khong phai mot moc: ke toan da khong tin so lieu cua no. Voi moi phieu con lai:
 *
 * ```text
 * chua co moc                      -> NO_PREVIOUS_ODOMETER      ; phieu nay thanh moc
 * odo <= moc                       -> ODOMETER_NOT_ADVANCED     ; moc giu nguyen, doan bi "thung"
 * doan dang thung, odo > moc       -> PREVIOUS_FILL_UNANCHORED  ; phieu nay thanh moc
 * con lai                          -> COMPUTED                  ; phieu nay thanh moc
 * ```
 *
 * `PREVIOUS_FILL_UNANCHORED` la cho de bia so nhat. Mot lan do xen giua co odo hong da do dau vao
 * dung doan duong nay, nen `so lit cua phieu nay / (odo - moc)` se thieu chinh so lit do — ra mot
 * con so THAP dep de. Khong tinh la cau tra loi trung thuc duy nhat.
 *
 * ===========================================================================
 * KHONG MOT DONG TIEN, KHONG MOT LAI XE
 *
 * Mat xich khong mang `amount` va `driverId`. Canh bao vuot dinh muc la INSIGHT de nguoi soat xet,
 * khong phai mot khoan no hay mot khoan tru luong — va cach re nhat de khong ai bien no thanh thu
 * do la khong dua cho no hai truong do.
 */

export const FUEL_CONSUMPTION_LINK_STATES = [
  'COMPUTED',
  'NO_PREVIOUS_ODOMETER',
  'ODOMETER_NOT_ADVANCED',
  'PREVIOUS_FILL_UNANCHORED',
  'EXCLUDED_REJECTED',
] as const;
export type FuelConsumptionLinkState = (typeof FUEL_CONSUMPTION_LINK_STATES)[number];

export const FUEL_CONSUMPTION_INSIGHTS = [
  'CONSUMPTION_ABOVE_NORM',
  'RECORDED_SNAPSHOT_DIFFERS',
] as const;
export type FuelConsumptionInsight = (typeof FUEL_CONSUMPTION_INSIGHTS)[number];

/** Moc km dung truoc ky dang xem — hien ra de nguoi doc biet mat xich dau ky noi vao dau. */
export interface FuelConsumptionAnchor {
  readonly entryId: string;
  readonly businessDate: BusinessDate;
  readonly occurredAt: string;
  readonly odometerKm: number;
}

/** Mot phieu trong chuoi. Don vi giong `fuel.types.ts`: mililit, mili-L/100km, km nguyen. */
export interface FuelConsumptionLink {
  readonly entryId: string;
  readonly tripId: string;
  readonly businessDate: BusinessDate;
  readonly occurredAt: string;
  readonly verificationStatus: FuelVerificationStatus;
  readonly litersUnits: number;
  readonly odometerKm: number;
  /** Phieu dang lam moc — `null` khi khong co moc, hoac phieu nay nam ngoai chuoi. */
  readonly previousEntryId: string | null;
  readonly previousOdometerKm: number | null;
  /** `odo - moc`. GIU CA GIA TRI AM/0 de nguoi soat thay vi sao khong tinh. */
  readonly distanceKm: number | null;
  /** `null` = KHONG tinh duoc. Khong bao gio `0` thay cho "khong biet" (`INV-06`). */
  readonly consumptionUnits: number | null;
  readonly state: FuelConsumptionLinkState;
  readonly insights: readonly FuelConsumptionInsight[];
  /** Nhung gi may chu da CHUP luc khai — de doi chieu, khong de tinh lai. */
  readonly recorded: {
    readonly previousOdometerKm: number | null;
    readonly consumptionUnits: number | null;
    readonly reviewReasons: readonly FuelReviewReason[];
  };
}

export interface FuelConsumptionSummary {
  readonly entryCount: number;
  readonly computedCount: number;
  /** Phieu trong chuoi ma KHONG tinh duoc — can nguoi soat. */
  readonly reviewCount: number;
  readonly excludedCount: number;
  /** Phieu trong chuoi con `DECLARED` — so lieu chua ai xac thuc. */
  readonly unverifiedCount: number;
  readonly aboveNormCount: number;
  /** CHI cong mat xich `COMPUTED`: moi mat xich khac khong co mot doan duong dang tin. */
  readonly totalLitersUnits: number;
  readonly totalDistanceKm: number;
  readonly consumptionUnits: number | null;
  readonly stateCounts: Readonly<Record<FuelConsumptionLinkState, number>>;
}

export interface FuelConsumptionDrilldownInput {
  /** Phieu cua MOT xe trong ky — moi trang thai, moi thu tu. */
  readonly entries: readonly FuelEntry[];
  /** Phieu con hieu luc GAN NHAT truoc ky. Mot phieu `REJECTED` o day bi bo qua. */
  readonly leadIn: FuelEntry | null;
  readonly normL100km: number | null;
  readonly tolerancePercent: number;
}

export interface FuelConsumptionDrilldown {
  readonly leadIn: FuelConsumptionAnchor | null;
  readonly links: readonly FuelConsumptionLink[];
  readonly summary: FuelConsumptionSummary;
}

/** Cung thu tu voi `findPreviousOdometer` — hai phieu cung khoanh khac van co thu tu tat dinh. */
export const compareFuelChronology = (left: FuelEntry, right: FuelEntry): number => {
  if (left.businessDate !== right.businessDate) {
    return left.businessDate < right.businessDate ? -1 : 1;
  }
  const leftAt = new Date(left.occurredAt).getTime();
  const rightAt = new Date(right.occurredAt).getTime();
  if (leftAt !== rightAt) return leftAt - rightAt;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
};

interface ChainStep {
  readonly anchor: FuelEntry | null;
  /** Co mot lan do con hieu luc nam giua moc va phieu dang xet ma khong co odo hop le. */
  readonly isUnanchored: boolean;
}

interface Measured {
  readonly state: FuelConsumptionLinkState;
  readonly distanceKm: number | null;
  readonly consumptionUnits: number | null;
  readonly next: ChainStep;
}

function measure(entry: FuelEntry, step: ChainStep): Measured {
  if (step.anchor === null) {
    return {
      state: 'NO_PREVIOUS_ODOMETER',
      distanceKm: null,
      consumptionUnits: null,
      next: { anchor: entry, isUnanchored: false },
    };
  }

  const distanceKm = entry.odometerKm - step.anchor.odometerKm;
  if (distanceKm <= 0) {
    return {
      state: 'ODOMETER_NOT_ADVANCED',
      distanceKm,
      consumptionUnits: null,
      next: { anchor: step.anchor, isUnanchored: true },
    };
  }

  const next = { anchor: entry, isUnanchored: false };
  if (step.isUnanchored) {
    return { state: 'PREVIOUS_FILL_UNANCHORED', distanceKm, consumptionUnits: null, next };
  }

  // Dung CHINH phep tinh cua mien, khong mot cong thuc thu hai.
  const { consumptionUnits } = computeConsumption({
    litersUnits: entry.litersUnits,
    odometerKm: entry.odometerKm,
    previousOdometerKm: step.anchor.odometerKm,
  });
  return { state: 'COMPUTED', distanceKm, consumptionUnits, next };
}

function insightsOf(
  entry: FuelEntry,
  anchor: FuelEntry | null,
  measured: Measured,
  input: FuelConsumptionDrilldownInput,
): FuelConsumptionInsight[] {
  const insights: FuelConsumptionInsight[] = [];
  if (
    measured.state === 'COMPUTED' &&
    exceedsConsumptionNorm(measured.consumptionUnits, input.normL100km, input.tolerancePercent)
  ) {
    insights.push('CONSUMPTION_ABOVE_NORM');
  }
  const chainPrevious = anchor?.odometerKm ?? null;
  if (
    entry.previousOdometerKm !== chainPrevious ||
    entry.consumptionUnits !== measured.consumptionUnits
  ) {
    insights.push('RECORDED_SNAPSHOT_DIFFERS');
  }
  return insights;
}

function linkOf(
  entry: FuelEntry,
  previous: FuelEntry | null,
  measured: Pick<Measured, 'state' | 'distanceKm' | 'consumptionUnits'>,
  insights: readonly FuelConsumptionInsight[],
): FuelConsumptionLink {
  return {
    entryId: entry.id,
    tripId: entry.tripId,
    businessDate: entry.businessDate,
    occurredAt: entry.occurredAt,
    verificationStatus: entry.verificationStatus,
    litersUnits: entry.litersUnits,
    odometerKm: entry.odometerKm,
    previousEntryId: previous?.id ?? null,
    previousOdometerKm: previous?.odometerKm ?? null,
    distanceKm: measured.distanceKm,
    consumptionUnits: measured.consumptionUnits,
    state: measured.state,
    insights,
    recorded: {
      previousOdometerKm: entry.previousOdometerKm,
      consumptionUnits: entry.consumptionUnits,
      reviewReasons: [...entry.reviewReasons],
    },
  };
}

const EXCLUDED = { state: 'EXCLUDED_REJECTED', distanceKm: null, consumptionUnits: null } as const;

function summarise(links: readonly FuelConsumptionLink[]): FuelConsumptionSummary {
  const stateCounts = Object.fromEntries(
    FUEL_CONSUMPTION_LINK_STATES.map((state) => [state, 0]),
  ) as Record<FuelConsumptionLinkState, number>;
  let totalLitersUnits = 0;
  let totalDistanceKm = 0;
  for (const link of links) {
    stateCounts[link.state] += 1;
    if (link.state !== 'COMPUTED' || link.distanceKm === null) continue;
    totalLitersUnits += link.litersUnits;
    totalDistanceKm += link.distanceKm;
  }

  const inChain = links.filter((link) => link.state !== 'EXCLUDED_REJECTED');
  return {
    entryCount: links.length,
    computedCount: stateCounts.COMPUTED,
    reviewCount: inChain.length - stateCounts.COMPUTED,
    excludedCount: stateCounts.EXCLUDED_REJECTED,
    unverifiedCount: inChain.filter((link) => link.verificationStatus === 'DECLARED').length,
    aboveNormCount: links.filter((link) => link.insights.includes('CONSUMPTION_ABOVE_NORM')).length,
    totalLitersUnits,
    totalDistanceKm,
    // Tong lit / tong km cua cac doan DANG TIN, qua CHINH `computeConsumption` tren mot doan
    // `[0, tong km]` — cung phep so hoc nguyen, cung bien, khong mot cong thuc thu hai.
    consumptionUnits:
      totalDistanceKm > 0
        ? computeConsumption({
            litersUnits: totalLitersUnits,
            odometerKm: totalDistanceKm,
            previousOdometerKm: 0,
          }).consumptionUnits
        : null,
    stateCounts,
  };
}

export function buildFuelConsumptionDrilldown(
  input: FuelConsumptionDrilldownInput,
): FuelConsumptionDrilldown {
  const leadIn = input.leadIn?.verificationStatus === 'REJECTED' ? null : input.leadIn;
  let step: ChainStep = { anchor: leadIn, isUnanchored: false };
  const links: FuelConsumptionLink[] = [];

  for (const entry of [...input.entries].sort(compareFuelChronology)) {
    if (entry.verificationStatus === 'REJECTED') {
      links.push(linkOf(entry, null, EXCLUDED, []));
      continue;
    }
    const measured = measure(entry, step);
    links.push(
      linkOf(entry, step.anchor, measured, insightsOf(entry, step.anchor, measured, input)),
    );
    step = measured.next;
  }

  return {
    leadIn:
      leadIn === null
        ? null
        : {
            entryId: leadIn.id,
            businessDate: leadIn.businessDate,
            occurredAt: leadIn.occurredAt,
            odometerKm: leadIn.odometerKm,
          },
    links,
    summary: summarise(links),
  };
}
