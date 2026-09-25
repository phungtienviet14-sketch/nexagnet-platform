import { Inject, Injectable } from '@nestjs/common';
import type { GeoPoint } from '../geo/geo-point.js';
import { TRANSPORT_PLANNING_POLICY } from './planning-policy.js';
import type { TransportPlanningPolicy } from './planning.types.js';

/**
 * DANH BA BAI XE — mot cong cua `transport-core` (`#395`).
 *
 * Truoc #395 khau lap ke hoach, dong vong chay va luot quet doc bai xe tu MOT cho duy nhat: cau hinh
 * goi khach (`TRANSPORT_PLANNING_POLICY.depots`), nap mot lan luc khoi dong. Tu #395 Giam doc khai
 * bai xe tren man hinh "Dia diem van hanh" — tuc mot hang rao `DEPOT`, thuoc `transport-proof`.
 *
 * `transport-core` KHONG duoc phu thuoc `transport-proof` (mot khach chi bat core van phai chay), nen
 * chieu phu thuoc bi dao, dung khuon `RunClosureBlockerSource`: core khai CONG + mac dinh doc cau
 * hinh; `transport-proof` DANG KY nguon duoc quan ly vao `DepotDirectoryHub` trong ham dung cua mot
 * provider thuoc module cua no. Luat uu tien (co hang rao DEPOT nao thi nguon quan ly la su that)
 * nam trong nguon do, khong o day.
 *
 * S0 chi dung CONG. Khau lap ke hoach / dong vong chay chua doc no — lan noi day la viec cua lat sau.
 */

export type DepotSource = 'MANAGED' | 'TENANT_CONFIG';

export interface DepotEntry {
  /** Ma on dinh cua bai, vd `DEPOT-HN` — voi nguon quan ly la `subjectId` cua hang rao. */
  readonly code: string;
  /** Nhan dung lam diem dau/cuoi chang rong va so khop dong vong chay. */
  readonly label: string;
  readonly active: boolean;
  readonly source: DepotSource;
  /** Chi nguon quan ly co: hang rao cua bai. */
  readonly geofenceId?: string;
  readonly point?: GeoPoint;
  readonly radiusMetres?: number;
}

export abstract class DepotDirectory {
  abstract list(): Promise<readonly DepotEntry[]>;
}

/** Bai xe tu cau hinh goi khach — dung nhu hanh vi truoc #395. */
export class ConfigDepotDirectory extends DepotDirectory {
  constructor(private readonly policy: TransportPlanningPolicy) {
    super();
  }

  async list(): Promise<readonly DepotEntry[]> {
    return this.policy.depots.map((depot) => ({
      code: depot.code,
      label: depot.label,
      active: depot.active !== false,
      source: 'TENANT_CONFIG' as const,
    }));
  }
}

/**
 * CHO DANG KY nguon bai xe. Khong ai dang ky (khach khong bat `transport-proof`, hoac mot spec dung
 * `TransportModule` tran) thi doc cau hinh — dung nhu truoc #395.
 *
 * `register()` NEM khi da co nguon: hai nguon tra loi "bai xe nao dang bat" thi cai dang ky sau se
 * lang le thang, va do la mot loi composition phai lo ngay luc khoi dong.
 */
@Injectable()
export class DepotDirectoryHub extends DepotDirectory {
  private readonly fallback: DepotDirectory;
  private registered: DepotDirectory | null = null;

  constructor(@Inject(TRANSPORT_PLANNING_POLICY) policy: TransportPlanningPolicy) {
    super();
    this.fallback = new ConfigDepotDirectory(policy);
  }

  register(source: DepotDirectory): void {
    if (this.registered !== null) {
      throw new Error('Da co mot nguon bai xe duoc dang ky — hai cau tra loi cho mot cau hoi');
    }
    this.registered = source;
  }

  list(): Promise<readonly DepotEntry[]> {
    return (this.registered ?? this.fallback).list();
  }
}
