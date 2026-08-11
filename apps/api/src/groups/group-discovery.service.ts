import { Injectable, Logger } from '@nestjs/common';
import { loadEnv } from '@netviet/shared';
import { PrismaService } from '../config/prisma.service.js';

/**
 * Cua so bo qua ghi lai cho CUNG mot nhom. zca doc MOI tin trong nhom nen khong throttle
 * la moi tin mot lan ghi DB — trong khi thu duy nhat can biet la "nhom nay con song".
 */
export const GROUP_SEEN_THROTTLE_MS = 5 * 60_000;

/**
 * Ghi nhan nhom Zalo vao nguon su that NGAY khi thay tin dau tien, thay vi bat nguoi van hanh
 * go tay `chatId` (truoc 04/08/2026 ZcaListener con in log "copy ID nay vao seed.ts").
 *
 * Chi ghi metadata toi thieu: chatId + lan cuoi thay. TEN nhom khong lay o day — tin nhan khong
 * mang ten nhom va goi getGroupInfo moi tin la lang phi; ten hien thi da co san tu
 * SettingsQueryService (ghep nhom song cua zca voi hang DB), va duoc GHI khi nguoi van hanh
 * chon dai ly.
 *
 * Hang moi luon o trang thai `pending`: thay nhom KHONG cho phep xu ly don. Phai co nguoi chon
 * dai ly (status -> mapped) thi pipeline moi dua noi dung sang parser.
 */
@Injectable()
export class GroupDiscoveryService {
  private readonly logger = new Logger('GroupDiscoveryService');
  /** chatId -> moc ghi THANH CONG gan nhat (ms). Ghi loi khong ghi vao day de con thu lai. */
  private readonly lastWriteAt = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  async observe(chatId: string, seenAt: Date = new Date()): Promise<void> {
    if (loadEnv().PERSISTENCE !== 'prisma') return;

    const at = seenAt.getTime();
    const previous = this.lastWriteAt.get(chatId);
    if (previous !== undefined && at - previous < GROUP_SEEN_THROTTLE_MS) return;

    try {
      await this.prisma.group.upsert({
        where: { platform_chatId: { platform: 'zalo', chatId } },
        // CHI lastSeenAt: nhom da 'mapped' kem dealerId khong duoc quay ve pending vi co tin moi.
        update: { lastSeenAt: seenAt },
        create: {
          platform: 'zalo',
          chatId,
          status: 'pending',
          source: 'auto_suggest',
          lastSeenAt: seenAt,
        },
      });
      this.lastWriteAt.set(chatId, at);
    } catch (error) {
      // Metadata nhom KHONG duoc chan xu ly don (bat bien I6). Tin da luu o PipelineService.
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Ghi nhan nhom ${chatId} that bai (xu ly tin van tiep tuc): ${detail}`);
    }
  }
}
