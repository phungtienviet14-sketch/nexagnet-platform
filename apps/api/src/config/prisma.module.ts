import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * PrismaService dung chung TOAN he thong qua 1 instance duy nhat (@Global).
 * Ly do: panel AdminJS (module con, mount /admin) can DUNG CHUNG dung PrismaClient voi pipeline
 * (yeu cau "same PrismaService instance") — @Global giup inject vao factory cua AdminModule
 * ma khong phai import lai / tao instance thu 2 (moi instance = 1 connection pool rieng).
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
