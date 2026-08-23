import type { ZodType } from 'zod';
import {
  isContentKey,
  isPiiKey,
  isSecretKey,
  scrubPii,
  scrubSecrets,
} from '../observability/telemetry-redaction.js';

/**
 * CONG DUY NHAT de mot gia tri cua Nexagnet tro thanh dau vao cua workflow engine.
 *
 * VI SAO PHAI CO CONG NAY (do duoc, khong phai lo lang gia dinh):
 * POC 22/08/2026 chung minh Hatchet luu `input` cua run **NGUYEN VAN** va hien no tren dashboard.
 * Trong POC do, `input` chua `phone`/`address` chua che. Nghia la che du lieu o buoc dau tien
 * cua workflow la QUA MUON — luc do payload da nam trong Postgres cua engine roi. Phai chan
 * TRUOC khi goi engine.
 *
 * ---------------------------------------------------------------------------
 * DANH SACH TRANG, KHONG PHAI BO LOC. Day la khac biet quan trong nhat cua file nay so voi
 * `telemetry-redaction.ts` va `audit-redaction.ts`:
 *
 *   bo loc         = "cho moi thu di qua, xoa nhung gi nhan ra"  -> cai khong nhan ra thi LOT
 *   danh sach trang = "chi cho di qua nhung gi da khai bao"      -> cai khong khai bao KHONG LOT
 *
 * Mot bo loc phai doan dung MOI hinh dang cua du lieu nhay cam. Mot danh sach trang khong phai
 * doan gi ca. Voi du lieu roi khoi he thong sang mot engine ngoai, chi cai thu hai la du.
 *
 * Bo do (`scrubSecrets`/`isPiiKey`/…) van con, nhung o vai LUOI AN TOAN THU HAI: no bat truong
 * hop lap trinh vien khai bao mot truong hop le ve kieu nhung lai nhet noi dung nhay cam vao.
 *
 * ---------------------------------------------------------------------------
 * NEM, KHONG CHE. Ba bo che hien co deu fail-open co chu dich (quan sat khong duoc lam sap
 * nghiep vu). O day thi nguoc lai:
 *
 *   · che im lang -> workflow chay tiep voi du lieu DA HONG, va khong ai biet;
 *   · nem         -> lap trinh vien thay ngay o test, truoc khi payload roi khoi may.
 *
 * ---------------------------------------------------------------------------
 * THAM CHIEU vs ANH CHUP — quy uoc bat buoc:
 *
 *   THAM CHIEU (dung cai nay): gui `entityType` + `entityId`. Worker goi nguoc lai dich vu
 *     nghiep vu qua cong duoc ho tro de lay du lieu MOI NHAT. He qua: engine khong bao gio giu
 *     PII, va worker luon lam viec tren trang thai hien tai chu khong phai trang thai luc trigger.
 *
 *   ANH CHUP (tranh): nhet ca thuc the vao input. He qua: PII nam trong DB engine 30 ngay
 *     (`SERVER_LIMITS_DEFAULT_TENANT_RETENTION_PERIOD`), va du lieu cu di ra ngoai neu don bi
 *     sua sau luc trigger.
 *
 * Chi dung anh chup khi gia tri PHAI la gia tri tai thoi diem quyet dinh (vi du tong tien da
 * chot de doi chieu) — va khi do van phai la truong toi thieu, khong phai ca thuc the.
 */

/** Ly do TU CHOI — co kieu, de loc duoc va de test khang dinh dung nguyen nhan. */
export const WORKFLOW_INPUT_REJECTIONS = [
  /** Payload khong khop hop dong: thieu truong, sai kieu, hoac co truong khong khai bao. */
  'CONTRACT_VIOLATION',
  /** Ten khoa mang nghia bi mat (`apiKey`, `token`, `password`…). */
  'SECRET_KEY_IN_INPUT',
  /** Gia tri trong nhu bi mat (JWT, `sk-ant-…`, URL co mat khau, `Bearer …`). */
  'SECRET_VALUE_IN_INPUT',
  /** Ten khoa mang nghia du lieu ca nhan (`phone`, `address`, `email`…). */
  'PII_KEY_IN_INPUT',
  /** Gia tri trong nhu du lieu ca nhan (SDT Viet Nam, email). */
  'PII_VALUE_IN_INPUT',
  /** Noi dung hoi thoai (`rawText`, `message`, `content`…) — engine khong bao gio can. */
  'CONTENT_IN_INPUT',
  /** `traceparent` sai khuon W3C. */
  'MALFORMED_TRACEPARENT',
] as const;

export type WorkflowInputRejection = (typeof WORKFLOW_INPUT_REJECTIONS)[number];

/** Nhan tieng Viet cho nguoi doc log/runbook. Tach khoi ma vi ma la thu MAY loc. */
export const WORKFLOW_INPUT_REJECTION_LABELS: Record<WorkflowInputRejection, string> = {
  CONTRACT_VIOLATION: 'Payload không khớp hợp đồng đầu vào của workflow',
  SECRET_KEY_IN_INPUT: 'Có khoá mang nghĩa bí mật trong payload',
  SECRET_VALUE_IN_INPUT: 'Có giá trị trông như bí mật trong payload',
  PII_KEY_IN_INPUT: 'Có khoá mang nghĩa dữ liệu cá nhân trong payload',
  PII_VALUE_IN_INPUT: 'Có giá trị trông như dữ liệu cá nhân trong payload',
  CONTENT_IN_INPUT: 'Có nội dung hội thoại trong payload',
  MALFORMED_TRACEPARENT: 'traceparent sai khuôn W3C',
};

export class WorkflowInputRejected extends Error {
  constructor(
    readonly reason: WorkflowInputRejection,
    readonly path: string,
    detail?: string,
  ) {
    super(
      `WORKFLOW_INPUT_REJECTED[${reason}] tai '${path}': ${WORKFLOW_INPUT_REJECTION_LABELS[reason]}` +
        (detail ? ` — ${detail}` : ''),
    );
    this.name = 'WorkflowInputRejected';
  }
}

/**
 * Hop dong dau vao cua MOT workflow. Bat buoc `.strict()` o phia goi: zod `.strict()` la thu
 * bien "danh sach trang" tu mot loi hua thanh mot dieu runtime ep buoc.
 */
export interface WorkflowInputContract<T> {
  readonly schema: ZodType<T>;
}

export function defineWorkflowInput<T>(schema: ZodType<T>): WorkflowInputContract<T> {
  return { schema };
}

const MAX_DEPTH = 8;

/** Quet mot cay gia tri DA qua hop dong. Nem ngay o vi pham dau tien, kem duong dan. */
function assertNoSensitiveContent(value: unknown, path: string, depth: number): void {
  if (depth > MAX_DEPTH) {
    throw new WorkflowInputRejected('CONTRACT_VIOLATION', path, `sau qua ${MAX_DEPTH} muc`);
  }
  if (typeof value === 'string') {
    if (scrubSecrets(value) !== value) {
      throw new WorkflowInputRejected('SECRET_VALUE_IN_INPUT', path);
    }
    if (scrubPii(value) !== value) throw new WorkflowInputRejected('PII_VALUE_IN_INPUT', path);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitiveContent(item, `${path}[${index}]`, depth + 1));
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (isSecretKey(key)) throw new WorkflowInputRejected('SECRET_KEY_IN_INPUT', childPath);
    if (isPiiKey(key)) throw new WorkflowInputRejected('PII_KEY_IN_INPUT', childPath);
    if (isContentKey(key)) throw new WorkflowInputRejected('CONTENT_IN_INPUT', childPath);
    assertNoSensitiveContent(item, childPath, depth + 1);
  }
}

/**
 * Dung dau vao workflow tu mot gia tri nghiep vu.
 *
 * Hai cua, theo dung thu tu: (1) hop dong — chi truong da khai bao di qua; (2) luoi an toan —
 * khong truong nao duoc mang bi mat/PII/noi dung.
 *
 * Tra ve ban SAO roi rac: mot payload da gui di khong duoc phep doi noi dung vi code chay sau no
 * sua doi tuong nghiep vu goc.
 */
export function buildWorkflowInput<T>(contract: WorkflowInputContract<T>, value: unknown): T {
  const parsed = contract.schema.safeParse(value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new WorkflowInputRejected(
      'CONTRACT_VIOLATION',
      first?.path.join('.') || '(goc)',
      first?.message,
    );
  }
  assertNoSensitiveContent(parsed.data, '', 0);
  return structuredClone(parsed.data);
}

/** Bo neo TUONG QUAN duoc phep gan vao run. Ngoai danh sach nay thi khong co duong nao vao. */
export interface WorkflowCorrelation {
  /** `traceId` W3C cua luot nghiep vu da sinh ra viec nay. */
  readonly traceId: string;
  /** Header `traceparent` day du, de worker truyen tiep xuong he ngoai. */
  readonly traceparent: string;
  readonly tenant: string;
  readonly environment: string;
  /** Loai thuc the nghiep vu (`order`, `campaign`…) — KHONG phai noi dung cua no. */
  readonly entityType: string;
  /** Dinh danh NOI BO cua thuc the. Khong bao gio la SDT/email/ma khach. */
  readonly entityId: string;
  readonly workflowKey: string;
  readonly workflowVersion: string;
}

const TRACEPARENT = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;
const TRACE_ID = /^[0-9a-f]{32}$/;
/** Danh tinh co hinh dang CO DINH: khach, moi truong, khoa/phien ban khuon, loai thuc the. */
const SLUG_LIKE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/**
 * `additionalMetadata` cua run — thu operator dung de TIM LAI mot run tren dashboard.
 *
 * CHI chua neo tuong quan. Khong `phone`, khong `address`, khong ten khach, khong noi dung tin.
 * Ai vao duoc dashboard la doc duoc tui nay, va no KHONG nam trong pham vi cua co
 * "Can view payloads" (co do chi an `input`/`output` cua task) — nen no phai an toan VO DIEU KIEN.
 */
export function buildWorkflowMetadata(correlation: WorkflowCorrelation): Record<string, string> {
  if (!TRACEPARENT.test(correlation.traceparent)) {
    throw new WorkflowInputRejected('MALFORMED_TRACEPARENT', 'traceparent');
  }

  /**
   * HAI CACH KIEM cho HAI LOAI NEO — day la mot ban SUA, khong phai trang tri.
   *
   * Ban dau moi neo deu bi quet noi dung nhu van ban tu do. Test bat duoc hau qua ngay:
   * `traceId` la 32 ky tu hex, va mot chuoi hex bat dau bang '0' roi toan chu so KHOP mau so
   * dien thoai Viet Nam `(?:\+84|0)(?:[\s.-]?\d){8,10}`. Nghia la cong nay se tu choi mot phan
   * cac luot chay HOP LE, mot cach NGAU NHIEN theo trace id — kieu loi te nhat: khong tai lap
   * duoc, va no danh vao chinh lop bao ve.
   *
   *   HINH DANG CO DINH (traceId, tenant, environment, workflowKey/Version, entityType)
   *     -> kiem bang KHUON. Chat hon quet noi dung: mot chuoi khong dung khuon thi khong lot,
   *        va mot chuoi dung khuon thi khong the la SDT/email.
   *
   *   HINH DANG MO (entityId)
   *     -> QUET noi dung. Day moi la cho mot lap trinh vien co the vo tinh truyen SDT vao thay
   *        cho id noi bo, nen day la cho can quet.
   */
  if (!TRACE_ID.test(correlation.traceId)) {
    throw new WorkflowInputRejected('MALFORMED_TRACEPARENT', 'nexagnet.traceId');
  }

  const shaped: ReadonlyArray<readonly [string, string]> = [
    ['nexagnet.traceId', correlation.traceId],
    ['nexagnet.tenant', correlation.tenant],
    ['nexagnet.environment', correlation.environment],
    ['nexagnet.entityType', correlation.entityType],
    ['nexagnet.workflowKey', correlation.workflowKey],
    ['nexagnet.workflowVersion', correlation.workflowVersion],
  ];

  const metadata: Record<string, string> = { traceparent: correlation.traceparent };
  for (const [key, value] of shaped) {
    // Neo rong thi BO HAN, khong ghi khoa co gia tri rong: mot khoa rong tren dashboard trong
    // giong "da tra loi la khong co" trong khi su that la "chua ai dien".
    if (!value) continue;
    if (!SLUG_LIKE.test(value)) {
      throw new WorkflowInputRejected('CONTRACT_VIOLATION', key, `'${value}' sai khuon danh tinh`);
    }
    metadata[key] = value;
  }

  if (correlation.entityId) {
    const key = 'nexagnet.entityId';
    if (scrubSecrets(correlation.entityId) !== correlation.entityId) {
      throw new WorkflowInputRejected('SECRET_VALUE_IN_INPUT', key);
    }
    if (scrubPii(correlation.entityId) !== correlation.entityId) {
      throw new WorkflowInputRejected('PII_VALUE_IN_INPUT', key);
    }
    metadata[key] = correlation.entityId;
  }
  return metadata;
}
