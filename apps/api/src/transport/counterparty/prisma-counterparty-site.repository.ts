import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../../config/prisma.service.js';
import type { PartyStatus } from '../transport.types.js';
import {
  CounterpartySiteRepository,
  type CreateCounterpartySiteInput,
  type UpdateCounterpartySiteInput,
} from './site.repository.js';
import type { CounterpartySite } from './site.types.js';

/** Kieu tho tu Prisma — chi lay nhung cot ma mien nay doc. */
interface SiteRow {
  id: string;
  counterpartyId: string;
  name: string;
  address: string | null;
  status: string;
  note: string | null;
  recordedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const toSite = (row: SiteRow): CounterpartySite => ({
  id: row.id,
  counterpartyId: row.counterpartyId,
  name: row.name,
  address: row.address,
  status: row.status as PartyStatus,
  note: row.note,
  recordedBy: row.recordedBy,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** Sap theo TEN roi `id`: hai lan doc cho ra cung mot chuoi, nen bai test khang dinh duoc noi dung. */
const ORDER = [{ name: 'asc' }, { id: 'asc' }] as const;

@Injectable()
export class PrismaCounterpartySiteRepository extends CounterpartySiteRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: CreateCounterpartySiteInput): Promise<CounterpartySite> {
    const row = await this.prisma.transportCounterpartySite.create({
      data: {
        counterpartyId: input.counterpartyId,
        name: input.name,
        address: input.address,
        note: input.note,
        status: input.status,
        recordedBy: input.recordedBy,
      },
    });
    return toSite(row);
  }

  async update(id: string, patch: UpdateCounterpartySiteInput): Promise<CounterpartySite | null> {
    const current = await this.prisma.transportCounterpartySite.findUnique({ where: { id } });
    if (!current) return null;
    const row = await this.prisma.transportCounterpartySite.update({
      where: { id },
      data: {
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.address === undefined ? {} : { address: patch.address }),
        ...(patch.note === undefined ? {} : { note: patch.note }),
        ...(patch.status === undefined ? {} : { status: patch.status }),
      },
    });
    return toSite(row);
  }

  async find(id: string): Promise<CounterpartySite | null> {
    const row = await this.prisma.transportCounterpartySite.findUnique({ where: { id } });
    return row ? toSite(row) : null;
  }

  async findByName(counterpartyId: string, name: string): Promise<CounterpartySite | null> {
    const row = await this.prisma.transportCounterpartySite.findUnique({
      where: { counterpartyId_name: { counterpartyId, name } },
    });
    return row ? toSite(row) : null;
  }

  async listForCounterparty(counterpartyId: string): Promise<CounterpartySite[]> {
    const rows = await this.prisma.transportCounterpartySite.findMany({
      where: { counterpartyId },
      orderBy: [...ORDER],
    });
    return rows.map(toSite);
  }

  async listActive(): Promise<CounterpartySite[]> {
    const rows = await this.prisma.transportCounterpartySite.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [...ORDER],
    });
    return rows.map(toSite);
  }

  /**
   * MOT truy van cho N hang rao. Doc tung cai mot se lam so lan cham DB ty le voi so hang rao da
   * khai — mot chi phi khong ai thay tren may dev va thay rat ro tren mot khach co 200 kho.
   */
  async findManyActive(ids: readonly string[]): Promise<CounterpartySite[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.transportCounterpartySite.findMany({
      where: { id: { in: [...new Set(ids)] }, status: 'ACTIVE' },
      orderBy: [...ORDER],
    });
    return rows.map(toSite);
  }
}
