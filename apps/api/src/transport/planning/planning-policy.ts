import { loadTenantConfig } from '@netviet/tenant';
import type { Depot, RunGrouping, TransportPlanningPolicy } from './planning.types.js';

/**
 * CHINH SACH LAP KE HOACH — doc tu goi khach, khong tu mot hang so trong ma.
 *
 * Cung khuon voi `transport-policy.ts`: mot ham doc goi khach + mot token DI. Khong `if (tenant
 * === ...)` o bat cu dau — `#276` L1 viet ro *"The policy is tenant/domain configuration, not an
 * `if tenant === ...` branch."*
 */

export const TRANSPORT_PLANNING_POLICY = Symbol('TRANSPORT_PLANNING_POLICY');

/**
 * MAC DINH LA CAI KHONG DOI GI.
 *
 * `#276` L1 doi *"safe default must preserve current behavior for existing deployments"*. Hom nay
 * khong khach nao co lan lap ke hoach nao gom hai don vao mot vong chay, nen mac dinh phai la che
 * do khong bao gio gom. Mot khach nang cap phien ban ma khong doi cau hinh se khong thay hanh vi
 * nao khac di.
 */
export const DEFAULT_RUN_GROUPING: RunGrouping = 'ONE_ORDER_PER_RUN';

/**
 * KHONG CO MAC DINH CHO NGUONG NGHI, va do la cau tra loi trung thuc.
 *
 * `#276` L4: *"do not invent a financial meaning ... use a clearly synthetic preview value, not a
 * hidden magic constant."* Khong nguon nao noi mot chiec xe nghi bao lau thi coi la het vong chay.
 * `null` = khong bao gio dong vi het gio; chi con duong dong khi xe ve bai.
 */
export const DEFAULT_RUN_CLOSURE_IDLE_HOURS: number | null = null;

export function tenantTransportPlanningPolicy(): TransportPlanningPolicy {
  const configured = loadTenantConfig().policies.transportPlanning;
  return {
    grouping: configured?.runGrouping ?? DEFAULT_RUN_GROUPING,
    depots: configured?.depots ?? [],
    closure: { idleHours: configured?.closure?.idleHours ?? DEFAULT_RUN_CLOSURE_IDLE_HOURS },
  };
}

/* ------------------------------------------------------------------ *
 * BAI XE
 * ------------------------------------------------------------------ */

/**
 * KET QUA giai bai xe. BA nhanh, va khong nhanh nao la mot `Depot | null` gop lai:
 *
 *   · `RESOLVED`        — dung mot bai dang hoat dong;
 *   · `NOT_CONFIGURED`  — khach chua khai bai nao. HOP LE: ke hoach bat dau ngay tai diem lay hang
 *                         va khong sinh chang rong nao (`#276` L4 cam bia di chuyen);
 *   · `AMBIGUOUS`       — khach khai tu hai bai dang hoat dong tro len. `#276` L5 chot ho so hom
 *                         nay la MOT bai, nen doan bua mot cai se sinh nhung chang rong xuat phat
 *                         tu mot noi ma xe chua bao gio dau.
 *
 * Gop `AMBIGUOUS` vao `null` la kieu hong te nhat co the o cho nay: he thong se lang le lam dung
 * cai no khong duoc phep doan, va bao cao km rong sau do khong con doi chieu duoc voi thuc te.
 */
export type DepotResolution =
  | { readonly kind: 'RESOLVED'; readonly depot: Depot }
  | { readonly kind: 'NOT_CONFIGURED' }
  | { readonly kind: 'AMBIGUOUS'; readonly codes: readonly string[] };

export function resolveDepot(policy: TransportPlanningPolicy): DepotResolution {
  const active = policy.depots.filter((depot) => depot.active !== false);
  if (active.length === 0) return { kind: 'NOT_CONFIGURED' };
  if (active.length > 1) {
    return { kind: 'AMBIGUOUS', codes: active.map((depot) => depot.code) };
  }
  const only = active[0];
  if (only === undefined) return { kind: 'NOT_CONFIGURED' };
  return { kind: 'RESOLVED', depot: { code: only.code, label: only.label } };
}

/**
 * Bai xe dung duoc cho khau lap ke hoach, hoac `null`.
 *
 * `AMBIGUOUS` tra `null` O DAY chu khong nem: khong biet xe xuat phat tu dau la mot ly do de
 * KHONG sinh chang rong, khong phai mot ly do de tu choi ca lan lap ke hoach. Don van phai duoc
 * len ke hoach; cai mat di la mot chang rong ma dang nao he thong cung khong duoc phep doan.
 * Nguoi goi ghi `DEPOT_AMBIGUOUS` vao so quyet dinh de van hanh nhin thay va di sua cau hinh.
 */
export function usableDepot(resolution: DepotResolution): Depot | null {
  return resolution.kind === 'RESOLVED' ? resolution.depot : null;
}

/* ------------------------------------------------------------------ *
 * SO SANH DIA DIEM
 * ------------------------------------------------------------------ */

/**
 * HAI NHAN CO CHI CUNG MOT CHO KHONG — cong duy nhat quyet dinh co sinh chang rong hay khong.
 *
 * `#276` L9 bai 9 doi: *"no movement required (same accepted site) does not fabricate nonzero
 * empty distance"*. Hom nay diem dau/cuoi cua chang la NHAN BANG CHU (`originLabel`), khong phai
 * mot khoa dia diem — nen phep so sanh trung thuc nhat co the la so sanh chuoi da chuan hoa:
 * bo khoang thua, gop khoang trang, khong phan biet hoa thuong.
 *
 * KHONG bo dau tieng Viet: lam vay se gop "Ha Noi" va "Hà Nội" thanh mot, va do la mot phep doan
 * ve dia ly ma lane nay khong co nguon. Sai theo huong KHONG gop lai an toan hon — no sinh ra mot
 * chang rong thua ma nguoi doc nhin thay va sua duoc, thay vi nuot mat mot di chuyen that.
 *
 * Khi Lane M mang ve mot khoa dia diem/toa do that, cong nay doi hien thuc — khong doi chu ky.
 */
export function sameSite(left: string, right: string): boolean {
  return normaliseSite(left) === normaliseSite(right);
}

const normaliseSite = (value: string): string =>
  value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');
