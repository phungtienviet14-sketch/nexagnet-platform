import { Inject, Injectable } from '@nestjs/common';
import { TRANSPORT_DISPATCH_POLICY, type TransportDispatchPolicy } from '../dispatch-policy.js';
import {
  HERE_MATRIX_URL,
  HERE_ROUTES_URL,
  buildHereMatrixBody,
  buildHereRouteQuery,
  parseHereMatrix,
  parseHereRouteSummary,
} from './here-truck-routing.js';
import { TransportRoutingPort } from './transport-routing.port.js';
import type {
  MatrixOutcome,
  MatrixRequest,
  RouteOutcome,
  RouteRequest,
  RoutingFailure,
} from './routing.types.js';

/**
 * ADAPTER HERE — phan CO NOI MANG. Chi duoc gan khi khach da cau hinh mot khoa that.
 *
 * ===========================================================================
 * TRANG THAI: SUPPORTED_BY_DOCS / RUNTIME_NOT_PROVEN.
 *
 * Khong mot khoa HERE nao ton tai trong bat ky moi truong nao cua repo nay, va `#277 M11` cam di
 * xin hay mua mot cai (*"Do NOT request/purchase credentials in this lane"*). Nen lop nay CHUA
 * BAO GIO chay that. Phan doi don vi va phan doc ma tran — hai cho de sai nhat — nam trong
 * `here-truck-routing.ts` va CO bai kiem thu ngoai tuyen; phan con lai la mot lan `fetch`.
 *
 * Do la mot phat bieu ve pham vi, khong phai mot loi bao chua. Xem
 * `docs/kien-truc/transport-dispatch-intelligence.md` §4 cho ban so sanh nha cung cap day du.
 *
 * ===========================================================================
 * KHOA KHONG DUOC RO RI, VA CACH CUONG CHE LA CAU TRUC
 *
 * `apiKey` di vao qua ham dung truy van va KHONG BAO GIO di ra: moi duong that bai o day tra ve
 * mot `RoutingFailure` co `detail` la mot cau HANG SO do chinh tep nay viet. Than loi cua HERE,
 * URL da ky, va tieu de HTTP khong co duong nao ra ngoai. `#277 M13`: *"provider
 * credentials/headers never appear in public DTO/logs."*
 */
@Injectable()
export class HereTruckRoutingAdapter extends TransportRoutingPort {
  readonly providerId = 'here-routing-v8';

  constructor(
    private readonly apiKey: string,
    @Inject(TRANSPORT_DISPATCH_POLICY) private readonly policy: TransportDispatchPolicy,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {
    super();
  }

  async route(request: RouteRequest): Promise<RouteOutcome> {
    const query = buildHereRouteQuery(request, this.apiKey);
    const url = `${HERE_ROUTES_URL}?${new URLSearchParams(query).toString()}`;

    const payload = await this.readJson(url, { method: 'GET' });
    if ('failure' in payload) return { ok: false, failure: payload.failure };

    const summary = parseHereRouteSummary(payload.body);
    if (summary === null) {
      return { ok: false, failure: this.failure('ROUTE_NOT_FOUND', 'Khong co tuyen duong bo.') };
    }

    return {
      ok: true,
      estimate: {
        providerId: this.providerId,
        providerProfile: 'here-routing-v8;transportMode=truck',
        quality: 'ROAD_NETWORK',
        roadDistanceMetres: summary.roadDistanceMetres,
        durationSeconds: summary.durationSeconds,
        estimated: true,
        geometry: null,
        computedAt: this.now().toISOString(),
        fromCache: false,
      },
    };
  }

  async matrix(request: MatrixRequest): Promise<MatrixOutcome> {
    const elements = request.origins.length * request.destinations.length;
    if (elements > this.policy.maxMatrixElements) {
      /*
       * CHAN TRUOC KHI GOI RA NGOAI. `#277 M12`: *"no unbounded matrix fan-out."*
       *
       * Tran cua chinh ta dat THAP HON tran cong bo cua nha cung cap, nen he nay khong bao gio la
       * ben phat hien gioi han bang mot loi HTTP giua mot ca dieu xe.
       */
      return {
        ok: false,
        failure: this.failure(
          'REQUEST_BOUND_EXCEEDED',
          `Yeu cau ${elements} o, tran cua chinh sach la ${this.policy.maxMatrixElements}.`,
        ),
      };
    }

    const url = `${HERE_MATRIX_URL}?async=false&apiKey=${encodeURIComponent(this.apiKey)}`;
    const payload = await this.readJson(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildHereMatrixBody(request)),
    });
    if ('failure' in payload) return { ok: false, failure: payload.failure };

    const cells = parseHereMatrix(payload.body, {
      providerId: this.providerId,
      computedAt: this.now().toISOString(),
    });
    if (cells === null) {
      return {
        ok: false,
        failure: this.failure('PROVIDER_UNAVAILABLE', 'Phan hoi ma tran khong dung hinh dang.'),
      };
    }
    return { ok: true, cells };
  }

  /**
   * Mot lan goi mang -> hoac than JSON, hoac mot that bai CO KIEU.
   *
   * `429` tach rieng khoi cac ma loi khac vi hai truong hop nay dan toi hai hanh dong khac nhau:
   * vuot han muc thi cho, con lai thi bao nguoi van hanh. Gop chung lam mot se lam mot su co cau
   * hinh trong y het mot ngay ban.
   */
  private async readJson(
    url: string,
    init: RequestInit,
  ): Promise<{ body: unknown } | { failure: RoutingFailure }> {
    try {
      const response = await this.fetchImpl(url, init);
      if (response.status === 429) {
        return { failure: this.failure('PROVIDER_RATE_LIMITED', 'Vuot han muc nha cung cap.') };
      }
      if (!response.ok) {
        return {
          failure: this.failure(
            'PROVIDER_UNAVAILABLE',
            `Nha cung cap tra ma trang thai ${response.status}.`,
          ),
        };
      }
      return { body: (await response.json()) as unknown };
    } catch {
      /*
       * `catch` KHONG dinh kem doi tuong loi, va do la co y.
       *
       * Than mot loi mang cua `fetch` chua nguyen URL da goi — tuc chua ca `apiKey`. Ghi no vao
       * mot truong se di thang ra DTO va nhat ky. Cai duy nhat con lai dang ghi la SU KIEN
       * "khong goi duoc", va do la thu duy nhat nguoi doc can.
       */
      return { failure: this.failure('PROVIDER_UNAVAILABLE', 'Khong goi duoc nha cung cap.') };
    }
  }

  private failure(reason: RoutingFailure['reason'], detail: string): RoutingFailure {
    return { reason, providerId: this.providerId, detail };
  }
}
