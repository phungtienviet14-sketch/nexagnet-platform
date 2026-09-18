import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../../../auth/roles.decorator.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  transportErrorToHttp,
} from '../../transport-action.guard.js';
import { firstIssue } from '../../transport.schemas.js';
import { ingestTelematicsObservationBatchSchema } from '../proof.schemas.js';
import type { LocationObservation } from '../tracking.types.js';
import { TelematicsIngressService } from './telematics-ingress.service.js';

/**
 * CUA NHAP TELEMATICS — be mat HTTP, `#297` T4.
 *
 * ============================================================================================
 * MOT DUONG GHI RIENG, VOI MOT MA QUYEN RIENG, VA DO LA CA DIEM
 * ============================================================================================
 *
 * Duong ghi vi tri duy nhat tren `main` truoc lane nay la be mat LAI XE
 * (`transport.driver.self.tracking.report`) — mot ma PHAM VI LAI XE. Dung lai no o day se co nghia
 * la moi lai xe deu ghi duoc "vi tri tu phan cung tren xe", tuc chinh chiec dien thoai dang bi doi
 * chieu se viet duoc ban ghi cua nguon dung de doi chieu no.
 *
 * Nen ma o day la mot ma moi va thuoc PHAM VI VAN HANH. `OPERATIONS_ACTIONS` duoc suy ra bang phep
 * tru, nen mot ma khai moi tu dong KHONG duoc cap cho `SALE` — tuc cho lai xe — va do la chinh sach
 * den tu CAU TRUC chu khong tu mot dong cau hinh phai nho.
 *
 * Va no nam trong `ACCOUNTING_DENIED`, cung mot ly le da ghi cho `transport.checkpoint.record`:
 * nguoi DOI SOAT khong duoc viet ra can cu ma chinh ho dang doi soat. Ke toan doc duoc suc khoe vi
 * tri; ho khong ghi duoc mot ban dinh vi nao.
 *
 * ============================================================================================
 * XAC THUC: DUNG DUONG CUA NEN TANG, KHONG DUNG MOT DUONG THU HAI
 * ============================================================================================
 *
 * Mot dau noi that chay duoi mot phien co quyen van hanh. Nen tang HOM NAY khong co loai danh tinh
 * "may goi may" (khong khoa API, khong OAuth client credentials), va che mot cai o day se la dung
 * thu ma `#242` E3 cam thang: *"do not build a second auth system"*. Do la mot GIOI HAN THAT va no
 * duoc ghi lai o day chu khong duoc giau di — khi mot nha cung cap that duoc cam vao, cau hoi
 * "danh tinh may goi may" phai duoc tra loi o TANG NEN TANG, mot lan, cho moi mien.
 */
@Controller('transport/telematics')
@UseGuards(TransportActionGuard)
export class TelematicsIngressController {
  constructor(private readonly ingress: TelematicsIngressService) {}

  /**
   * MOT LO, va xu ly TUAN TU.
   *
   * Tuan tu chu khong song song, cung ly le da ghi o be mat lai xe: hai ban trong cung mot lo co
   * the mang CUNG mot `externalEventId`, va chay song song se lam ca hai cung doc thay "chua co" roi
   * cung ghi. Chi muc duy nhat duoi Postgres van chan duoc lan thu hai, nhung loi bat duoc se la mot
   * va cham kho thay vi mot cau tra loi ro rang.
   *
   * Dau ra la mot mang CUNG DO DAI voi dau vao, nen nguoi gui doi chieu duoc tung cai va biet chac
   * cai nao da vao.
   */
  @Post('observations')
  @Roles('ADMIN')
  @RequiresTransportAction('transport.telematics.observation.ingest')
  ingest(@Body() body: unknown): Promise<readonly LocationObservation[]> {
    const parsed = ingestTelematicsObservationBatchSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));
    return this.guard(async () => {
      const accepted: LocationObservation[] = [];
      for (const observation of parsed.data.observations) {
        accepted.push(
          await this.ingress.ingest({
            providerId: observation.providerId,
            externalEventId: observation.externalEventId,
            vehicleId: observation.vehicleId,
            latitude: observation.latitude,
            longitude: observation.longitude,
            accuracyMetres: observation.accuracyMetres ?? null,
            speedMetresPerSecond: observation.speedMetresPerSecond ?? null,
            bearingDegrees: observation.bearingDegrees ?? null,
            recordedAt: observation.recordedAt,
          }),
        );
      }
      return accepted;
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
