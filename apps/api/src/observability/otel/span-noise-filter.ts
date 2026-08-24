import { trace, type Context } from '@opentelemetry/api';
import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-base';

/**
 * NGAN SACH SPAN — bo span vo nghia, va GAN LAI CHA cho con cua chung.
 *
 * ---------------------------------------------------------------------------
 * SO DO DUOC TREN STACK POC (24/08/2026), mot luot `/demo/simulate`:
 *
 *   61 span, trong do 56 la cua Prisma. `@prisma/instrumentation` phat BAY span cho MOT truy van:
 *
 *     prisma:client:operation                       <- model + action, CO NGHIA
 *       prisma:client:serialize                     0 ms
 *       prisma:engine:query                         <- chi boc, khong mang tin
 *         prisma:engine:connection                  0 ms
 *         prisma:engine:db_query                    <- cau SQL that, CO NGHIA
 *         prisma:engine:serialize                   0 ms
 *         prisma:engine:response_json_serialization 0 ms
 *
 * Nam trong bay cai do khong tra loi duoc cau hoi nao ma nguoi debug hoi. Giu ca bay thi ngan
 * sach "5-15 buoc mot luot" cua muc 10 chet ngay o luot dau tien, va cay tro thanh thu phai cuon
 * qua chu khong phai thu doc duoc.
 *
 * ---------------------------------------------------------------------------
 * VI SAO PHAI GAN LAI CHA chu khong chi bo:
 *
 * `prisma:engine:query` CO CON (`db_query`). Bo mot span co con ma khong lam gi them se de lai
 * mot `parentSpanId` tro toi thu khong bao gio den — UI ve ra mot cay dut, va "cay lien mach" la
 * mot trong nhung tieu chi nghiem thu cua chinh POC nay. Nen khi bo mot span, con cua no phai
 * duoc noi len TO TIEN GAN NHAT CON SONG.
 *
 * Lam duoc dieu do vi `onStart` cua cha LUON chay truoc `onEnd` cua con: den luc mot span ket
 * thuc, ta da biet ten va cha cua moi to tien cua no.
 */

/** Span BO THANG — hoac la la 0 ms, hoac chi boc mot span khac ma khong mang tin rieng. */
const DEFAULT_DROPPED_NAMES = new Set([
  'prisma:client:serialize',
  'prisma:engine:serialize',
  'prisma:engine:response_json_serialization',
  'prisma:engine:connection',
  'prisma:engine:query',
  // Khoi tao mot lan luc boot — khong thuoc ve luot nao.
  'prisma:client:detect_platform',
  'prisma:client:load_engine',
  'prisma:client:connect',
  'prisma:engine:connect',
]);

/**
 * Chan tren cua so pha he dang nho. Mot tien trinh song lau se mo hang trieu span; khong co chan
 * nay thi bo loc tro thanh mot cho ro bo nho — tuc mot loi VAN HANH sinh ra tu mot cai gan de
 * QUAN SAT, dung kieu danh doi ma bat bien fail-open cam.
 */
const MAX_TRACKED = 20_000;

interface Lineage {
  readonly name: string;
  readonly parentSpanId: string | undefined;
}

/**
 * Danh sach bo khi chi giu muc `operation`: cau SQL bien mat, ten thao tac o lai.
 * Xem `OtelRuntimeConfig.prismaDetail` de biet vi sao day la mac dinh.
 */
export function droppedSpanNames(prismaDetail: 'operation' | 'full'): ReadonlySet<string> {
  if (prismaDetail === 'full') return DEFAULT_DROPPED_NAMES;
  return new Set([...DEFAULT_DROPPED_NAMES, 'prisma:engine:db_query']);
}

export class SpanNoiseFilter implements SpanProcessor {
  private readonly lineage = new Map<string, Lineage>();

  constructor(
    private readonly delegate: SpanProcessor,
    private readonly dropped: ReadonlySet<string> = DEFAULT_DROPPED_NAMES,
  ) {}

  onStart(span: Span, parentContext: Context): void {
    try {
      if (this.lineage.size >= MAX_TRACKED) {
        // Bo lo cu nhat. Mat pha he cua span cu chi lam mot vai span bi gan cha khong toi uu;
        // giu vo han thi lam sap tien trinh. Chon cai thu nhat.
        const oldest = this.lineage.keys().next();
        if (!oldest.done) this.lineage.delete(oldest.value);
      }
      this.lineage.set(span.spanContext().spanId, {
        name: span.name,
        parentSpanId: trace.getSpanContext(parentContext)?.spanId,
      });
    } catch {
      /* fail-open */
    }
    this.delegate.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan): void {
    try {
      if (this.dropped.has(span.name)) {
        this.lineage.delete(span.spanContext().spanId);
        return;
      }
      const current = span.parentSpanContext?.spanId;
      const survivor = this.nearestSurvivingAncestor(current);
      if (survivor !== current && span.parentSpanContext) {
        // Ghi de TAI CHO. `parentSpanContext` khai bao `readonly` o muc kieu, nhung doi tuong
        // ben duoi la mot ban ghi thuong; exporter doc chinh no de dung quan he cha-con.
        (
          span as { parentSpanContext?: { traceId: string; spanId: string; traceFlags: number } }
        ).parentSpanContext = survivor
          ? { ...span.parentSpanContext, spanId: survivor }
          : undefined;
      }
      this.lineage.delete(span.spanContext().spanId);
    } catch {
      // Bo loc hong -> van xuat span. O day fail-open theo huong GIU: mot cay hoi ram con hon
      // mot cay thieu span. (Khac voi cong rieng tu, noi fail-open phai theo huong BO.)
    }
    this.delegate.onEnd(span);
  }

  /** Leo len den to tien dau tien khong nam trong danh sach bo. */
  private nearestSurvivingAncestor(spanId: string | undefined): string | undefined {
    let cursor = spanId;
    // Chan vong lap: pha he hong (cha tro vao chinh no) khong duoc lam treo tien trinh.
    for (let hop = 0; hop < 64 && cursor; hop += 1) {
      const entry = this.lineage.get(cursor);
      if (!entry || !this.dropped.has(entry.name)) return cursor;
      cursor = entry.parentSpanId;
    }
    return cursor;
  }

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush();
  }

  shutdown(): Promise<void> {
    this.lineage.clear();
    return this.delegate.shutdown();
  }
}
