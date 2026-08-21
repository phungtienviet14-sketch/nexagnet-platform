/**
 * MO HINH HIEN THI cua mot luot xu ly — thu console ve ra man hinh.
 *
 * CO Y KHONG phai `TelemetryRecord` (kieu noi bo cua API): ban ghi tho mang spanId/parentSpanId
 * va quan he cha-con phai tu dung lai. Neu day nguyen no sang web thi logic dung cay bi viet hai
 * lan — mot ban trong `tools/trace-view.mjs`, mot ban trong React — va hai ban do se troi khoi
 * nhau. API lam phang san thanh danh sach co `depth`; web chi con viec ve.
 */

export type TraceNodeKind = 'step' | 'decision' | 'state' | 'data' | 'ai';

/** Ket cuc de to mau. `ok`/`error` cho buoc; ba gia tri con lai cho quyet dinh. */
export type TraceNodeOutcome = 'ok' | 'error' | 'allowed' | 'denied' | 'degraded';

export interface TraceNode {
  readonly kind: TraceNodeKind;
  /** Do sau trong cay, da tinh san. */
  readonly depth: number;
  /** Nhan chinh: ten buoc, ten cong quyet dinh, ten thuc the… */
  readonly label: string;
  readonly outcome?: TraceNodeOutcome;
  /** Ma ly do CO KIEU — thu tra loi cau "vi sao". */
  readonly reason?: string;
  /** Nhan tieng Viet cua `reason`, de nguoi khong thuoc du an van doc duoc. */
  readonly reasonLabel?: string;
  readonly durationMs?: number;
  /** Mot dong phu: delta du lieu, chuyen trang thai, so lieu nguong… */
  readonly detail?: string;
  /**
   * `true` = chi tiet KY THUAT, console AN MAC DINH.
   *
   * Yeu cau cua nguoi dung: "khong hien thi raw technical spans mac dinh". Nut gat trong UI mo
   * ra khi can, chu khong xoa han — mot buoc chay 4 giay van la manh moi quan trong.
   */
  readonly technical?: boolean;
}

export interface TraceView {
  readonly traceId: string;
  readonly tenant: string;
  readonly environment: string;
  /** 12 ky tu dau cua git SHA. Vang mat = chay local/khong biet release. */
  readonly release?: string;
  readonly startedAt: string;
  /** chatId / orderId / messageId / intent… — de doi chieu nhanh. */
  readonly anchors: Readonly<Record<string, string>>;
  readonly nodes: readonly TraceNode[];
  /** Tong thoi gian cua buoc ngoai cung. */
  readonly totalMs?: number;
}
