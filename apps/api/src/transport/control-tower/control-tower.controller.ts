import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  RequiresTransportAction,
  TransportActionGuard,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { ControlTowerReadService } from './control-tower-read.service.js';
import type { ControlTowerView } from './control-tower.types.js';

/**
 * THAP DIEU HANH qua HTTP — #244 G2/G3.
 *
 * ===========================================================================
 * CHI DOC. Khong mot route GHI nao, va se khong co.
 *
 * Cung cau ma `TransportAnalyticsController` da viet, va no dung gap doi o day: bang nay CHIEU
 * trang thai vong chay len bay cot. Mot route ghi tren bang se la mot duong doi trang thai vong
 * chay ma KHONG di qua `MovementService` — tuc dung cai #244 G3 cam ("do not invent independent
 * status mutations just for the board"). Ranh gioi duoc giu o CA HAI tang: khong route ghi o day,
 * va khong ham ghi trong bon cong cua `control-tower-facts.port.ts`.
 *
 * ===========================================================================
 * MOT LAN GOI, MOT KHUNG NHIN.
 *
 * Khong tach `/board`, `/queue`, `/fleet` thanh ba route. Ba lan goi se cho ra ba anh chup o ba
 * khoanh khac khac nhau, va nguoi doc se thay mot vong chay vua nam o cot `In transit` vua co mot
 * dong "chua phan cong lai xe" da duoc xu ly xong. Mot bang tu mau thuan voi chinh no la mot bang
 * khong ai tin nua.
 */
@Controller('transport/control-tower')
@UseGuards(TransportActionGuard)
export class ControlTowerController {
  constructor(private readonly read: ControlTowerReadService) {}

  /**
   * Tra ve CA `unavailableSources` va `pendingWork`.
   *
   * Mot bang thieu muc vi khach tat capability, va mot bang thieu muc vi nen tang chua co nguon,
   * la HAI dieu khac nhau — nen chung di ra o hai truong khac nhau. Im lang o ca hai se lam bang
   * doc giong het mot ngay khong co viec gi.
   */
  @Get()
  @RequiresTransportAction('transport.control_tower.read')
  async view(): Promise<ControlTowerView> {
    try {
      return await this.read.view();
    } catch (error) {
      throw transportErrorToHttp(error);
    }
  }
}
