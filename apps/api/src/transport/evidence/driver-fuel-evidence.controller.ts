import { Controller, Get, Param, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Roles } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import type { DriverFuelSlipView } from '../fuel/driver-fuel.view.js';
import { FuelReadService } from '../fuel/fuel-read.service.js';
import { FuelService } from '../fuel/fuel.service.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  requireAuthUserId,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { transportActorOf } from '../transport-actor.js';
import { sendEvidence, uploadedBytes, type UploadedEvidenceFile } from './evidence-http.js';
import { TransportEvidenceService } from './transport-evidence.service.js';

/**
 * ANH CHUNG TU cua phieu dau — BE MAT LAI XE (`#169`).
 *
 * ===========================================================================
 * KHONG mot ma hanh dong moi nao.
 *
 * Tai anh cho phieu cua chinh minh la MOT PHAN cua viec nop phieu, nen no dung
 * `transport.driver.self.fuel.submit`; xem lai anh la mot phan cua viec xem phieu, nen no dung
 * `transport.driver.self.fuel.read`. Che them mot ma `transport.evidence.*` se lam bang phan quyen
 * dai ra ma khong tra loi duoc mot cau hoi nghiep vu nao khac.
 *
 * ===========================================================================
 * QUYEN SO HUU do CHUNG TU NGHIEP VU quyet dinh, khong do bang chung.
 *
 * Ca hai route deu di qua `FuelReadService`, va chinh `getMyFuelSlip()` nem
 * `SELF_FUEL_SCOPE_NOT_OWNED` cho phieu cua nguoi khac. Bang chung khong co cong rieng — no thua ke
 * cong cua thu ma no gan vao. Nho vay lai xe A khong doi duoc mot `evidenceId` tren URL de xem anh
 * cua lai xe B, va cung khong tai duoc anh len phieu cua dong nghiep.
 *
 * `TransportEvidenceService` KHONG biet ai dang goi: no chi nhan byte va dinh vi.
 */
@Controller('transport/me/fuel/slips/:id/evidence')
@UseGuards(TransportActionGuard)
export class DriverFuelEvidenceController {
  constructor(
    private readonly evidence: TransportEvidenceService,
    private readonly fuel: FuelService,
    private readonly read: FuelReadService,
  ) {}

  /**
   * TAI ANH LEN roi GAN vao phieu — MOT lan goi.
   *
   * Gop hai buoc co chu y: mot API tra ve dinh vi roi de client tu goi buoc gan se de lai nhung
   * object MO COI trong bucket moi lan mang rot giua chung — va khong ai don chung.
   */
  @Post()
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.fuel.submit')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @UploadedFile() file: UploadedEvidenceFile | undefined,
  ): Promise<DriverFuelSlipView> {
    const authUserId = requireAuthUserId(request);
    const upload = uploadedBytes(file);
    return this.guard(async () => {
      // DOC QUYEN SO HUU TRUOC KHI GHI MOT BYTE NAO — cung khuon `attachEvidence` cua T4.
      await this.read.getMyFuelSlip(authUserId, id);
      const stored = await this.evidence.put(upload);
      await this.fuel.attachEvidence(
        id,
        { locator: stored.locator, contentType: stored.contentType, byteSize: stored.byteSize },
        transportActorOf(request),
      );
      return this.read.getMyFuelSlip(authUserId, id);
    });
  }

  /**
   * XEM LAI anh cua chinh minh — acceptance 3/4 cua #169 (tai lai trang van xem duoc).
   *
   * Tra thang byte qua mot route CO XAC THUC, khong phat URL ky. Kho anh cua nen tang la bucket
   * PRIVATE danh cho PII (xem `catalog-media.controller.ts`), va mot URL ky la mot manh giay uy
   * quyen roi ra khoi he thong: no con song sau khi phien het han, va no di duoc vao lich su duyet,
   * log proxy hay mot tin nhan chuyen tiep.
   */
  @Get(':evidenceId')
  @RequiresTransportAction('transport.driver.self.fuel.read')
  async serve(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('evidenceId') evidenceId: string,
    @Res() response: Response,
  ): Promise<void> {
    const authUserId = requireAuthUserId(request);
    const row = await this.guard(() => this.read.myFuelSlipEvidence(authUserId, id, evidenceId));
    sendEvidence(response, await this.guard(() => this.evidence.read(row.locator)));
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}
