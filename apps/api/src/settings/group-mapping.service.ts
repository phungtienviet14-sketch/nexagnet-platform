import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { loadEnv } from '@ultty/shared';
import { z } from 'zod';
import { AuditLogService } from '../audit/audit-log.service.js';
import { PrismaService } from '../config/prisma.service.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';

export const groupMappingSchema = z
  .object({
    dealerId: z.string().trim().min(1).max(128).nullable(),
    name: z.string().trim().min(1).max(300).optional(),
    branch: z.string().trim().min(1).max(100).nullable().optional(),
  })
  .strict();

export type GroupMappingInput = z.infer<typeof groupMappingSchema>;

/**
 * Map nhom Zalo -> dai ly bang KHOA TU NHIEN (platform + chatId).
 *
 * Khac SourceTruthWriteService: cho nay upsert theo `id` cuid va doi gui ca ban ghi, nen chi dung
 * duoc voi nhom DA co trong DB. Nhom moi phat hien tu luong tin thi chua co cuid — nguoi van hanh
 * truoc 04/08/2026 phai tu go `chatId` vao form. Endpoint nay chi can chatId (UI da hien san) +
 * dai ly duoc chon.
 *
 * `name` lay tu danh sach nhom song cua zca ma UI dang hien -> hang DB co ten that ma khong ton
 * them mot request Zalo nao. Khong gui `name` thi giu nguyen ten cu, khong ghi de bang rong.
 */
@Injectable()
export class GroupMappingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledge: KnowledgeService,
    private readonly audit: AuditLogService,
  ) {}

  async setMapping(
    chatId: string,
    input: GroupMappingInput,
    actor: string,
    requestId: string | null,
  ): Promise<{ chatId: string; dealerId: string | null; status: 'mapped' | 'pending' }> {
    if (loadEnv().PERSISTENCE !== 'prisma') {
      throw new ServiceUnavailableException('Chi map duoc nhom khi PERSISTENCE=prisma');
    }

    // Kiem dai ly TRUOC khi cham bang Group: dealerId sai ma van upsert la tao ra nhom mo coi
    // (status=mapped nhung tro toi dai ly khong ton tai) — pipeline se khong tinh duoc gia.
    if (input.dealerId !== null) {
      const dealer = await this.prisma.dealer.findUnique({ where: { id: input.dealerId } });
      if (!dealer) throw new BadRequestException(`Dai ly ${input.dealerId} khong ton tai`);
    }

    const before = await this.prisma.group.findUnique({
      where: { platform_chatId: { platform: 'zalo', chatId } },
    });

    const status = input.dealerId === null ? 'pending' : 'mapped';
    const shared = {
      dealerId: input.dealerId,
      status,
      // Nguoi van hanh tu chon -> nguon la 'manual', khong con la goi y tu dong nua.
      source: 'manual',
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.branch === undefined ? {} : { branch: input.branch }),
    } as const;

    await this.prisma.group.upsert({
      where: { platform_chatId: { platform: 'zalo', chatId } },
      update: { ...shared },
      create: { platform: 'zalo', chatId, ...shared },
    });

    await this.audit.append({
      actor,
      action: 'group.mapping.update',
      entityType: 'Group',
      entityId: chatId,
      before,
      after: { chatId, ...shared },
      requestId,
    });

    // Pipeline doc nhom da map tu KnowledgeService (cache trong bo nho) — khong reload thi tin
    // tiep theo van bi coi la "nhom chua map" du DB da ghi xong.
    await this.knowledge.reload();

    return { chatId, dealerId: input.dealerId, status };
  }
}
