import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
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
  /**
   * `upload` LA MOT DUONG RIENG, va no PHAI la duong rieng.
   *
   * `DriverFuelController` da giu `POST slips/:id/evidence` (gan mot CHUOI DINH VI, tu thoi `PG-05`
   * chua co kho anh). Hai controller cung nhan mot method + mot path thi Nest gan cai duoc dang ky
   * TRUOC — o `app-composition.ts` do la `DriverFuelController` — va route tai anh nay KHONG BAO
   * GIO duoc goi toi.
   *
   * Do khong phai suy dien: do tren ban DA TRIEN KHAI (T9), cung mot URL tra 201 voi than JSON
   * `{locator}` va 400 `body: expected object, received undefined` voi `multipart/form-data`. Tuc
   * nut "tai anh bien lai" cua lai xe hong IM LANG — khong loi build, khong test do, chi la mot
   * tinh nang (#169) khong ton tai luc chay.
   *
   * `with-evidence` cua `DriverExpenseEvidenceController` da dung dung khuon nay va chay tot; day
   * chi la ap lai khuon do cho nhien lieu.
   */
  @Post('upload')
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

  /**
   * GO MOT CHUNG TU DA TAI NHAM — #222 P1-C.
   *
   * ===========================================================================
   * KHONG MOT MA HANH DONG MOI NAO
   *
   * Go mot tep vua tai nham la MOT PHAN cua viec nop phieu — nguoi lam duoc viec do la nguoi dang
   * con quyen sua chinh phieu do. Nen route dung `transport.driver.self.fuel.submit`, y het duong
   * `upload`. Che mot ma `transport.evidence.delete` se lam bang phan quyen dai them mot dong ma
   * khong tra loi mot cau hoi nghiep vu nao khac.
   *
   * ===========================================================================
   * BA HANG RAO, THEO DUNG THU TU NAY
   *
   * ```text
   * 1. QUYEN SO HUU  — `getMyFuelSlip` nem `SELF_FUEL_SCOPE_NOT_OWNED` cho phieu cua nguoi khac
   * 2. VONG DOI      — `FuelService.withdrawEvidence` chay cong `GD-10`/`GD-11`, ca luc doc lan ghi
   * 3. DON BYTE      — chi khi hai rao tren da qua
   * ```
   *
   * Rao 1 lam ca hai viec cua #222: lai xe A khong go duoc chung tu cua lai xe B, VA khong do duoc
   * su ton tai cua mot `evidenceId` la — vi cau tra loi cho ca hai la cung mot 403 cua BUOC DAU,
   * truoc khi bat cu phep tim bang chung nao chay.
   *
   * `driverId` KHONG bao gio den tu than yeu cau hay duong dan: danh tinh lay tu phien, dung nhu
   * moi route khac cua be mat nay (`INV-09`).
   */
  @Delete(':evidenceId')
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.fuel.submit')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('evidenceId') evidenceId: string,
  ): Promise<DriverFuelSlipView> {
    const authUserId = requireAuthUserId(request);
    return this.guard(async () => {
      await this.read.getMyFuelSlip(authUserId, id);
      const withdrawn = await this.fuel.withdrawEvidence(id, evidenceId, transportActorOf(request));
      // BIA MO TRUOC, DON BYTE SAU. `remove` tra `false` khi kho khong don duoc (vd
      // `MEDIA_STORE=none`) — khong nem, vi chung tu DA bien mat khoi ho so dung y nguoi dung va
      // mot ngoai le o day se bao that bai cho mot thao tac da thanh cong.
      await this.evidence.remove(withdrawn.locator);
      return this.read.getMyFuelSlip(authUserId, id);
    });
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}
