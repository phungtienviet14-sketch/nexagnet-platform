import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Optional,
  Param,
  Post,
} from '@nestjs/common';
import { InternalService } from '../auth/internal-service.guard.js';
import { TelemetryService } from '../observability/telemetry.service.js';
import {
  SalesHandoffFollowupService,
  type FollowupMarkResult,
  type HandoffStateView,
} from './sales-handoff-followup.service.js';

/**
 * Kenh cua luot: viec nay den tu MOT TIEN TRINH WORKER — khong tu nguoi, khong tu tin Zalo.
 * Doc len tren trace la ra ngay "ai goi", ma khong phai suy tu duong dan.
 */
const WORKFLOW_CALLBACK_CHANNEL = 'workflow_worker';

/**
 * DUONG QUAY LAI cua worker workflow — `sales-handoff-followup` hoi va ghi qua day.
 *
 * ---------------------------------------------------------------------------
 * VI SAO WORKER NOI CHUYEN QUA HTTP thay vi cam thang vao DB:
 *
 * `WorkflowWorkerModule` CO Y khong nap `AppModule` (xem chu thich cua chinh no): worker boot
 * `AppModule` se mo mot listener zca THU HAI tren cung tai khoan Zalo va ha kenh doc chinh cua
 * GĐ1. Nen tien trinh worker khong co — va khong duoc co — kho du lieu nghiep vu.
 *
 * Cho worker mot `PrismaClient` rieng cung khong phai duong ra: no se ghi thang vao `Order`,
 * vuot mat moi cong nghiep vu o `OrdersService`. Duong nay giu DUNG MOT nguoi ghi.
 *
 * Day cung la khuon ma `integration-handoff` da dung (ten dich den logic -> URL tu bien moi
 * truong), chi khac o cho dich den lan nay la chinh ta.
 *
 * ---------------------------------------------------------------------------
 * `internal/` trong duong dan la mot LOI HUA VE DOI TUONG GOI, khong phai mot co che bao ve.
 * Bao ve that nam o HAI lop doc lap:
 *
 *   1. `InternalServiceGuard` — doi mot khoa dich vu (`x-api-key` khop `API_KEY`), chay o MOI
 *      che do `AUTH_MODE` tru `none`, va TU CHOI khi khoa chua duoc cau hinh;
 *   2. vanh dai mang cua compose — `internal/*` khong nam trong matcher `@api` cua Caddy, va
 *      `caddy-route-contract.test.mjs` giu dieu do bang mot khang dinh PHU DINH.
 *
 * Lop 2 mot minh la khong du: moi container trong cung mang khach deu goi duoc `api:3001`.
 */
/*
 * `@InternalService()` chu KHONG phai `@Roles(...)`: khong co NGUOI nao dung sau hai endpoint
 * nay. Vai tro RBAC o day se la mot lop bao ve gia — worker khong co phien de mang mot vai tro,
 * va o `AUTH_MODE=session` thi `@Roles` lam no bi 401 truoc khi cham toi controller.
 *
 * Ban than decorator nay la thu BAT xac thuc, khong phai tat: `InternalServiceGuard` doi mot
 * khoa dich vu hop le va FAIL-CLOSED khi `API_KEY` chua duoc cau hinh.
 */
@InternalService()
@Controller('internal/sales-handoff')
export class SalesHandoffController {
  constructor(
    private readonly followup: SalesHandoffFollowupService,
    /**
     * `@Optional()` giong moi noi goi telemetry khac: quan sat KHONG duoc la dieu kien de nghiep
     * vu chay duoc. Thieu no thi khong noi duoc soi day, nhung viec ban giao van duoc danh dau.
     */
    @Optional() private readonly telemetry?: TelemetryService,
  ) {}

  /**
   * Trang thai HIEN TAI cua viec ban giao.
   *
   * 404 khi khong co don — va do la mot cau tra loi, khong phai mot su co: worker doi no thanh
   * `state: 'absent'` roi ket thuc workflow. Mot don da bi xoa thi khong con gi de nhac.
   */
  @Get(':id')
  async state(@Param('id') id: string): Promise<HandoffStateView> {
    const state = await this.followup.readState(id);
    if (!state) throw new NotFoundException(`Khong tim thay don ${id}`);
    return state;
  }

  /**
   * Danh dau viec ban giao la qua han.
   *
   * VAI TRO CUA `Idempotency-Key`, noi cho dung:
   *
   * May chu KHONG luu, KHONG tieu thu va KHONG doi soat khoa nay. No la mot NEO DOI SOAT trong
   * log/trace — "lan goi nay thuoc thao tac nao" — chu KHONG phai mot cong exactly-once.
   *
   * Ban dau cho nay ghi rang khoa la "lop chong trung thu nhat" trong hai lop. Do la mot tuyen
   * bo SAI ve chinh code cua no, va soat lai da bat duoc: mot khoa khong ai doc thi khong chan
   * duoc gi. Cong THAT SU la `compareAndSet` trong `SalesHandoffFollowupService` — khoa hang roi
   * doc-quyet dinh-ghi trong cung mot giao dich.
   *
   * Neu ve sau can khoa lam cong that (vi du de tra lai CUNG mot phan hoi cho mot lan thu lai),
   * thi phai luu no that: mot bang khoa + rang buoc duy nhat. Dung tuyen bo truoc roi lam sau.
   */
  @Post(':id/followup')
  async markFollowup(
    @Param('id') id: string,
    @Body() body: { stage?: unknown },
    @Headers('traceparent') traceparent?: string,
  ): Promise<FollowupMarkResult> {
    const stage = typeof body?.stage === 'string' ? body.stage.trim() : '';
    // Khong doan mot mac dinh: mot `stage` rong nghia la ben goi dang hong, va lang le nhac
    // duoi mot cai ten bia se lam ban ghi khong doi soat duoc voi khoa thao tac cua chinh no.
    if (!stage) throw new BadRequestException("Thieu 'stage' trong than yeu cau");

    // 404 duoc nem NGOAI luot: mot don khong con la mot CAU TRA LOI (worker doi no thanh "het
    // viec"), khong phai mot buoc that bai. Nem no ben trong se gan nhan `error` cho mot luot
    // hoan toan binh thuong.
    const result = await this.workerTurn(id, traceparent, () =>
      this.followup.markFollowup(id, stage),
    );
    if (!result) throw new NotFoundException(`Khong tim thay don ${id}`);
    return result;
  }

  /**
   * NOI SOI DAY W3C tu worker vao ngu canh trace cua tien trinh nay.
   *
   * ---------------------------------------------------------------------------
   * VI SAO O DAY, VA VI SAO CAN:
   *
   * Truoc ban sua nay, lan danh dau follow-up ra doi voi `traceId = "no-trace"` — gia tri du
   * phong cua `TelemetryService.envelope()` khi khong co luot nao dang mo. `RecentTracesSink` bo
   * thang ban ghi do, nen mat xich CUOI cua ca day (`approve -> outbox -> Hatchet -> worker ->
   * callback -> mark`) bien mat khoi trace view.
   *
   * Worker DA gui header (`sales-handoff-followup.steps.ts` -> `headers()`) va ha tang doc no DA
   * co san (`parseTraceparent`, `runInTrace({ continueFrom })`). Thu duy nhat thieu la mot nguoi
   * dung o RANH GIOI HTTP nhat header len va trao cho `runTurn` — dung mot viec do.
   *
   * ---------------------------------------------------------------------------
   * DAY LA "NOI TIEP", KHONG PHAI "KEO DAI":
   *
   * Ta KHONG mo mot span song qua suot lan ngu ben vung (co the la nhieu ngay). Luot nay bat dau
   * khi request toi va ket thuc khi no tra loi — dung mo hinh cua distributed tracing: ben goi
   * gui `traceparent`, ben nhan mo MOT SPAN MOI THUOC CUNG TRACE.
   *
   * Header hong/thieu -> `parseTraceparent` tra `null` -> `runInTrace` mo `traceId` MOI va viec
   * van chay. Mot header cua ben thu ba khong duoc phep lam rot mot don hang, va cung khong duoc
   * tro thanh danh tinh cua luot.
   *
   * `GET :id` KHONG di qua duong nay co chu y: no khong ghi ban ghi telemetry nao, nen bao no
   * trong mot luot chi tao ra mot luot RONG. Khi no co ban ghi thi them mot dong o day.
   */
  private workerTurn<T>(
    orderId: string,
    traceparent: string | undefined,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!this.telemetry) return fn();
    return this.telemetry.runTurn({ orderId, channel: WORKFLOW_CALLBACK_CHANNEL }, fn, traceparent);
  }
}
