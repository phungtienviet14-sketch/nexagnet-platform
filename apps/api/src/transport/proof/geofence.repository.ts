import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../../config/prisma.service.js';
import type { CircleGeofence } from '../geo/geofence.js';

/**
 * `COUNTERPARTY_SITE` la gia tri cua `#267` H1: hang rao cua mot DIA DIEM VAN HANH
 * (`TransportCounterpartySite`) — kho/nha may cua mot phap nhan.
 *
 * `CUSTOMER` khong dung duoc cho viec do: `subjectId` cua no tro toi `TransportCustomer`, con A la
 * mot phap nhan co the chua bao gio thue B mot chuyen nao. `AD_HOC` cung khong: hang rao cua mot
 * kho co that thuoc ve mot cho co that.
 */
export type GeofenceSubjectKind =
  'CUSTOMER' | 'FUEL_SUPPLIER' | 'DEPOT' | 'AD_HOC' | 'COUNTERPARTY_SITE';

export interface Geofence {
  readonly id: string;
  readonly label: string;
  readonly subjectKind: GeofenceSubjectKind;
  readonly subjectId: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusMetres: number;
  readonly note: string | null;
  readonly recordedBy: string;
}

export interface RegisterGeofenceInput {
  readonly label: string;
  readonly subjectKind: GeofenceSubjectKind;
  readonly subjectId: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusMetres: number;
  readonly note: string | null;
  readonly recordedBy: string;
}

/**
 * KHO HANG RAO DIA LY.
 *
 * `assessGeofences()` la mot ham THUAN — no nhan mot danh sach hang rao va tra ve phan quyet. Kho
 * nay la thu duy nhat tra loi cau "danh sach do o dau ra", va truoc khi no ton tai thi moi lan goi
 * deu nhan mot mang RONG. Hau qua khong phai la mot loi bao ra: moi chung cu deu bao
 * `NO_GEOFENCE_CONFIGURED`, tuc he thong tra loi "chua ai khai hang rao nao" cho ca nhung khach da
 * khai — mot cau tra loi sai ma trong nhu mot cau tra loi that.
 *
 * `toCircle()` la ranh gioi giua hai the gioi: kho biet `status`, `label`, `recordedBy`; hinh hoc
 * chi duoc thay ba so. Giu nguyen ranh gioi do thi `assessGeofences` khong bao gio phu thuoc vao
 * mot cot trong bang.
 */
export abstract class GeofenceRepository {
  /** Chi hang rao con hieu luc. Mot hang rao da nghi khong duoc lang le keo phan quyet ve INSIDE. */
  abstract listActive(): Promise<readonly Geofence[]>;
  abstract register(input: RegisterGeofenceInput): Promise<Geofence>;
}

export function toCircle(fence: Geofence): CircleGeofence {
  return {
    id: fence.id,
    centre: { latitude: fence.latitude, longitude: fence.longitude },
    radiusMetres: fence.radiusMetres,
  };
}

export class InMemoryGeofenceRepository extends GeofenceRepository {
  private readonly fences = new Map<string, Geofence>();

  async listActive(): Promise<readonly Geofence[]> {
    return [...this.fences.values()];
  }

  async register(input: RegisterGeofenceInput): Promise<Geofence> {
    const fence: Geofence = { id: randomUUID(), ...input };
    this.fences.set(fence.id, fence);
    return fence;
  }
}

@Injectable()
export class PrismaGeofenceRepository extends GeofenceRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listActive(): Promise<readonly Geofence[]> {
    const rows = await this.prisma.transportGeofence.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toGeofence);
  }

  async register(input: RegisterGeofenceInput): Promise<Geofence> {
    const row = await this.prisma.transportGeofence.create({
      data: {
        label: input.label,
        subjectKind: input.subjectKind,
        subjectId: input.subjectId,
        latitude: input.latitude,
        longitude: input.longitude,
        radiusMetres: input.radiusMetres,
        note: input.note,
        recordedBy: input.recordedBy,
      },
    });
    return toGeofence(row);
  }
}

interface GeofenceRow {
  readonly id: string;
  readonly label: string;
  readonly subjectKind: GeofenceSubjectKind;
  readonly subjectId: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusMetres: number;
  readonly note: string | null;
  readonly recordedBy: string;
}

function toGeofence(row: GeofenceRow): Geofence {
  return {
    id: row.id,
    label: row.label,
    subjectKind: row.subjectKind,
    subjectId: row.subjectId,
    latitude: row.latitude,
    longitude: row.longitude,
    radiusMetres: row.radiusMetres,
    note: row.note,
    recordedBy: row.recordedBy,
  };
}
