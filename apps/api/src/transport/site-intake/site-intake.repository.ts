import { randomUUID } from 'node:crypto';
import type { BusinessDate } from '../business-date.js';
import { storageUniqueViolation } from '../proof/proof-storage-conflict.js';
import type { UniqueIndexRef } from '../storage-conflict.js';
import type { RunSiteIntake, SiteIntakeLocationTrust } from './site-intake.types.js';

/**
 * HAI UNIQUE cua `transport-site-intake` — DANH SACH thuoc ve capability nay, CO CHE nhan dien nam
 * o `../storage-conflict.js`.
 *
 * Moi muc khai CA `indexName` LAN cap `(model, column)`: Prisma khong phoi ten index ra ngoai ma
 * doi nguoc ten constraint thanh TEN TRUONG. Bai hoc do da ton mot vong CI o T2.1 va duoc mang
 * nguyen sang day.
 */

/**
 * KHOA CHONG LAP. `column` la `clientEventId` chu khong `driverId`: voi mot unique KEP, Prisma bao
 * ca hai ten truong trong `meta.target`, va `clientEventId` la ten khong dung chung voi mot unique
 * nao khac cua bang — nen no phan biet duoc, con `driverId` thi khong.
 */
export const SITE_INTAKE_DRIVER_EVENT: UniqueIndexRef = {
  indexName: 'TransportRunSiteIntake_driver_event_key',
  model: 'TransportRunSiteIntake',
  column: 'clientEventId',
};

/** MOT ban dinh vi phuc vu NHIEU NHAT mot lan nhan viec — cung khuon `CHECKPOINT_OBSERVATION_ONCE`. */
export const SITE_INTAKE_OBSERVATION_ONCE: UniqueIndexRef = {
  indexName: 'TransportRunSiteIntake_observationId_key',
  model: 'TransportRunSiteIntake',
  column: 'observationId',
};

export interface CreateRunSiteIntakeInput {
  readonly runId: string;
  readonly legId: string;
  readonly siteId: string;
  readonly driverId: string;
  readonly confirmedBy: string;
  readonly locationTrust: SiteIntakeLocationTrust;
  readonly observationId: string | null;
  readonly distanceMetres: number | null;
  readonly clientEventId: string;
  readonly confirmedAt: Date;
  readonly businessDate: BusinessDate;
}

/**
 * KHO cua lan xac nhan tai dia diem A (`#267` H3/H4).
 *
 * KHONG CO `update` VA KHONG CO `delete`, va do la mot phat bieu chu khong phai mot thieu sot: mot
 * lan xac nhan la mot viec DA XAY RA. Trigger `transport_run_site_intake_append_only` chan hai
 * lenh do o tang luu tru; o day khong co ham de goi chung.
 */
export abstract class RunSiteIntakeRepository {
  abstract create(input: CreateRunSiteIntakeInput): Promise<RunSiteIntake>;
  /** Tra cuu chong lap. Khoa la `(driverId, clientEventId)` — xem migration. */
  abstract findByEvent(driverId: string, clientEventId: string): Promise<RunSiteIntake | null>;
  abstract findByRun(runId: string): Promise<RunSiteIntake | null>;
  abstract listForDriver(driverId: string): Promise<readonly RunSiteIntake[]>;
}

/**
 * Ban trong bo nho — duong chay THAT cua `PERSISTENCE=memory`.
 *
 * No phai cuong che CUNG bat bien voi Postgres, va o day bat bien do la hai unique. Neu chi ban
 * Prisma giu chung thi bai chong lap se xanh o che do nay va do o che do kia — va bai chong lap
 * chinh la bai ma `#267` H3 doi phai chung minh.
 */
export class InMemoryRunSiteIntakeRepository extends RunSiteIntakeRepository {
  private readonly rows = new Map<string, RunSiteIntake>();

  private static eventKey(driverId: string, clientEventId: string): string {
    return `${driverId}::${clientEventId}`;
  }

  async create(input: CreateRunSiteIntakeInput): Promise<RunSiteIntake> {
    if (await this.findByEvent(input.driverId, input.clientEventId)) {
      throw storageUniqueViolation(SITE_INTAKE_DRIVER_EVENT);
    }
    if (input.observationId !== null) {
      for (const row of this.rows.values()) {
        if (row.observationId === input.observationId) {
          throw storageUniqueViolation(SITE_INTAKE_OBSERVATION_ONCE);
        }
      }
    }
    const row: RunSiteIntake = { id: randomUUID(), ...input };
    this.rows.set(row.id, row);
    return row;
  }

  async findByEvent(driverId: string, clientEventId: string): Promise<RunSiteIntake | null> {
    const wanted = InMemoryRunSiteIntakeRepository.eventKey(driverId, clientEventId);
    for (const row of this.rows.values()) {
      if (InMemoryRunSiteIntakeRepository.eventKey(row.driverId, row.clientEventId) === wanted) {
        return row;
      }
    }
    return null;
  }

  async findByRun(runId: string): Promise<RunSiteIntake | null> {
    for (const row of this.rows.values()) if (row.runId === runId) return row;
    return null;
  }

  async listForDriver(driverId: string): Promise<readonly RunSiteIntake[]> {
    return [...this.rows.values()]
      .filter((row) => row.driverId === driverId)
      .sort((left, right) => right.confirmedAt.getTime() - left.confirmedAt.getTime());
  }
}
