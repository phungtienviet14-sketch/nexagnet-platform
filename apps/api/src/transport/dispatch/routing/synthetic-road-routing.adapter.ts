import { Inject, Injectable } from '@nestjs/common';
import type { GeoPoint } from '../../geo/geo-point.js';
import { greatCircleMetres } from '../../geo/geodesy.js';
import { TRANSPORT_DISPATCH_POLICY, type TransportDispatchPolicy } from '../dispatch-policy.js';
import { TransportRoutingPort } from './transport-routing.port.js';
import type {
  MatrixCell,
  MatrixOutcome,
  MatrixRequest,
  RouteEstimate,
  RouteOutcome,
  RouteRequest,
} from './routing.types.js';

/**
 * BO UOC LUONG TONG HOP — duong MAC DINH khi chua co nha cung cap dinh tuyen nao duoc cau hinh.
 *
 * ===========================================================================
 * NO KHONG GIA VO LA MOT NHA CUNG CAP, VA DO LA DIEU KIEN DE NO TON TAI.
 *
 * Moi ket qua di ra tu day mang `quality: 'SYNTHETIC'`, va nhan do di suot qua service, qua DTO,
 * ra toi cau giai thich ma nguoi dung doc (*"con so la uoc luong tong hop, chua qua nha cung cap
 * dinh tuyen"*). `#277 M5` cho phep dung ho so tong hop cho ban xem truoc/CI voi dung mot dieu
 * kien: *"clearly labeled as synthetic"*.
 *
 * ===========================================================================
 * NO TINH GI, VA CAI DO SAI O DAU
 *
 * Quang duong = cung lon x mot he so duong vong hang so. Do la mot mo hinh THO, va no sai theo
 * mot kieu co the doan truoc:
 *
 *   · SAI IT tren hanh lang co duong cao toc thang (Ha Noi - Hai Phong);
 *   · SAI NHIEU o vung phai vong qua song/nui, noi ty so that co the len 1,8 hoac hon;
 *   · SAI HOAN TOAN khi giua hai diem KHONG CO duong bo (hai bo mot con song khong cau) — o do no
 *     tra ve mot con so trong nhu binh thuong, trong khi cau tra loi dung la "khong co duong".
 *
 * Cai cuoi cung la ly do that su de khong bao gio goi day la mot ket qua duong bo. Mot nha cung
 * cap that tra `ROUTE_NOT_FOUND`; bo nay khong biet de ma tra.
 *
 * Nen no dung duoc cho dung mot viec: XEP HANG mot doi xe trong cung mot vung, noi moi ung vien
 * deu chiu cung mot sai so mo hinh, va nguoi doc da duoc bao rang do la uoc luong.
 */
@Injectable()
export class SyntheticRoadRoutingAdapter extends TransportRoutingPort {
  /**
   * Chuoi nay di thang vao `RouteEstimate.providerId` va ra DTO. No CO Y doc len nghe khong giong
   * mot ten thuong mai nao: khong ai duoc nham mot ket qua tu day voi mot ket qua da mua.
   */
  readonly providerId = 'synthetic-detour-v1';

  constructor(
    @Inject(TRANSPORT_DISPATCH_POLICY) private readonly policy: TransportDispatchPolicy,
    /** Dong ho tiem vao — de mot bai kiem thu lap lai duoc `computedAt`. */
    private readonly now: () => Date = () => new Date(),
  ) {
    super();
  }

  route(request: RouteRequest): Promise<RouteOutcome> {
    return Promise.resolve({
      ok: true,
      estimate: this.estimate(request.origin, request.destination),
    });
  }

  matrix(request: MatrixRequest): Promise<MatrixOutcome> {
    const elements = request.origins.length * request.destinations.length;
    if (elements > this.policy.maxMatrixElements) {
      return Promise.resolve({
        ok: false,
        failure: {
          reason: 'REQUEST_BOUND_EXCEEDED',
          providerId: this.providerId,
          detail: `Yeu cau ${elements} o, tran cua chinh sach la ${this.policy.maxMatrixElements}.`,
        },
      });
    }

    const cells: MatrixCell[] = [];
    request.origins.forEach((origin, originIndex) => {
      request.destinations.forEach((destination, destinationIndex) => {
        cells.push({
          originIndex,
          destinationIndex,
          estimate: this.estimate(origin, destination),
          failure: null,
        });
      });
    });
    return Promise.resolve({ ok: true, cells });
  }

  private estimate(origin: GeoPoint, destination: GeoPoint): RouteEstimate {
    const straight = greatCircleMetres(origin, destination);
    const roadDistanceMetres = Math.round(straight * this.policy.syntheticDetourFactor);
    const speed = this.policy.syntheticAverageSpeedMetresPerSecond;
    return {
      providerId: this.providerId,
      providerProfile: `detour=${this.policy.syntheticDetourFactor};speed=${speed}`,
      quality: 'SYNTHETIC',
      roadDistanceMetres,
      durationSeconds: Math.round(roadDistanceMetres / speed),
      estimated: true,
      // Bo nay khong co hinh duong di, va khong bia ra mot duong thang goi la "tuyen duong".
      geometry: null,
      computedAt: this.now().toISOString(),
      fromCache: false,
    };
  }
}
