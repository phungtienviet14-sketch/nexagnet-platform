import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaClient theo vong doi Nest. CO Y KHONG $connect eager (onModuleInit): Prisma tu ket noi
 * o query dau tien, nho vay che do PERSISTENCE=memory (khong dung Prisma) KHONG cham DB luc boot
 * -> demo offline / test khong can Postgres. Chi $disconnect khi tat (an toan ca khi chua connect).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger('PrismaService');

  async onModuleDestroy(): Promise<void> {
    try {
      await this.$disconnect();
    } catch (error) {
      this.logger.warn(
        `Prisma disconnect loi: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
