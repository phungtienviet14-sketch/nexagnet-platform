import type { TraceView } from './trace-view.js';

/**
 * MO HINH HIEN THI cua man hinh "Luong xu ly" — thu console ve ra khi nguoi ta hoi
 * "don nay da di qua nhung dau, va no dang mac o cho nao".
 *
 * ---------------------------------------------------------------------------
 * VI SAO KHONG PHAI CHI MOT `TraceView`:
 *
 * Mot `TraceView` la MOT LUOT — mot giao dich chay xong trong vai tram mili giay. Nhung mot don
 * hang khong song trong mot luot: tin Zalo vao luc T0, nguoi bam duyet luc T0+5 phut, workflow
 * danh dau nhac luc T0+2 gio. Ba luot, ba `traceId`, noi voi nhau bang `causationTraceId`.
 *
 * Ve mot luot roi goi do la "luong xu ly cua don" se giau mat dung phan ma nguoi debug can nhat:
 * cai khoang giua cac luot, va cai gi da chay trong khoang do.
 *
 * ---------------------------------------------------------------------------
 * RANH GIOI NGON NGU cua toan bo mo hinh nay:
 *
 *   Truong `*Label`, `displayName`, `description`, `notes`  -> TIENG VIET, cho nguoi doc.
 *   Truong `key`, `traceId`, `engineRunId`, `operationKey`  -> GIU NGUYEN, cho may va cho tra cuu.
 *
 * Ca hai deu di xuong web. Console hien tieng Viet o vi tri chinh va chuoi ky thuat o vi tri phu —
 * chu KHONG chon mot trong hai, vi nguoi dung can hieu nghiep vu con nguoi debug can dan chuoi do
 * vao o tim cua engine.
 */

/** Mot LUOT xu ly da duoc ghi lai cho don nay. */
export interface DebugTurn {
  /** Cay nghiep vu cua chinh luot do — dung y nguyen mo hinh da co. */
  readonly view: TraceView;
  /** Kenh viec di vao, bang tieng Viet (`Tin nhắn Zalo`, `Người thao tác trên console`…). */
  readonly channelLabel: string;
  /** Ma kenh goc (`zca`, `operator_console`, `workflow_worker`). Vang mat = khong ghi nhan duoc. */
  readonly channel?: string;
  /**
   * `true` = luot nay do mot luot khac gay ra (co `causationTraceId`).
   *
   * Console phai phan biet duoc: mot luot dan xuat dung dau danh sach nghia la luot GOC da roi
   * khoi vong dem, chu khong nghia la don bat dau tu do.
   */
  readonly derived: boolean;
  readonly startedAt: string;
}

/** Trang thai BAN GIAO cua mot su kien tu DB nghiep vu sang engine. */
export type DebugHandoffStatus = 'pending' | 'claimed' | 'dispatched' | 'failed' | 'cancelled';

/** Mot BUOC trong khuon, kem nhan nguoi doc. Day la KE HOACH cua khuon, khong phai trang thai. */
export interface DebugWorkflowStep {
  /** KHOA MAY — dung y nguyen ten worker dang ky voi engine. Tra cuu tren dashboard bang no. */
  readonly key: string;
  readonly label: string;
  readonly description: string;
}

/**
 * Mot lan BAN GIAO sang workflow engine, kem metadata nguoi-doc cua khuon.
 *
 * ---------------------------------------------------------------------------
 * GIOI HAN DA BIET CUA v0, ghi thang o day de khong ai doc nham mo hinh nay:
 *
 * `steps` la KE HOACH khai trong code, KHONG phai trang thai tung buoc. Nexagnet khong giu
 * trang thai tung buoc — no nam ben engine. Bay ra mot dau tich xanh canh moi buoc trong khi
 * khong doc gi tu engine se la bia dat, va bia dat tren mot man hinh chan doan thi te hon la
 * khong co man hinh do.
 *
 * Trang thai o day co hai muc, va ca hai deu co nguon that:
 *   `handoffStatus`  tu bang outbox cua CHINH TA — "viec da sang duoc engine chua".
 *   `engineStatus`   tu engine, khi hoi duoc. Vang mat = khong hoi duoc, khong phai "chua chay".
 */
export interface DebugWorkflowRun {
  /** KHOA MAY on dinh cua khuon (`sales-handoff-followup`). */
  readonly key: string;
  readonly version: string;
  /** Ten da dang ky voi engine, gom phien ban (`sales-handoff-followup.v1`). */
  readonly engineName: string;
  /** Ten nghiep vu tieng Viet. Bang chinh `key` khi khuon chua co metadata. */
  readonly displayName: string;
  readonly description: string;
  /** `false` = khuon chua co metadata nguoi-doc; console phai noi ro thay vi im lang. */
  readonly known: boolean;

  readonly handoffStatus: DebugHandoffStatus;
  readonly handoffStatusLabel: string;
  readonly queuedAt: string;
  readonly dispatchedAt?: string;
  /** So lan dispatcher da THU ban giao. >1 nghia la co lan hong — dang de y. */
  readonly attempts: number;

  /** Danh tinh de tra cuu: dan thang vao o tim cua engine / cua log. */
  readonly engineRunId?: string;
  readonly operationKey: string;
  /** Trang thai THO cua engine (`RUNNING`, `SUCCEEDED`…). Vang mat = khong hoi duoc engine. */
  readonly engineStatus?: string;
  readonly engineStatusLabel?: string;
  readonly dashboardUrl?: string;
  readonly lastError?: string;

  readonly steps: readonly DebugWorkflowStep[];
}

/**
 * HAI CON SO THOI GIAN, va ly do phai la hai chu khong phai mot.
 *
 * Truoc ban nay console hien mot con so duy nhat lay tu `TraceView.totalMs` — do dai buoc ngoai
 * cung cua MOT luot. Voi mot day nhan qua keo dai 92 giay qua mot lan cho ben vung, con so do
 * hien ra la "92ms". No khong sai ve ky thuat va sai hoan toan ve nghia: nguoi doc ket luan he
 * thong phan hoi tuc thi, trong khi thu ho dang nhin la mot viec mat gan hai phut.
 *
 * Nen tach: mot con so do CONG VIEC MAY LAM, mot con so do KHOANG NGUOI CHO.
 */
export interface DebugDurations {
  /** Do dai xu ly DONG BO cua luot goc. Khong bao gio bao trum lan cho ben vung. */
  readonly synchronousMs?: number;
  /**
   * Khoang tu luot DAU toi luot CUOI da ghi nhan cho don nay — co bao trum lan cho ben vung.
   *
   * Vang mat khi chi co mot luot: mot khoang bang 0 se bi doc thanh "xong ngay", trong khi su
   * that la "chua co gi de do".
   */
  readonly causalSpanMs?: number;
  readonly turnCount: number;
}

export interface OrderDebugView {
  readonly orderId: string;
  readonly tenant: string;
  readonly environment: string;
  /** 12 ky tu dau cua git SHA. Vang mat = chay local/khong biet release. */
  readonly release?: string;
  /** Cac luot da ghi nhan, CU NHAT TRUOC — doc xuoi tu tren xuong la doc theo thoi gian. */
  readonly turns: readonly DebugTurn[];
  readonly workflows: readonly DebugWorkflowRun[];
  readonly durations: DebugDurations;
  /**
   * GIOI HAN DA BIET cua chinh cau tra loi nay, bang tieng Viet.
   *
   * Vi du: "vong dem chi giu cac luot gan day", "khong hoi duoc engine". Day la truong QUAN
   * TRONG NHAT cua mo hinh: mot man hinh chan doan im lang ve cho no khong biet se bi doc thanh
   * "cho do khong co gi", va nguoi debug se di tim loi o dung cho khong co loi.
   */
  readonly notes: readonly string[];
}
