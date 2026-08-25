import { Injectable } from '@nestjs/common';
import type { TelemetryRecord, TelemetrySink } from './telemetry-record.js';

/**
 * GIU LAI cac luot GAN DAY trong bo nho, de console doc duoc.
 *
 * VI SAO CAN: `StructuredLogSink` ghi ra stdout roi quen. Do la du cho nguoi van hanh
 * (`docker logs | tools/trace-view.mjs`), nhung console Next.js khong doc duoc stdout cua mot
 * container khac. Ma yeu cau la Sale/dev bam mot nut trong console va thay ngay luong xu ly.
 *
 * VI SAO KHONG LUU DB: quyet dinh kien truc giu nguyen — khong them ha tang cho quan sat
 * (docs/kien-truc/observability-review.md §13). Mot vong dem co tran giai quyet dung bai toan
 * "xem luot vua chay" ma khong them bang, khong them migration, khong them container.
 *
 * DANH DOI DA BIET VA CHAP NHAN: mat khi restart, va chi giu duoc N luot gan nhat. Voi 10-20
 * don/ngay thi N=300 la vai ngay lam viec. Can lau hon thi dung `docker logs` (van co day du),
 * hoac dung backend that — luc do chi la them mot sink.
 *
 * TRAN LA BAT BUOC, khong phai toi uu: mot Map khong tran trong tien trinh chay lien tuc la mot
 * ro ri bo nho co lich hen gio.
 */

/** Bao nhieu LUOT giu lai. */
const MAX_TRACES = 300;
/** Tran cung theo BAN GHI — mot luot benh hoan (vong lap tool) khong duoc an het bo nho. */
const MAX_RECORDS = 5_000;
/** Tran ban ghi cho MOT luot. */
const MAX_RECORDS_PER_TRACE = 200;

export interface StoredTrace {
  readonly traceId: string;
  readonly records: readonly TelemetryRecord[];
  readonly startedAt: string;
}

@Injectable()
export class RecentTracesSink implements TelemetrySink {
  /** `Map` giu THU TU CHEN, nen khoa dau tien luon la luot cu nhat — khong can sap xep. */
  private readonly traces = new Map<string, TelemetryRecord[]>();
  private totalRecords = 0;

  record(record: TelemetryRecord): void {
    // Ban ghi ngoai moi trace (script, test) khong thuoc ve luot nao — bo qua, khong tao khoa rac.
    if (!record.traceId || record.traceId === 'no-trace') return;

    const existing = this.traces.get(record.traceId);
    if (existing) {
      if (existing.length >= MAX_RECORDS_PER_TRACE) return;
      existing.push(record);
      this.totalRecords += 1;
    } else {
      this.traces.set(record.traceId, [record]);
      this.totalRecords += 1;
    }
    this.evictIfNeeded();
  }

  /** Mot luot cu the, theo thu tu ghi. */
  get(traceId: string): StoredTrace | null {
    const records = this.traces.get(traceId);
    if (!records || records.length === 0) return null;
    return { traceId, records: [...records], startedAt: records[0]!.at };
  }

  /**
   * Tim luot DA SINH RA mot don. Quet nguoc tu luot MOI NHAT: nguoi debug hau nhu luon hoi ve
   * don vua chay, va don cu thi da roi khoi vong dem tu lau.
   *
   * TU 22/08/2026 mot don co the co NHIEU luot: luot tin Zalo tao ra no, roi cac luot NGUOI BAM
   * NUT (duyet/tu choi/hoan tat ERP) neo vao cung `orderId`. Hop dong cua ham nay — va cua nut
   * "Xem luong xu ly" — la luot GOC, nen luot dan xuat bi loai bang chinh mo hinh du lieu:
   * `causationTraceId` co mat <=> luot nay do mot luot khac gay ra. Khong doan theo ten kenh,
   * khong doan theo thu tu.
   *
   * Khong con luot goc trong vong dem (da bi day ra vi tran) thi tra luot dan xuat moi nhat —
   * mot cau tra loi khong day du van hon mot 404, va `causationTraceId` tren no chi tiep duong
   * tra cuu trong `docker logs`.
   */
  findByOrderId(orderId: string): StoredTrace | null {
    const entries = [...this.traces.entries()].reverse();
    let derived: StoredTrace | null = null;
    for (const [traceId, records] of entries) {
      if (!records.some((record) => record.anchors.orderId === orderId)) continue;
      const stored: StoredTrace = { traceId, records: [...records], startedAt: records[0]!.at };
      if (!records.some((record) => record.anchors.causationTraceId)) return stored;
      derived ??= stored;
    }
    return derived;
  }

  /**
   * MOI luot con giu duoc cua mot don, CU NHAT TRUOC.
   *
   * Khac `findByOrderId` mot cach co chu dich, va hai ham nay tra loi hai cau hoi khac nhau:
   *
   *   `findByOrderId`     "luot NAO da sinh ra don nay" — mot cau tra loi, uu tien luot goc.
   *   `findAllByOrderId`  "don nay da di qua nhung dau" — ca chuoi, ke ca cac luot cach nhau
   *                       hang gio (nguoi bam duyet, worker workflow goi nguoc ve).
   *
   * Cau thu hai la cau ma man hinh chan doan hoi. Tra loi no bang cau thu nhat se lam bien mat
   * dung phan dat gia nhat: cai khoang giua cac luot.
   *
   * `Map` giu THU TU CHEN, va thu tu chen la thu tu luot BAT DAU — nen khong sort lai o day.
   */
  findAllByOrderId(orderId: string): readonly StoredTrace[] {
    const found: StoredTrace[] = [];
    for (const [traceId, records] of this.traces) {
      if (!records.some((record) => record.anchors.orderId === orderId)) continue;
      found.push({ traceId, records: [...records], startedAt: records[0]!.at });
    }
    return found;
  }

  /** Danh sach luot gan day — moi nhat truoc. */
  list(limit = 50): readonly StoredTrace[] {
    return [...this.traces.entries()]
      .reverse()
      .slice(0, limit)
      .map(([traceId, records]) => ({
        traceId,
        records: [...records],
        startedAt: records[0]!.at,
      }));
  }

  /** Cho test va endpoint chan doan. */
  stats(): { traces: number; records: number } {
    return { traces: this.traces.size, records: this.totalRecords };
  }

  private evictIfNeeded(): void {
    while (this.traces.size > MAX_TRACES || this.totalRecords > MAX_RECORDS) {
      const oldest = this.traces.keys().next();
      if (oldest.done) return;
      this.totalRecords -= this.traces.get(oldest.value)?.length ?? 0;
      this.traces.delete(oldest.value);
    }
  }
}
