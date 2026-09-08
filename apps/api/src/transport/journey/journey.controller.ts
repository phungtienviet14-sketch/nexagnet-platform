import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  RequiresTransportAction,
  TransportActionGuard,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { JourneyReadService } from './journey-read.service.js';
import type { RunJourneyMapView, RunJourneyView } from './journey.types.js';

/**
 * BAO CAO BAN DO CUA MOT VONG CHAY qua HTTP — `#278` N5.
 *
 * ===========================================================================
 * CHI DOC. Khong mot route GHI nao, va se khong co.
 *
 * Cung ly le voi `TransportAnalyticsController` va `ControlTowerController`: mot be mat bao cao co
 * duong ghi la mot be mat co the sua so lieu goc de bao cao dep hon, va khong ai phat hien duoc
 * dieu do TU CHINH bao cao.
 *
 * ===========================================================================
 * HAI TUYEN, HAI MA QUYEN — VA DO LA CA DIEM CUA TEP NAY.
 *
 * `transport.run.read`              -> bao cao: chang, km co hang/rong, ma don, dong thoi gian.
 * `transport.location.history.read` -> ban do:  toa do.
 *
 * Ma thu hai nam trong `ACCOUNTING_DENIED` (`transport-actions.ts`): ke toan KHONG duoc xem lich su
 * vi tri. Neu gop hai tuyen lam mot duoi ma thu nhat, tranche ban do nay se am tham cap cho ke toan
 * dung cai quyen ma ma tran vai da tu choi ho — va khong bai kiem nao cua auth thay, vi khong dong
 * nao trong `transport-actions.ts` bi sua.
 *
 * Nen ranh gioi duoc giu bang CAU TRUC: hai handler, hai ma, hai kieu tra ve. Ai chi co
 * `transport.run.read` van doc duoc mot bao cao that — chi khong co ban do.
 */
@Controller('transport/journey')
@UseGuards(TransportActionGuard)
export class JourneyController {
  constructor(private readonly read: JourneyReadService) {}

  /**
   * `:runRef` nhan CA ma vong chay lan `id`.
   *
   * Man hinh cam MA (quy uoc `SELECTION_QUERY_PARAM` cua `navigation.ts` cam mot `id` ky thuat len
   * dia chi), nen bat buoc `id` o day se de ra mot lan doc ca danh sach vong chay chi de doi ma.
   */
  @Get('runs/:runRef')
  @RequiresTransportAction('transport.run.read')
  runJourney(@Param('runRef') runRef: string): Promise<RunJourneyView> {
    return this.guard(() => this.read.runJourney(runRef));
  }

  @Get('runs/:runRef/map')
  @RequiresTransportAction('transport.location.history.read')
  runJourneyMap(@Param('runRef') runRef: string): Promise<RunJourneyMapView> {
    return this.guard(() => this.read.runJourneyMap(runRef));
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw transportErrorToHttp(error);
    }
  }
}
