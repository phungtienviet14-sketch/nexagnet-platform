import { Controller, Get, Param, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Roles } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import { FuelReadService } from '../fuel/fuel-read.service.js';
import { FuelService } from '../fuel/fuel.service.js';
import type { FuelReceiptEvidence } from '../fuel/fuel.types.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { transportActorOf } from '../transport-actor.js';
import { sendEvidence, uploadedBytes, type UploadedEvidenceFile } from './evidence-http.js';
import { TransportEvidenceService } from './transport-evidence.service.js';

/**
 * ANH CHUNG TU cua phieu dau — BE MAT VAN HANH (`#169`).
 *
 * Doi ban cua `DriverFuelEvidenceController`, va la HAI controller chu khong mot: cung ly le da
 * dung cho `DriverFuelController` / `FuelEntriesController` o T4 (`GD-23`). Nhap chung roi re nhanh
 * theo vai se lam mot lan doi quyen o mot nhanh am tham mo be mat kia.
 *
 * Cung KHONG co ma hanh dong moi:
 *   · tai anh HO mot lai xe  -> `transport.fuel.entry.submit_for_driver` (dung ma ma T4 danh cho
 *     "nop/sua HO mot phieu" — quyen ma khong lai xe nao co);
 *   · xem anh                -> `transport.fuel.entry.read`.
 *
 * Ke toan xem duoc anh cua MOI phieu, va do la dung: doi soat bang ke voi cay xang la cong viec cua
 * ho. Khong co pham vi "cua chinh minh" o be mat nay, nen khong co phep kiem so huu — cong la chinh
 * ma hanh dong.
 */
@Controller('transport/fuel/entries/:id/evidence')
@UseGuards(TransportActionGuard)
export class FuelEvidenceController {
  constructor(
    private readonly evidence: TransportEvidenceService,
    private readonly fuel: FuelService,
    private readonly read: FuelReadService,
  ) {}

  @Post()
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.fuel.entry.submit_for_driver')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @UploadedFile() file: UploadedEvidenceFile | undefined,
  ): Promise<FuelReceiptEvidence> {
    const upload = uploadedBytes(file);
    return this.guard(async () => {
      const stored = await this.evidence.put(upload);
      // `attachEvidence` tu chan phieu da nam trong ky doi soat DA CHOT (T4R §4) — khong lap lai
      // phep kiem do o day.
      return this.fuel.attachEvidence(
        id,
        { locator: stored.locator, contentType: stored.contentType, byteSize: stored.byteSize },
        transportActorOf(request),
      );
    });
  }

  @Get(':evidenceId')
  @RequiresTransportAction('transport.fuel.entry.read')
  async serve(
    @Param('id') id: string,
    @Param('evidenceId') evidenceId: string,
    @Res() response: Response,
  ): Promise<void> {
    const row = await this.guard(() => this.read.fuelEntryEvidence(id, evidenceId));
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
