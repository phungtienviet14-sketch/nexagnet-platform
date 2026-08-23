/**
 * CONG WORKFLOW ENGINE — hop dong trung tinh giua nghiep vu Nexagnet va mot engine ben ngoai.
 *
 * Cung khuon `erp/erp.port.ts`: nen tang chi biet CONG nay; moi khach cam mot hien thuc
 * (`none` -> `DisabledWorkflowEngineAdapter`, `hatchet` -> adapter Hatchet). Doi hien thuc =
 * doi mot gia tri trong `tenants/<slug>/tenant.json`, khong dung den code nghiep vu.
 *
 * ---------------------------------------------------------------------------
 * CO Y GIU NHO. Nam viec, moi viec deu co mot ca dung THAT:
 *
 *   trigger        dispatcher outbox goi khi mot su kien nghiep vu can chay workflow
 *   sendEvent      con nguoi duyet mot buoc dang cho -> tha su kien cho run di tiep
 *   cancel         nguoi van hanh dung mot run dang chay
 *   describeRun    console Nexagnet hien "Workflow execution [Mo trong Hatchet]"
 *   countInFlight  cong DRAIN cua thu tuc deploy: phai bang 0 moi duoc rut worker cu
 *
 * KHONG co `execute(anyWorkflow, anyPayload)`. Mot cong tong quat nhu vay se la con duong ngan
 * nhat de mot cong cu LLM chay duoc workflow tuy y — ma tin nhan Zalo la du lieu KHONG TIN CAY
 * di thang vao prompt.
 *
 * KHONG clone toan bo API cua Hatchet. Tang nghiep vu khong duoc biet `HatchetClient`,
 * `tenantToken`, gRPC hay `workflowVersionId` la gi.
 */

/** Nha cung cap engine. Ten nha cung cap CHI duoc xuat hien o day va trong thu muc adapter. */
export const WORKFLOW_ENGINE_NAMES = ['none', 'hatchet'] as const;
export type WorkflowEngineName = (typeof WORKFLOW_ENGINE_NAMES)[number];

/**
 * Bo ky tu hop le cho ten workflow — LAY TU CHINH ENGINE, khong phai so thich.
 *
 * Hatchet tu choi dang ky voi thong bao:
 *   `validation failed on field 'CreateWorkflowVersionOpts.Name':
 *    Hatchet names must match the regex ^[a-zA-Z0-9\.\-_]+$`
 *
 * Kiem o day de loi no ra luc TEST chu khong phai luc DEPLOY. Do la ca ly do ham nay ton tai
 * thay vi mot phep noi chuoi noi tuyen.
 */
const ENGINE_NAME_CHARSET = /^[a-zA-Z0-9._-]+$/;
/** Phien ban NGHIEP VU cua khuon workflow: `v1`, `v2`… KHONG phai git sha, khong phai `latest`. */
const WORKFLOW_VERSION = /^v[1-9][0-9]*$/;
/**
 * Dau CHAM, khong phai hai cham. Xem `evidence/version-gate-a.md` §6:
 * `<key>:v1` — mau ma moi ban thiet ke hay viet — KHONG dang ky duoc voi Hatchet.
 */
export const WORKFLOW_VERSION_SEPARATOR = '.';

/**
 * Ten dang ky voi engine. DAY LA CO CHE GHIM PHIEN BAN (GATE A):
 *
 * Engine dinh tuyen viec theo `actionId = <tenWorkflow>:<tenBuoc>`, va mot worker chi nhan viec
 * cua nhung action CHINH NO da dang ky. Mot ban trien khai worker dang ky dung mot phien ban
 * ⇒ khong co duong nao de mot run cu di lac sang code moi.
 *
 * Da chung minh bang thi nghiem co doi chung: dung chung mot ten thi mot run don le co buoc
 * chay v1 va buoc chay v2 (`evidence/version-spike-shared.json`); tach ten thi thuan v1
 * (`evidence/version-spike-versioned.json`).
 */
export function engineWorkflowName(workflowKey: string, workflowVersion: string): string {
  if (!ENGINE_NAME_CHARSET.test(workflowKey)) {
    throw new TypeError(
      `WORKFLOW_KEY_INVALID: '${workflowKey}' — engine chi nhan chu, so, '.', '-', '_'. ` +
        `Dac biet dau ':' KHONG hop le (mau '<key>:v1' khong dung duoc).`,
    );
  }
  if (!WORKFLOW_VERSION.test(workflowVersion)) {
    throw new TypeError(
      `WORKFLOW_VERSION_INVALID: '${workflowVersion}' — phai dang 'v1', 'v2'… ` +
        `'latest' bi cam co chu dich: mot ten tro toi "ban moi nhat" pha chinh viec ghim phien ban.`,
    );
  }
  return `${workflowKey}${WORKFLOW_VERSION_SEPARATOR}${workflowVersion}`;
}

/** Lenh kich hoat. `input`/`metadata` PHAI da di qua `workflow-input.ts` truoc khi toi day. */
export interface TriggerWorkflowCommand {
  readonly workflowKey: string;
  readonly workflowVersion: string;
  /** Da qua `buildWorkflowInput` — danh sach trang, khong PII, khong bi mat. */
  readonly input: Readonly<Record<string, unknown>>;
  /** Da qua `buildWorkflowMetadata` — chi neo tuong quan. */
  readonly metadata: Readonly<Record<string, string>>;
  /**
   * Khoa thao tac cua Nexagnet (`operation-key.ts`). Engine dung no de chan trung LUC TAO RUN;
   * no KHONG thay duoc viec chan trung tac dung phu o he ngoai.
   */
  readonly operationKey?: string;
}

/** Tham chieu toi mot lan thuc thi — thu Nexagnet luu vao audit de tro nguoc sang engine. */
export interface WorkflowRunReference {
  readonly engineRunId: string;
  /** Ten day du da dang ky, gom phien ban: `integration-handoff.v1`. */
  readonly workflowName: string;
  /** Duong dan sang dashboard engine, neu cau hinh co URL cong khai. */
  readonly dashboardUrl?: string;
}

export interface WorkflowRunSummary extends WorkflowRunReference {
  /** Trang thai THO cua engine, khong dich sang tu vung nghiep vu cua ta. */
  readonly status: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly errorMessage?: string;
}

export abstract class WorkflowEnginePort {
  abstract trigger(command: TriggerWorkflowCommand): Promise<WorkflowRunReference>;

  /** Tha mot su kien de cac run dang cho di tiep (vi du: nguoi da duyet). */
  abstract sendEvent(eventKey: string, payload: Readonly<Record<string, unknown>>): Promise<void>;

  abstract cancel(engineRunId: string): Promise<void>;

  /** `null` = khong tim thay (da het han luu tru, hoac id sai) — KHONG nem. */
  abstract describeRun(engineRunId: string): Promise<WorkflowRunSummary | null>;

  /**
   * So run CHUA KET THUC cua mot phien ban khuon workflow.
   *
   * Day la cong DRAIN cua thu tuc deploy: rut worker cu khi con run cu khong lam mat du lieu,
   * nhung lam run do NAM CHO cho toi khi co worker cung phien ban quay lai. Con so nay bien
   * "cho cho chac" thanh mot dieu kien do duoc.
   */
  abstract countInFlight(workflowKey: string, workflowVersion: string): Promise<number>;
}
