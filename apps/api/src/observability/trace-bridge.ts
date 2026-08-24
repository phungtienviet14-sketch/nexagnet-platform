/**
 * CAU NOI giua `TelemetryService` (ngu nghia nghiep vu) va MOT runtime tracing ben ngoai.
 *
 * ---------------------------------------------------------------------------
 * VI SAO CO LOP NAY thay vi goi thang OpenTelemetry trong `telemetry.service.ts`:
 *
 * `telemetry-record.ts` co mot cau o dau file — "file nay khong import bat ky SDK observability
 * nao" — va do khong phai khau hieu. Ngay `TelemetryService` biet ten mot SDK, moi bai test cua
 * no phai dung SDK do len, va viec doi backend tro thanh viec sua tang nghiep vu. Cau noi giu
 * dung ranh gioi ay: tang nghiep vu chi biet MOT giao dien bon phuong thuc, con ai hien thuc no
 * la chuyen cua `observability/otel/`.
 *
 * ---------------------------------------------------------------------------
 * VI SAO CAU NOI *MO SPAN* CHU KHONG PHAI *NHAN BAN GHI DA XONG*:
 *
 * Cach hien nhien hon la them mot `TelemetrySink` day OTLP. Cach do SAI o dung cho quan trong
 * nhat: mot sink chi nhan duoc ban ghi SAU khi buoc da chay xong, nen no khong con o trong
 * `context` cua buoc do. Ma span TU DONG (undici goi DeepSeek, Prisma truy van) duoc SDK tao ra
 * TRONG luc buoc dang chay, va chung tim cha cua minh qua `context` — khong qua ban ghi cua ta.
 *
 * Ket qua cua cach sink: hai cay roi nhau. Cay nghiep vu cua ta, va mot dam span DB/HTTP mo coi.
 * Dung ca hai deu khong tra loi duoc cau "truy van nao cham trong buoc `order.persist`".
 *
 * Nen cau noi phai MO span TRUOC roi chay `fn` BEN TRONG no. Luc do span tu dong tu tim thay
 * cha, va `traceId`/`spanId` cua ta lay thang tu span OTel — MOT cay duy nhat, khong phai hai
 * cay duoc khau lai bang mot truong chung.
 *
 * ---------------------------------------------------------------------------
 * FAIL-OPEN: moi hien thuc cua giao dien nay PHAI chay `fn` du chuyen gi xay ra voi span.
 * `NOOP_TRACE_BRIDGE` la hanh vi hien tai cua he thong, nguyen ven.
 */
export interface TraceBridge {
  /**
   * Mo span GOC cua mot luot va chay `run` ben trong no.
   *
   * `run` nhan lai mot `traceparent` — day chinh la co che de `traceId` NGHIEP VU va `traceId`
   * cua runtime tracing la MOT. `TelemetryService` truyen no vao `runInTrace({ continueFrom })`,
   * tuc dung lai duong noi tiep trace da co san tu truoc; khong them mot loi ghi nao vao
   * `trace-context.ts`.
   *
   * Tra `undefined` = "khong co runtime nao dang chay" -> ben goi tu sinh id nhu cu.
   */
  turn<T>(continueFrom: string | undefined, run: (traceparent: string | undefined) => T): T;

  /**
   * Mo span cua MOT BUOC NGHIEP VU va chay `run` ben trong no.
   * `run` nhan `spanId` cua span vua mo, de ban ghi nghiep vu deo dung id do.
   */
  step<T>(name: string, run: (spanId: string | undefined) => Promise<T>): Promise<T>;

  /** Ghi mot SU KIEN DIEM (quyet dinh, chuyen trang thai, thay doi du lieu) len span dang chay. */
  event(name: string, attributes: Readonly<Record<string, unknown>>): void;

  /**
   * Ghi mot lan goi LLM DA XONG thanh span con co thoi luong that.
   * Nhan `durationMs` chu khong boc quanh lan goi — cung ly do voi `TelemetryService.aiCall()`.
   */
  aiCall(input: {
    readonly name: string;
    readonly durationMs: number;
    readonly status: 'ok' | 'error';
    readonly attributes: Readonly<Record<string, unknown>>;
    readonly error?: { readonly name: string; readonly message: string };
  }): void;

  /** Gan neo nghiep vu (chatId, orderId, intent…) len span dang chay. */
  anchor(attributes: Readonly<Record<string, unknown>>): void;
}

/** Hanh vi HIEN TAI cua he thong: khong runtime nao, khong span nao, `fn` chay y nguyen. */
export const NOOP_TRACE_BRIDGE: TraceBridge = {
  turn: (_continueFrom, run) => run(undefined),
  step: (_name, run) => run(undefined),
  event: () => undefined,
  aiCall: () => undefined,
  anchor: () => undefined,
};
