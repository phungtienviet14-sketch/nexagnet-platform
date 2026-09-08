import type { TransportDispatchPolicy } from '../dispatch-policy.js';
import { CachedRoutingAdapter } from './cached-routing.adapter.js';
import { HereTruckRoutingAdapter } from './here-truck-routing.adapter.js';
import { SyntheticRoadRoutingAdapter } from './synthetic-road-routing.adapter.js';
import { TransportRoutingPort } from './transport-routing.port.js';

/**
 * CHON NHA CUNG CAP DINH TUYEN — mot ham thuan tren mot ban do bien moi truong.
 *
 * ===========================================================================
 * MAC DINH LA "CHUA CO NHA CUNG CAP", VA DO LA MOT PHAT BIEU DUNG
 *
 * Khong moi truong nao cua repo nay co mot khoa dinh tuyen, va `#277 M11` cam di xin mot cai. Nen
 * duong mac dinh la bo uoc luong TONG HOP — no chay ngoai tuyen, tat dinh, mien phi, va moi con
 * so cua no mang nhan `SYNTHETIC` di suot toi man hinh.
 *
 * Doi sang HERE la mot lua chon CO CHU DICH cua nguoi van hanh: dat `TRANSPORT_ROUTING_PROVIDER`
 * VA cung cap mot khoa. Thieu mot trong hai thi ta quay ve duong tong hop VA khong im lang: mot
 * cau hinh nua voi la mot su co, khong phai mot mac dinh.
 *
 * ===========================================================================
 * VI SAO DOC `process.env` THAY VI `loadFoundationEnv()`
 *
 * `foundation-env.ts` la lop bien cua NEN TANG: no kiem nhung bien ma MOI khach deu phai co
 * (`AUTH_MODE`, `CHANNEL_MODE`, `PERSISTENCE`). Khoa cua mot nha cung cap ban do la mot bien cua
 * MOT capability, tuy chon, va hom nay khong khach nao dat.
 *
 * Nhoi no vao lop nen tang co hai gia phai tra: moi khach — ke ca khach chi ban hang qua Zalo —
 * mang them mot truong ve mot dich vu ban do trong lop cau hinh cua ho; va moi bai kiem thu boot
 * cua nen tang phai biet ve mot khai niem cua mien van tai. Doc tai cho, kiem tai cho, va NOI RO
 * o day la ranh gioi dung.
 *
 * Ham nay khong bao gio GHI khoa ra dau: no truyen thang vao adapter, va adapter khong dua khoa
 * vao mot thong bao loi nao (`#277 M13`).
 */

export type RoutingProviderChoice = 'synthetic' | 'here';

export interface RoutingProviderEnv {
  readonly TRANSPORT_ROUTING_PROVIDER?: string;
  readonly HERE_API_KEY?: string;
}

export interface RoutingProviderSelection {
  readonly provider: RoutingProviderChoice;
  /**
   * `null` khi lua chon la duong mac dinh; mot MA LY DO khi nguoi van hanh xin mot nha cung cap ma
   * he thong khong dung duoc. Chuoi nay di vao nhat ky khoi dong — no khong bao gio chua khoa.
   */
  readonly degradedReason: 'HERE_API_KEY_MISSING' | 'PROVIDER_UNKNOWN' | null;
}

export function selectRoutingProvider(env: RoutingProviderEnv): RoutingProviderSelection {
  const requested = (env.TRANSPORT_ROUTING_PROVIDER ?? '').trim().toLowerCase();
  if (requested === '' || requested === 'synthetic') {
    return { provider: 'synthetic', degradedReason: null };
  }
  if (requested === 'here') {
    const key = (env.HERE_API_KEY ?? '').trim();
    if (key === '') return { provider: 'synthetic', degradedReason: 'HERE_API_KEY_MISSING' };
    return { provider: 'here', degradedReason: null };
  }
  return { provider: 'synthetic', degradedReason: 'PROVIDER_UNKNOWN' };
}

/**
 * Dung cong dinh tuyen dang chay — LUON boc trong lop dem.
 *
 * Lop dem boc ca duong tong hop du duong do khong ton mot dong nao: no la cho DUY NHAT dem so lan
 * goi (`stats()`), va `#277 M12` doi *"instrumentation for provider call count/latency/failure"*.
 * Boc co dieu kien se lam so do bien mat dung o cau hinh mac dinh — tuc o moi ban xem truoc.
 */
export function createRoutingPort(
  policy: TransportDispatchPolicy,
  env: RoutingProviderEnv,
  fetchImpl: typeof fetch = fetch,
): TransportRoutingPort {
  const selection = selectRoutingProvider(env);
  const inner =
    selection.provider === 'here'
      ? new HereTruckRoutingAdapter((env.HERE_API_KEY ?? '').trim(), policy, fetchImpl)
      : new SyntheticRoadRoutingAdapter(policy);
  return new CachedRoutingAdapter(inner, policy);
}
