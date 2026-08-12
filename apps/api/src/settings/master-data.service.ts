import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import {
  importedDealerSchema,
  importedDealSchema,
  parseMasterDataImport,
  type MasterDataImportInput,
} from './master-data-import.js';
import {
  buildMasterDataImportPreview,
  type MasterDataImportPreview,
  type MasterDataPreviewRow,
  type MasterDataSnapshot,
} from './master-data-preview.js';

type PersistenceMode = 'memory' | 'prisma';

type RuntimePrisma = {
  dealer: {
    findMany(args?: unknown): Promise<unknown[]>;
    findUnique(args: unknown): Promise<unknown | null>;
    upsert(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
  dealerPriceOverride: {
    findMany(args?: unknown): Promise<unknown[]>;
    findUnique(args: unknown): Promise<unknown | null>;
    upsert(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
  group: {
    findMany(args?: unknown): Promise<unknown[]>;
    findUnique?(args: unknown): Promise<unknown | null>;
    upsert(args: unknown): Promise<unknown>;
  };
  groupMappingHistory: {
    create(args: unknown): Promise<unknown>;
  };
  product: {
    findMany(args?: unknown): Promise<unknown[]>;
  };
  $transaction<T>(operations: readonly Promise<T>[]): Promise<T[]>;
};

type KnowledgeReloader = { reload(): Promise<unknown> | unknown };
type AuditAppender = {
  append(command: {
    actor: string;
    action: string;
    entityType: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
    requestId?: string | null;
  }): Promise<unknown> | unknown;
};

export interface MasterDataApplyInput extends MasterDataImportInput {
  previewToken: string;
  confirmed: boolean;
}

const applyInputSchema = z
  .object({
    format: z.enum(['xlsx', 'csv', 'json']),
    encoding: z.enum(['base64', 'utf8']),
    content: z.string().min(1),
    filename: z.string().trim().min(1).max(255).optional(),
    previewToken: z.string().regex(/^[a-f0-9]{64}$/i),
    confirmed: z.literal(true),
  })
  .strict();

@Injectable()
export class MasterDataService {
  constructor(
    private readonly prisma: RuntimePrisma,
    private readonly knowledge: KnowledgeReloader,
    private readonly audit: AuditAppender,
    private readonly persistence: PersistenceMode = 'prisma',
  ) {}

  async list(): Promise<MasterDataSnapshot & { unmappedGroups: MasterDataSnapshot['groups'] }> {
    this.requirePrisma();
    const [dealers, deals, groups, products] = await Promise.all([
      this.prisma.dealer.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.dealerPriceOverride.findMany({ orderBy: [{ dealerId: 'asc' }, { sku: 'asc' }] }),
      this.prisma.group.findMany({ orderBy: [{ status: 'asc' }, { name: 'asc' }] }),
      this.prisma.product.findMany({ select: { sku: true }, orderBy: { sku: 'asc' } }),
    ]);
    const snapshot = toSnapshot(dealers, deals, groups, products);
    return {
      ...snapshot,
      unmappedGroups: snapshot.groups.filter((group) => group.status !== 'mapped' || !group.dealerId),
    };
  }

  async previewImport(input: unknown): Promise<MasterDataImportPreview> {
    this.requirePrisma();
    const parsed = await parseMasterDataImport(input);
    const current = await this.list();
    return buildMasterDataImportPreview(parsed, current);
  }

  async applyImport(
    input: unknown,
    actor: string,
    requestId: string | null,
  ): Promise<{ applied: number; previewToken: string }> {
    this.requirePrisma();
    const command = applyInputSchema.safeParse(input);
    if (!command.success) throw new BadRequestException('Import apply payload không hợp lệ');
    const parsed = await parseMasterDataImport(importPayload(command.data));
    const current = await this.list();
    const preview = buildMasterDataImportPreview(parsed, current);
    if (preview.previewToken !== command.data.previewToken) {
      throw new ConflictException('Preview token không còn khớp với dữ liệu hiện tại');
    }
    if (!preview.valid) throw new BadRequestException('File import còn lỗi, không thể apply');

    const operations = preview.rows
      .filter((row) => row.action === 'create' || row.action === 'update')
      .map((row) => this.operationForRow(row));
    await this.prisma.$transaction(operations);
    await this.audit.append({
      actor,
      action: 'master_data.import.apply',
      entityType: 'master_data',
      before: { previewToken: command.data.previewToken },
      after: { applied: operations.length },
      requestId,
    });
    await this.knowledge.reload();
    return { applied: operations.length, previewToken: preview.previewToken };
  }

  async disableDealer(id: string, actor: string, requestId: string | null): Promise<void> {
    this.requirePrisma();
    const before = await this.prisma.dealer.findUnique({ where: { id } });
    if (!before) throw new BadRequestException('Không tìm thấy đại lý');
    const after = await this.prisma.dealer.update({ where: { id }, data: { status: 'inactive' } });
    await this.audit.append({
      actor,
      action: 'master_data.dealer.disable',
      entityType: 'dealer',
      entityId: id,
      before,
      after,
      requestId,
    });
    await this.knowledge.reload();
  }

  async saveDealer(
    id: string,
    body: unknown,
    actor: string,
    requestId: string | null,
  ): Promise<unknown> {
    this.requirePrisma();
    const parsed = importedDealerSchema.safeParse({ ...(body as object), id });
    if (!parsed.success) throw new BadRequestException('Dữ liệu đại lý không hợp lệ');
    const before = await this.prisma.dealer.findUnique({ where: { id } });
    const after = await this.prisma.dealer.upsert({
      where: { id },
      create: parsed.data,
      update: parsed.data,
    });
    await this.audit.append({
      actor,
      action: 'master_data.dealer.save',
      entityType: 'dealer',
      entityId: id,
      before,
      after,
      requestId,
    });
    await this.knowledge.reload();
    return after;
  }

  async disableDeal(id: string, actor: string, requestId: string | null): Promise<void> {
    this.requirePrisma();
    const before = await this.prisma.dealerPriceOverride.findUnique({ where: { id } });
    if (!before) throw new BadRequestException('Không tìm thấy deal riêng');
    const after = await this.prisma.dealerPriceOverride.update({
      where: { id },
      data: { enabled: false },
    });
    await this.audit.append({
      actor,
      action: 'master_data.deal.disable',
      entityType: 'dealer_price_override',
      entityId: id,
      before,
      after,
      requestId,
    });
    await this.knowledge.reload();
  }

  async saveDeal(
    id: string,
    body: unknown,
    actor: string,
    requestId: string | null,
  ): Promise<unknown> {
    this.requirePrisma();
    const parsed = importedDealSchema.safeParse({ ...(body as object), id });
    if (!parsed.success) throw new BadRequestException('Dữ liệu deal riêng không hợp lệ');
    const before = await this.prisma.dealerPriceOverride.findUnique({ where: { id } });
    const after = await this.prisma.dealerPriceOverride.upsert({
      where: { id },
      create: parsed.data,
      update: parsed.data,
    });
    await this.audit.append({
      actor,
      action: 'master_data.deal.save',
      entityType: 'dealer_price_override',
      entityId: id,
      before,
      after,
      requestId,
    });
    await this.knowledge.reload();
    return after;
  }

  private requirePrisma(): void {
    if (this.persistence !== 'prisma') {
      throw new ServiceUnavailableException('Master data chỉ ghi được khi PERSISTENCE=prisma');
    }
  }

  private operationForRow(row: MasterDataPreviewRow): Promise<unknown> {
    if (row.resource === 'dealer') {
      const after = row.after as Record<string, unknown>;
      return this.prisma.dealer.upsert({
        where: { id: after.id },
        create: after,
        update: after,
      });
    }
    if (row.resource === 'deal') {
      const after = row.after as Record<string, unknown>;
      return this.prisma.dealerPriceOverride.upsert({
        where: { id: after.id },
        create: after,
        update: after,
      });
    }
    const before = row.before as { dealerId?: string | null; status?: string | null } | null;
    const after = row.after as Record<string, unknown>;
    return this.prisma.group
      .upsert({
        where: { platform_chatId: { platform: 'zalo', chatId: after.chatId } },
        create: { ...after, platform: 'zalo' },
        update: after,
      })
      .then((group) =>
        this.prisma.groupMappingHistory.create({
          data: {
            groupId: (group as { id?: string }).id ?? after.id,
            previousDealerId: before?.dealerId ?? null,
            nextDealerId: (after.dealerId as string | null | undefined) ?? null,
            previousStatus: before?.status ?? 'pending',
            nextStatus: after.status,
            source: 'import',
            actor: 'import',
            requestId: null,
          },
        }),
      );
  }
}

function importPayload(input: MasterDataApplyInput): MasterDataImportInput {
  return {
    format: input.format,
    encoding: input.encoding,
    content: input.content,
    ...(input.filename ? { filename: input.filename } : {}),
  };
}

function toSnapshot(
  dealers: readonly unknown[],
  deals: readonly unknown[],
  groups: readonly unknown[],
  products: readonly unknown[],
): MasterDataSnapshot {
  return {
    dealers: dealers.map((dealer) => dealer as MasterDataSnapshot['dealers'][number]),
    deals: deals.map((deal) => deal as MasterDataSnapshot['deals'][number]),
    groups: groups.map((group) => group as MasterDataSnapshot['groups'][number]),
    productSkus: products
      .map((product) => (product as { sku?: unknown }).sku)
      .filter((sku): sku is string => typeof sku === 'string' && sku.length > 0),
  };
}
