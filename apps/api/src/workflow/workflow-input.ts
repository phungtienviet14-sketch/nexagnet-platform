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
    // `entityId` la DINH DANH, khong phai van ban tu do — kiem bang KHUON. Xem `assertEntityId`.
    if (isEntityIdKey(key) && typeof item === 'string') {
      assertEntityId(item, childPath);
      continue;
    }
    assertNoSensitiveContent(item, childPath, depth + 1);
  }
}

/** Khoa mang DINH DANH NOI BO cua thuc the — kiem bang khuon chu khong quet noi dung. */
function isEntityIdKey(key: string): boolean {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '') === 'entityid';
}

/**
 * `entityId` duoc kiem bang KHUON, khong bang phep quet noi dung — va day la mot ban SUA.
 *
 * ---------------------------------------------------------------------------
 * DA DO TREN STACK THAT (`ultty-gd1-test`, release d8cd6093, 25/08/2026), khong phai gia thiet.
 * Ngay lan `approve` dau tien sau khi bat `handoffFollowup`, API tra 500:
 *
 *     WORKFLOW_INPUT_REJECTED[PII_VALUE_IN_INPUT] tai 'entityId'
 *
 * Don do la `501e65d0-9605-4854-8f20-f213eb446ea9`. Trong chuoi ay co khuc `0-9605-4854`, va no
 * KHOP mau SDT Viet Nam `(?:\+84|0)(?:[\s.-]?\d){8,10}`. Do bang phep thu: **1,2% UUID v4** dinh
 * bay — tuc khoang 1 tren 83 lan chot don that bai NGAU NHIEN.
 *
 * Hau qua khong dung o mot ma loi: `outbound.sendMessage()` chay TRUOC giao dich, nen tren kenh
 * that KHACH DA NHAN tin xac nhan roi don moi cuon lai `pending_review`. Sale bam lai = gui LAN
 * HAI cho khach.
 *
 * ---------------------------------------------------------------------------
 * DAY LA CUNG MOT BUG voi cai da sua cho `traceId` ngay 22/08/2026 (xem chu thich o
 * `buildWorkflowMetadata`), chi khac cho no dap vao truong khac. Ban sua lan truoc chia neo lam
 * hai loai va CO Y de `entityId` o phia "hinh dang MO" vi "day moi la cho mot lap trinh vien co
 * the vo tinh truyen SDT vao thay cho id noi bo".
 *
 * Y DO DO DUNG, PHUONG TIEN THI SAI. Muc tieu la "khong duoc la SDT/email" — mot phep quet NOI
 * DUNG khong dat duoc muc tieu do ma con tu choi nham chinh nhung id hop le. Chinh chu thich cua
 * ban sua truoc da noi ro vi sao khuon manh hon: "mot chuoi khong dung khuon thi khong lot, va
 * mot chuoi dung khuon thi khong the la SDT/email".
 *
 * KHUON O DAY GIU NGUYEN LOI HUA CU:
 *   · phai dung `SLUG_LIKE`   -> loai email (`@`), SDT co `+84`, va moi chuoi co khoang trang;
 *   · phai co CHU CAI, HOAC dung khuon UUID -> loai mot day TOAN CHU SO nhu `0912345678`.
 * Mot so dien thoai khong the thoa ca hai, con `randomUUID()`/`cuid()` thi luon thoa.
 *
 * Nhanh UUID ton tai cho truong hop hiem ma UUID khong co chu cai nao (vd
 * `00000000-0000-4000-8000-000000000000`): thieu no thi ta chi lam bug hiem di ~1800 lan chu
 * khong xoa han no.
 *
 * VI SAO BO TEST CU KHONG BAT DUOC: fixture cua `workflow-input.spec.ts` dung `ord_test_1` — mot
 * id BIA, khong phai hinh dang id ma he that sinh ra. Bai hoi quy moi dung id THAT.
 */
function assertEntityId(value: string, path: string): void {
  if (!value) return;
  if (scrubSecrets(value) !== value) {
    throw new WorkflowInputRejected('SECRET_VALUE_IN_INPUT', path);
  }
  if (!SLUG_LIKE.test(value) || (!HAS_LETTER.test(value) && !UUID_LIKE.test(value))) {
    throw new WorkflowInputRejected('PII_VALUE_IN_INPUT', path);
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
/** UUID (moi phien ban). Nhanh du phong cho UUID khong co chu cai nao — xem `assertEntityId`. */
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Mot day TOAN CHU SO co the la SDT; mot id noi bo (`cuid()`, UUID) hau nhu luon co chu cai. */
const HAS_LETTER = /[A-Za-z]/;

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
   *   DINH DANH THUC THE (entityId)
   *     -> cung kiem bang KHUON, tu 25/08/2026 (`assertEntityId`).
   *
   *        Ban dau truong nay o phia "hinh dang MO" va bi QUET noi dung, voi ly do "day moi la
   *        cho mot lap trinh vien co the vo tinh truyen SDT vao thay cho id noi bo". Y do dung,
   *        nhung phuong tien sai — va no dinh DUNG cai bay ma doan tren vua mo ta: mot UUID
   *        chua khuc `0-9605-4854` khop mau SDT, nen 1,2% don bi tu choi NGAU NHIEN. Da do that
   *        tren `ultty-gd1-test`. Khuon moi van loai SDT/email, nen loi hua khong bi noi long.
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
    // KIEM BANG KHUON, khong quet noi dung — ly do day du o `assertEntityId`. Truoc 25/08/2026
    // cho nay quet `scrubPii` va tu choi nham 1,2% UUID that.
    assertEntityId(correlation.entityId, key);
    metadata[key] = correlation.entityId;
  }
  return metadata;
}
