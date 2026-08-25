import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module.js';
import { OrderDebugController } from './order-debug.controller.js';

/**
 * MAN HINH CHAN DOAN — nen tang, khong phai capability.
 *
 * Cung ly le voi `ObservabilityModule`: mot khach khong chan doan duoc la mot khach khong ho tro
 * duoc. Khong co cong tac bat/tat theo tenant, va o day cung khong duoc phep phu thuoc vao mot
 * capability nao — mot khach khong ban hang van phai mo duoc luong xu ly cua mot luot.
 *
 * ---------------------------------------------------------------------------
 * VI SAO LA MOT MODULE RIENG chu khong nhet controller nay vao `ObservabilityModule`:
 *
 * `ObservabilityModule` la `@Global()` va CO Y khong import module nao. Cho no import
 * `WorkflowModule` se keo dispatcher + scheduler cua workflow vao do thi phu thuoc cua MOI tien
 * trinh nap no — ke ca tien trinh worker, von duoc dung rieng de KHONG mang theo `AppModule`
 * (mot ban sao `AppModule` trong worker se mo mot listener zca thu hai va ha kenh doc chinh).
 *
 * Mot module rieng giu duoc ca hai: quan sat van toan cuc, con phan doc workflow chi ton tai o
 * tien trinh API.
 */
@Module({
  imports: [WorkflowModule],
  controllers: [OrderDebugController],
})
export class DebugModule {}
