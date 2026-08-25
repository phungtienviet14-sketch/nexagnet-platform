import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator.js';
import {
  SalesHandoffFollowupService,
  type FollowupMarkResult,
  type HandoffStateView,
} from './sales-handoff-followup.service.js';

/**
 * DUONG QUAY LAI cua worker workflow — `sales-handoff-followup` hoi va ghi qua day.
 *
 * ---------------------------------------------------------------------------
 * VI SAO WORKER NOI CHUYEN QUA HTTP thay vi cam thang vao DB:
 *
 * `WorkflowWorkerModule` CO Y khong nap `AppModule` (xem chu thich cua chinh no): worker boot
 * `AppModule` se mo mot listener zca THU HAI tren cung tai khoan Zalo va ha kenh doc chinh cua
 * GĐ1. Nen tien trinh worker khong co — va khong duoc co — kho du lieu nghiep vu.
 *
 * Cho worker mot `PrismaClient` rieng cung khong phai duong ra: no se ghi thang vao `Order`,
 * vuot mat moi cong nghiep vu o `OrdersService`. Duong nay giu DUNG MOT nguoi ghi.
 *
 * Day cung la khuon ma `integration-handoff` da dung (ten dich den logic -> URL tu bien moi
 * truong), chi khac o cho dich den lan nay la chinh ta.
 *
 * ---------------------------------------------------------------------------
 * `internal/` trong duong dan la mot LOI HUA VE DOI TUONG GOI, khong phai mot co che bao ve.
 * Bao ve that nam o `ApiKeyGuard`/`SessionAuthGuard` toan cuc (`APP_GUARD`) va o vanh dai mang
 * cua compose — hai endpoint nay khong duoc cong ra Internet.
 */
@Roles('SALE', 'MANAGER', 'ADMIN')
@Controller('internal/sales-handoff')
export class SalesHandoffController {
  constructor(private readonly followup: SalesHandoffFollowupService) {}

  /**
   * Trang thai HIEN TAI cua viec ban giao.
   *
   * 404 khi khong co don — va do la mot cau tra loi, khong phai mot su co: worker doi no thanh
   * `state: 'absent'` roi ket thuc workflow. Mot don da bi xoa thi khong con gi de nhac.
   */
  @Get(':id')
  async state(@Param('id') id: string): Promise<HandoffStateView> {
    const state = await this.followup.readState(id);
    if (!state) throw new NotFoundException(`Khong tim thay don ${id}`);
    return state;
  }

  /**
   * Danh dau viec ban giao la qua han.
   *
   * KHONG doc `Idempotency-Key` de quyet dinh. Header do van duoc worker gui (va di vao log/
   * trace nhu moi lan goi khac), nhung viec chong trung o day dua vao TRANG THAI CUA DON chu
   * khong vao mot khoa do ben goi tu khai — mot khoa do ben goi kiem soat thi ben goi cung co
   * the doi no, con `salesHandoff.followUp` thi khong.
   *
   * Xem `SalesHandoffFollowupService` — "hai lop chong trung, va can ca hai".
   */
  @Post(':id/followup')
  async markFollowup(
    @Param('id') id: string,
    @Body() body: { stage?: unknown },
  ): Promise<FollowupMarkResult> {
    const stage = typeof body?.stage === 'string' ? body.stage.trim() : '';
    // Khong doan mot mac dinh: mot `stage` rong nghia la ben goi dang hong, va lang le nhac
    // duoi mot cai ten bia se lam ban ghi khong doi soat duoc voi khoa thao tac cua chinh no.
    if (!stage) throw new BadRequestException("Thieu 'stage' trong than yeu cau");

    const result = await this.followup.markFollowup(id, stage);
    if (!result) throw new NotFoundException(`Khong tim thay don ${id}`);
    return result;
  }
}
