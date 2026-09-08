import type { GeoPoint } from '../../geo/geo-point.js';
import type { TransportDispatchPolicy } from '../dispatch-policy.js';
import { TransportRoutingPort } from './transport-routing.port.js';
import { truckFingerprint } from './routing.types.js';
import type {
  MatrixCell,
  MatrixOutcome,
  MatrixRequest,
  RouteEstimate,
  RouteOutcome,
  RouteRequest,
  TruckProfile,
} from './routing.types.js';

/**
 * BO NHO DEM + DO DEM cho cong dinh tuyen — `#277 M12`.
 *
 * ===========================================================================
 * BO DEM KHONG PHAI SU THAT NGHIEP VU, VA CO BA HE QUA PHAI GIU
 *
 *   1. NO O TRONG BO NHO va chet cung tien trinh. Khong bang, khong Redis. Mot ket qua dinh tuyen
 *      la mot UOC LUONG co han su dung tinh bang phut; luu no ben vung se tao mot bang du lieu ma
 *      ai do se coi la lich su quang duong that.
 *   2. MOI MUC LAY RA DEU MANG `fromCache: true` va giu nguyen `computedAt` GOC. Do la diem quan
 *      trong nhat cua tep nay: `#277 M12` doi *"stale route estimate cannot be presented as live
 *      without timestamp"*. Cap nhat `computedAt` thanh "bay gio" se lam mot con so 4 phut tuoi
 *      trong y het vua tinh xong.
 *   3. THAT BAI KHONG DUOC DEM. Mot lan nha cung cap khong tra loi la mot su kien nhat thoi;
 *      nho no lai se bien mot cu ngat mang hai giay thanh nam phut he thong tu tu choi chinh minh.
 *
 * ===========================================================================
 * DEM THEO O, KHONG THEO MA TRAN
 *
 * Khoa la mot CAP (diem di, diem den), khong phai ca yeu cau. Mot nguoi dieu hanh mo bang cho don
 * A roi mo tiep cho don B tu cung mot kho se dung lai duoc phan lon cac o — trong khi mot khoa
 * theo ca ma tran thi khong trung mot lan nao. Doi xe cang lon, khac biet cang lon.
 */

export interface RoutingCallStats {
  readonly routeCalls: number;
  readonly matrixCalls: number;
  readonly cellsRequested: number;
  readonly cellsServedFromCache: number;
  readonly providerFailures: number;
}

interface CacheEntry {
  readonly estimate: RouteEstimate;
  readonly expiresAtMs: number;
}

const roundCoordinate = (value: number): string => value.toFixed(5);

const pairKey = (
  providerId: string,
  origin: GeoPoint,
  destination: GeoPoint,
  truck: TruckProfile,
  departAt: string | null,
): string =>
  [
    providerId,
    roundCoordinate(origin.latitude),
    roundCoordinate(origin.longitude),
    roundCoordinate(destination.latitude),
    roundCoordinate(destination.longitude),
    truckFingerprint(truck),
    departAt ?? 'now',
  ].join('#');

export class CachedRoutingAdapter extends TransportRoutingPort {
  readonly providerId: string;

  private readonly entries = new Map<string, CacheEntry>();
  private routeCalls = 0;
  private matrixCalls = 0;
  private cellsRequested = 0;
  private cellsServedFromCache = 0;
  private providerFailures = 0;

  constructor(
    private readonly inner: TransportRoutingPort,
    private readonly policy: TransportDispatchPolicy,
    private readonly now: () => Date = () => new Date(),
  ) {
    super();
    this.providerId = inner.providerId;
  }

  stats(): RoutingCallStats {
    return {
      routeCalls: this.routeCalls,
      matrixCalls: this.matrixCalls,
      cellsRequested: this.cellsRequested,
      cellsServedFromCache: this.cellsServedFromCache,
      providerFailures: this.providerFailures,
    };
  }

  async route(request: RouteRequest): Promise<RouteOutcome> {
    const key = pairKey(
      this.providerId,
      request.origin,
      request.destination,
      request.truck,
      request.departAt,
    );
    this.cellsRequested += 1;

    const cached = this.read(key);
    if (cached) {
      this.cellsServedFromCache += 1;
      return { ok: true, estimate: cached };
    }

    this.routeCalls += 1;
    const outcome = await this.inner.route(request);
    if (!outcome.ok) {
      this.providerFailures += 1;
      return outcome;
    }
    /*
     * Hinh duong di KHONG duoc dem. No lon gap nhieu bac so voi hai con so tom tat, va nguoi goi
     * duy nhat can no (bao cao chi tiet cua Lane N) doc mot lan roi luu vao bao cao cua chinh no.
     */
    if (outcome.estimate.geometry === null) this.write(key, outcome.estimate);
    return outcome;
  }

  async matrix(request: MatrixRequest): Promise<MatrixOutcome> {
    const elements = request.origins.length * request.destinations.length;
    if (elements > this.policy.maxMatrixElements) {
      return {
        ok: false,
        failure: {
          reason: 'REQUEST_BOUND_EXCEEDED',
          providerId: this.providerId,
          detail: `Yeu cau ${elements} o, tran cua chinh sach la ${this.policy.maxMatrixElements}.`,
        },
      };
    }

    this.cellsRequested += elements;

    const hits = new Map<string, RouteEstimate>();
    const missingOriginIndexes = new Set<number>();

    request.origins.forEach((origin, originIndex) => {
      request.destinations.forEach((destination, destinationIndex) => {
        const cached = this.read(
          pairKey(this.providerId, origin, destination, request.truck, request.departAt),
        );
        if (cached) {
          hits.set(`${originIndex}:${destinationIndex}`, cached);
          this.cellsServedFromCache += 1;
        } else {
          missingOriginIndexes.add(originIndex);
        }
      });
    });

    if (missingOriginIndexes.size === 0) {
      const cells: MatrixCell[] = [];
      request.origins.forEach((_origin, originIndex) => {
        request.destinations.forEach((_destination, destinationIndex) => {
          cells.push({
            originIndex,
            destinationIndex,
            estimate: hits.get(`${originIndex}:${destinationIndex}`) ?? null,
            failure: null,
          });
        });
      });
      return { ok: true, cells };
    }

    /*
     * HOI LAI CA HANG CUA MOT DIEM XUAT PHAT CON THIEU, khong hoi tung o.
     *
     * Moi nha cung cap deu tinh tien theo LAN GOI chu khong theo o, va mot ma tran 1xN re bang
     * mot ma tran 1x1. Cat nho theo tung o la cach chac chan nhat de bien mot toi uu thanh mot
     * hoa don.
     */
    const originIndexes = [...missingOriginIndexes].sort((left, right) => left - right);
    this.matrixCalls += 1;
    const outcome = await this.inner.matrix({
      origins: originIndexes.map((index) => request.origins[index]!),
      destinations: request.destinations,
      truck: request.truck,
      departAt: request.departAt,
    });

    if (!outcome.ok) {
      this.providerFailures += 1;
      return outcome;
    }

    const cells: MatrixCell[] = [];
    for (const cell of outcome.cells) {
      const originIndex = originIndexes[cell.originIndex];
      if (originIndex === undefined) continue;
      if (cell.estimate) {
        this.write(
          pairKey(
            this.providerId,
            request.origins[originIndex]!,
            request.destinations[cell.destinationIndex]!,
            request.truck,
            request.departAt,
          ),
          cell.estimate,
        );
      }
      cells.push({ ...cell, originIndex });
    }

    for (const [key, estimate] of hits) {
      const parts = key.split(':');
      cells.push({
        originIndex: Number(parts[0]),
        destinationIndex: Number(parts[1]),
        estimate,
        failure: null,
      });
    }

    cells.sort(
      (left, right) =>
        left.originIndex - right.originIndex || left.destinationIndex - right.destinationIndex,
    );
    return { ok: true, cells };
  }

  private read(key: string): RouteEstimate | null {
    if (this.policy.routeCacheTtlSeconds <= 0) return null;
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAtMs <= this.now().getTime()) {
      this.entries.delete(key);
      return null;
    }
    // `computedAt` GIU NGUYEN — xem he qua 2 o dau tep.
    return { ...entry.estimate, fromCache: true };
  }

  private write(key: string, estimate: RouteEstimate): void {
    if (this.policy.routeCacheTtlSeconds <= 0) return;
    if (this.entries.size >= this.policy.routeCacheMaxEntries) {
      /*
       * Duoi muc cu nhat ra (thu tu chen cua `Map`), khong phai LRU.
       *
       * LRU can mot cau truc thu hai va mot lan cap nhat moi lan doc. O quy mo vai tram muc song
       * vai phut, khac biet ve ty le trung khong do duoc — con khac biet ve so dong code thi co.
       */
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(key, {
      estimate,
      expiresAtMs: this.now().getTime() + this.policy.routeCacheTtlSeconds * 1000,
    });
  }
}
