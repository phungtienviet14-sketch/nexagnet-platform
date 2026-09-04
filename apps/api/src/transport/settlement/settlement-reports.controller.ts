import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { z } from 'zod';
import {
  RequiresTransportAction,
  TransportActionGuard,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { firstIssue } from '../transport.schemas.js';
import type { DirectMargin, DirectMarginRollup } from './direct-margin.js';
import type {
  ApByCounterpartyRow,
  ArAgingReport,
  PartnerPosition,
} from './settlement-read.service.js';
import { SettlementReadService } from './settlement-read.service.js';
import {
  apQuerySchema,
  arAgingQuerySchema,
  directMarginRollupQuerySchema,
} from './settlement.schemas.js';
import type { SettlementDocumentChain } from './settlement.types.js';

/**
 * BAO CAO QUYET TOAN qua HTTP — `TX-05`, `#168 B1`.
 *
 * `TransportSettlementModule` chay tu T5 (#109) nhung KHONG khai mot controller nao:
 * `SettlementService` va `SettlementReadService` da day du, chi thieu dung lop nay. Ket qua la toan
 * bo man hinh cong no / bien truc tiep cua T7 khong co gi de goi.
 *
 * ===========================================================================
 * CHI DOC — khong mot route GHI nao, va do la mot LUA CHON, khong phai mot thieu sot.
 *
 * `SettlementService` co day du lenh ghi: ghi nhan cong no phai thu/phai tra, hoa hong, dieu chinh,
 * dao chung tu, phan bo tien, dieu khoan khach, ky quyet toan, quy tac hoa hong. KHONG lenh nao
 * trong so do da tung duoc phoi ra hay duoc gan quyen — va #168 §2.B1 chi cho phep dung nhung lenh
 * *"already defined and permissioned"*, kem mot cau ngan: *"Reporting never mutates"*.
 *
 * Mo mot duong ghi tai chinh o day se la tu quyet dinh AI duoc ghi nhan cong no va AI duoc dao mot
 * chung tu da phat — mot chinh sach ma chua nguon nao noi den. Khi nao co, no se la mot task rieng
 * mang theo bang phan quyen cua chinh no.
 *
 * ===========================================================================
 * `GD-15` KHONG BU TRU — giu nguyen o tang nay.
 *
 * Khong route nao tra "tong cong no cua doi tac X", vi cau hoi do khong co MOT cau tra loi dung:
 * mot doi tac vua cho thue xe vua mang don ve co HAI so du. `/partners/:id/position` tra ca hai
 * chieu CANH NHAU dung nhu `SettlementReadService` dung, va `netDisplay` luon di kem ba con so goc.
 */
@Controller('transport/settlement')
@UseGuards(TransportActionGuard)
export class SettlementReportsController {
  constructor(private readonly read: SettlementReadService) {}

  /** TUOI NO phai thu theo mot moc — den han / qua han / phan nhom tuoi. */
  @Get('ar-aging')
  @RequiresTransportAction('transport.settlement.report.read')
  arAging(@Query() query: unknown): Promise<ArAgingReport> {
    const { asOf, customerId } = this.parse(arAgingQuerySchema, query);
    return this.guard(() => this.read.arAging(asOf, customerId));
  }

  /** CONG NO PHAI TRA gom theo doi tac, TRONG MOT DONG (`GD-15`). */
  @Get('ap')
  @RequiresTransportAction('transport.settlement.report.read')
  apByCounterparty(@Query() query: unknown): Promise<ApByCounterpartyRow[]> {
    const { flow } = this.parse(apQuerySchema, query);
    return this.guard(() => this.read.apByCounterparty(flow));
  }

  /** HAI CHIEU cua mot doi tac, canh nhau — khong bu tru. */
  @Get('partners/:partnerId/position')
  @RequiresTransportAction('transport.settlement.report.read')
  partnerPosition(@Param('partnerId') partnerId: string): Promise<PartnerPosition> {
    return this.guard(() => this.read.partnerPosition(partnerId));
  }

  /**
   * BIEN TRUC TIEP cua mot chuyen.
   *
   * `null` cua tang doc nghia la "khong co chuyen nay", nen o day no thanh 404 chu khong phai mot
   * than `null` mang ma 200: mot khung nhin nhan `null` khong phan biet duoc "chuyen khong ton tai"
   * voi "chuyen co that nhung chua tinh duoc bien".
   */
  @Get('trips/:tripId/direct-margin')
  @RequiresTransportAction('transport.settlement.report.read')
  async tripDirectMargin(@Param('tripId') tripId: string): Promise<DirectMargin> {
    const margin = await this.guard(() => this.read.tripDirectMargin(tripId));
    if (!margin) throw new NotFoundException(`Khong tim thay chuyen ${tripId}`);
    return margin;
  }

  /**
   * CONG DON bien truc tiep tren nhieu chuyen — `?tripIds=a,b,c`.
   *
   * Chuyen khong ton tai bi BO QUA (tang doc lam vay), khong lam hong ca bao cao. Danh doi la mot
   * ma go sai se lang le khong xuat hien trong tong — nen `DirectMarginRollup` mang theo so chuyen
   * DA TINH de nguoi doc doi chieu duoc voi so ma minh gui len.
   */
  @Get('direct-margin/rollup')
  @RequiresTransportAction('transport.settlement.report.read')
  directMarginRollup(@Query() query: unknown): Promise<DirectMarginRollup> {
    const { tripIds } = this.parse(directMarginRollupQuerySchema, query);
    return this.guard(() => this.read.directMarginRollup(tripIds));
  }

  /**
   * CHUOI CHUNG TU: ban goc + moi ban dieu chinh/dao cua no.
   *
   * Mot ma quyen KHAC (`transport.settlement.document.read`): bao cao noi "con no bao nhieu", chuoi
   * chung tu noi "ai da sua con so nay, luc nao, vi sao".
   */
  @Get('documents/:originalId/chain')
  @RequiresTransportAction('transport.settlement.document.read')
  async documentChain(@Param('originalId') originalId: string): Promise<SettlementDocumentChain> {
    const chain = await this.guard(() => this.read.documentChain(originalId));
    if (!chain) throw new NotFoundException(`Khong tim thay chung tu ${originalId}`);
    return chain;
  }

  private parse<S extends z.ZodType>(schema: S, query: unknown): z.infer<S> {
    const parsed = schema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));
    return parsed.data as z.infer<S>;
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}
