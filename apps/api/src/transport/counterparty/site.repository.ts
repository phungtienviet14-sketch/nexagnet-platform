import { randomUUID } from 'node:crypto';
import type { PartyStatus } from '../transport.types.js';
import type { CounterpartySite } from './site.types.js';

export interface CreateCounterpartySiteInput {
  readonly counterpartyId: string;
  readonly name: string;
  readonly address: string | null;
  readonly note: string | null;
  readonly status: PartyStatus;
  readonly recordedBy: string;
}

export interface UpdateCounterpartySiteInput {
  readonly name?: string;
  readonly address?: string | null;
  readonly note?: string | null;
  readonly status?: PartyStatus;
}

/**
 * KHO DIA DIEM VAN HANH (`#267` H1).
 *
 * Nam trong thu muc `counterparty/`, va do la mot phat bieu ve quyen so huu: dia diem la mot MAT
 * cua ho so phap nhan, khong phai mot thuc the cua tang bam vi tri. Tang nhan dang
 * (`transport-site-intake`) DOC kho nay qua mot cong hep va khong bao gio ghi vao no — cung khuon
 * `NO_CROSS_CONTEXT_REPOSITORY_WRITE` da dung o `TransportCheckpointCoreFacts`.
 */
export abstract class CounterpartySiteRepository {
  abstract create(input: CreateCounterpartySiteInput): Promise<CounterpartySite>;
  abstract update(id: string, patch: UpdateCounterpartySiteInput): Promise<CounterpartySite | null>;
  abstract find(id: string): Promise<CounterpartySite | null>;
  abstract findByName(counterpartyId: string, name: string): Promise<CounterpartySite | null>;
  abstract listForCounterparty(counterpartyId: string): Promise<CounterpartySite[]>;
  /** Chi dia diem con hieu luc. Mot kho da nghi khong duoc de nghi cho lai xe. */
  abstract listActive(): Promise<CounterpartySite[]>;
  /** Doc theo lo — tang nhan dang co N hang rao va khong duoc doc N lan. */
  abstract findManyActive(ids: readonly string[]): Promise<CounterpartySite[]>;
}

const byName = (rows: CounterpartySite[]): CounterpartySite[] =>
  [...rows].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

/**
 * Ban trong bo nho — duong chay THAT cua `PERSISTENCE=memory` (demo, CI khong co CSDL).
 *
 * No phai cuong che cung bat bien voi ban Prisma, va o day bat bien do la unique
 * `(counterpartyId, name)`. Neu chi ban Prisma giu no thi mot bai se xanh o che do nay va do o che
 * do kia, va khong ai biet ben nao dang noi that.
 */
export class InMemoryCounterpartySiteRepository extends CounterpartySiteRepository {
  private readonly sites = new Map<string, CounterpartySite>();

  async create(input: CreateCounterpartySiteInput): Promise<CounterpartySite> {
    if (await this.findByName(input.counterpartyId, input.name)) {
      throw new Error(`Dia diem "${input.name}" da co trong phap nhan nay`);
    }
    const now = new Date().toISOString();
    const row: CounterpartySite = {
      id: randomUUID(),
      counterpartyId: input.counterpartyId,
      name: input.name,
      address: input.address,
      note: input.note,
      status: input.status,
      recordedBy: input.recordedBy,
      createdAt: now,
      updatedAt: now,
    };
    this.sites.set(row.id, row);
    return row;
  }

  async update(id: string, patch: UpdateCounterpartySiteInput): Promise<CounterpartySite | null> {
    const current = this.sites.get(id);
    if (!current) return null;
    const next: CounterpartySite = {
      ...current,
      ...(patch.name === undefined ? {} : { name: patch.name }),
      ...(patch.address === undefined ? {} : { address: patch.address }),
      ...(patch.note === undefined ? {} : { note: patch.note }),
      ...(patch.status === undefined ? {} : { status: patch.status }),
      updatedAt: new Date().toISOString(),
    };
    const clash = await this.findByName(next.counterpartyId, next.name);
    if (clash && clash.id !== id) {
      throw new Error(`Dia diem "${next.name}" da co trong phap nhan nay`);
    }
    this.sites.set(id, next);
    return next;
  }

  async find(id: string): Promise<CounterpartySite | null> {
    return this.sites.get(id) ?? null;
  }

  async findByName(counterpartyId: string, name: string): Promise<CounterpartySite | null> {
    for (const site of this.sites.values()) {
      if (site.counterpartyId === counterpartyId && site.name === name) return site;
    }
    return null;
  }

  async listForCounterparty(counterpartyId: string): Promise<CounterpartySite[]> {
    return byName(
      [...this.sites.values()].filter((site) => site.counterpartyId === counterpartyId),
    );
  }

  async listActive(): Promise<CounterpartySite[]> {
    return byName([...this.sites.values()].filter((site) => site.status === 'ACTIVE'));
  }

  async findManyActive(ids: readonly string[]): Promise<CounterpartySite[]> {
    const wanted = new Set(ids);
    return byName(
      [...this.sites.values()].filter((site) => wanted.has(site.id) && site.status === 'ACTIVE'),
    );
  }
}
