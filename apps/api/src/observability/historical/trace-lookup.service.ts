import { Injectable, Optional } from '@nestjs/common';
import { RecentTracesSink, type StoredTrace } from '../recent-traces.sink.js';
import {
  HistoricalTraceReaderPort,
  type HistoricalLookup,
  type HistoricalUnavailableReason,
} from './historical-trace-reader.port.js';

/**
 * "CHO TOI LUOT NAY" — mot cau hoi, hai kho, va MOT cau tra loi.
 *
 * ---------------------------------------------------------------------------
 * VI SAO CO TANG NAY thay vi de moi controller tu goi hai kho:
 *
 * Hien co BA duong doc luot (`TraceController` hai duong, `OrderDebugController` mot duong). De
 * moi duong tu xep thu tu "vong dem truoc, kho sau" la ba ban sao cua cung mot quy tac, va
 * chung se troi khoi nhau — mot duong se quen phan biet "khong co" voi "khong hoi duoc", va do
 * dung la phan biet quan trong nhat o day.
 *
 * ---------------------------------------------------------------------------
 * THU TU LA VONG DEM TRUOC, va do khong phai toi uu vat vanh:
 *
 * Vong dem giu ban ghi NGUYEN VEN nhu luc phat — day du thuoc tinh, day du chi tiet, khong qua
 * mot vong serialize/deserialize nao. Kho lich su thi da di qua OTel, qua bo loc rieng tu, qua
 * collector: no giu du thu can de tra loi, nhung khong giau bang. Hoi cai gan truoc la hoi cai
 * DAY DU HON truoc, khong chi la hoi cai NHANH HON truoc.
 *
 * ---------------------------------------------------------------------------
 * `origin` KHONG PHAI TRANG TRI — no la BANG CHUNG.
 *
 * Cong ra cua P2 doi hoi chung minh rang duong lui lich su THUC SU duoc dung, chu khong phai
 * luot do tinh co van con trong bo nho. Khong co truong nay thi hai truong hop do nhin y het
 * nhau tu ben ngoai, va "da chung minh" tro thanh mot loi khang dinh khong kiem duoc.
 */

export type TraceOrigin = 'buffer' | 'historical';

export type TraceLookup =
  | { readonly status: 'found'; readonly origin: TraceOrigin; readonly traces: readonly StoredTrace[] }
  | { readonly status: 'not_found' }
  | { readonly status: 'unavailable'; readonly reason: HistoricalUnavailableReason };

@Injectable()
export class TraceLookupService {
  constructor(
    private readonly buffer: RecentTracesSink,
    /**
     * `@Optional()`: mot ban trien khai khong bat cum quan sat van phai xem duoc luot vua chay.
     * Vang mat -> chi con vong dem, va cau tra loi khi truot noi ro la KHONG CO DUONG DOC chu
     * khong phai KHONG CO DU LIEU.
     */
    @Optional() private readonly historical?: HistoricalTraceReaderPort,
  ) {}

  async byTraceId(traceId: string): Promise<TraceLookup> {
    const buffered = this.buffer.get(traceId);
    if (buffered) return { status: 'found', origin: 'buffer', traces: [buffered] };
    return this.fallback((reader) => reader.byTraceId(traceId));
  }

  /**
   * LUOT DA SINH RA mot don — mot cau tra loi, uu tien luot GOC.
   * Cung hop dong voi `RecentTracesSink.findByOrderId`.
   */
  async byOrderId(orderId: string): Promise<TraceLookup> {
    const buffered = this.buffer.findByOrderId(orderId);
    if (buffered) return { status: 'found', origin: 'buffer', traces: [buffered] };

    const found = await this.fallback((reader) => reader.byOrderId(orderId));
    if (found.status !== 'found') return found;
    return { ...found, traces: [pickOriginTurn(found.traces)] };
  }

  /**
   * MOI luot cua mot don — ca chuoi, cu nhat truoc.
   *
   * KHONG tron hai kho lam mot: vong dem CO GIU luot nao thi do la cau tra loi day du nhat cho
   * khoang thoi gian gan day, va ghep them ban lich su cua CHINH nhung luot do se sinh ra ban
   * doi. Truot han moi lui — cung luat voi hai duong tren, va do la ly do luat do nam o day.
   */
  async allByOrderId(orderId: string): Promise<TraceLookup> {
    const buffered = this.buffer.findAllByOrderId(orderId);
    if (buffered.length > 0) return { status: 'found', origin: 'buffer', traces: buffered };
    return this.fallback((reader) => reader.byOrderId(orderId));
  }

  /**
   * MOT lop bao ve duy nhat quanh kho ben ngoai.
   *
   * Kho lich su la mot he thong KHAC: no co the cham, co the tu choi, co the vua bi khoi dong
   * lai. Khong mot truong hop nao trong so do duoc phep tro thanh mot ngoai le nem ra man hinh
   * chan doan — dung cai man hinh nguoi ta dang mo de tim loi.
   */
  private async fallback(
    ask: (reader: HistoricalTraceReaderPort) => Promise<HistoricalLookup>,
  ): Promise<TraceLookup> {
    if (!this.historical) return { status: 'unavailable', reason: 'NOT_CONFIGURED' };
    try {
      const result = await ask(this.historical);
      if (result.status === 'found') {
        return { status: 'found', origin: 'historical', traces: result.traces };
      }
      return result;
    } catch {
      // Hien thuc dang le da tu nuot loi cua no. Loi den duoc day nghia la mot loi LAP TRINH,
      // va no van khong duoc lam sap man hinh.
      return { status: 'unavailable', reason: 'STORE_ERROR' };
    }
  }
}

/**
 * Trong nhieu luot cua mot don, luot GOC la luot khong do luot nao khac gay ra.
 *
 * Cung phep loc ma `RecentTracesSink.findByOrderId` dung, va co y dung lai NGUYEN VAN: hai duong
 * tra loi cung mot cau hoi thi phai chon cung mot luot, neu khong thi nut "Xem luong xu ly" se
 * mo ra hai thu khac nhau tuy vao luot do con trong bo nho hay khong.
 */
function pickOriginTurn(traces: readonly StoredTrace[]): StoredTrace {
  const origin = traces.find(
    (trace) => !trace.records.some((record) => record.anchors.causationTraceId),
  );
  return origin ?? traces[traces.length - 1]!;
}
