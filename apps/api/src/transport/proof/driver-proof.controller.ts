import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import type { UploadedEvidenceFile } from '../evidence/evidence-http.js';
import { uploadedBytes } from '../evidence/evidence-http.js';
import { TransportEvidenceService } from '../evidence/transport-evidence.service.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  requireAuthUserId,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { firstIssue } from '../transport.schemas.js';
import { OperationalProofService } from './operational-proof.service.js';
import type { OperationalProof, ProofPhotoCaptureMode } from './operational-proof.types.js';
import { recordProofSchema } from './proof.schemas.js';

/**
 * BE MAT LAI XE cua chung cu van hanh — bat dau va giao hang.
 *
 * BYTE ANH DI QUA `TransportEvidenceService`, tuc qua `MediaStore` — **khong dung kho tep thu
 * hai** (#229 §0 luat 4, va R0 §6 noi thang: moi anh chung cu vi tri cua R2 di qua File Platform).
 * Khi #223 dong, cho doi la `locator` -> `fileId`, va no doi o MOT cho.
 *
 * Vi sao byte duoc xu ly o CONTROLLER chu khong o dich vu: `TransportEvidenceService` duoc dang
 * ky o tang lap rap voi chu so huu `transport-core`, nen no co san cho cac controller o goc —
 * nhung khong tu dong co trong injector cua `TransportProofModule`. Cung khuon voi
 * `DriverFuelEvidenceController`.
 */
@Controller('transport/me/proofs')
@UseGuards(TransportActionGuard)
export class DriverProofController {
  constructor(
    private readonly proofs: OperationalProofService,
    private readonly evidence: TransportEvidenceService,
  ) {}

  @Get()
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.proof.record')
  listOwn(@Req() request: AuthenticatedRequest): Promise<readonly OperationalProof[]> {
    const authUserId = requireAuthUserId(request);
    return this.guard(() => this.proofs.listOwn(authUserId));
  }

  /**
   * MOT tuyen cho ca hai loai, phan biet bang `kind` trong than yeu cau.
   *
   * Khong tach `/start` va `/delivery` thanh hai tuyen vi hai duong do khac nhau DUNG MOT dieu —
   * giao hang bat buoc co anh — va dieu do la mot QUY TAC NGHIEP VU thuoc dich vu, khong phai mot
   * hinh dang HTTP. Tach ra se de mo mot duong quen kiem anh.
   */
  @Post()
  @Roles('SALE', 'ADMIN')
  @RequiresTransportAction('transport.driver.self.proof.record')
  @UseInterceptors(FilesInterceptor('photos', 6))
  async record(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
    @UploadedFiles() files: UploadedEvidenceFile[] | undefined,
  ): Promise<OperationalProof> {
    const authUserId = requireAuthUserId(request);
    const parsed = recordProofSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));

    // `captureMode` di kem THEO THU TU tep. Thieu thi `UNKNOWN` — khong bao gio doan
    // `LIVE_CAMERA`, vi doan cao la tu nang muc tin cay cua mot thu ma khong ai khai.
    const modes = parsed.data.captureModes ?? [];
    const uploaded = files ?? [];

    const stored: {
      locator: string;
      captureMode: ProofPhotoCaptureMode;
      contentType: string | null;
      byteSize: number | null;
    }[] = [];
    for (const [index, file] of uploaded.entries()) {
      const { bytes, contentType } = uploadedBytes(file);
      const saved = await this.evidence.put({ bytes, contentType });
      stored.push({
        locator: saved.locator,
        captureMode: modes[index] ?? 'UNKNOWN',
        contentType: saved.contentType ?? contentType,
        byteSize: bytes.byteLength,
      });
    }

    return this.guard(() =>
      this.proofs.record({
        authUserId,
        kind: parsed.data.kind,
        tripId: parsed.data.tripId,
        observationId: parsed.data.observationId,
        clientEventId: parsed.data.clientEventId,
        note: parsed.data.note ?? null,
        photos: stored,
      }),
    );
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}
