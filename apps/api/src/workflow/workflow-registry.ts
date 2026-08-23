import { z } from 'zod';
import { defineWorkflowInput, type WorkflowInputContract } from './workflow-input.js';

/**
 * DANH BA KHUON WORKFLOW — dinh nghia bang CODE, khong bang cu bam tren dashboard.
 *
 * Dashboard de QUAN SAT va VAN HANH. Git de DINH NGHIA. Mot workflow nghiep vu duoc ve bang
 * chuot khong review duoc, khong diff duoc, khong rollback duoc va khong ai biet no doi luc nao.
 *
 * Moi khuon co: khoa ON DINH + cac phien ban DA BIET + hop dong dau vao cua tung phien ban.
 * Goi khach chon phien ban nao dang chay (`tenants/<slug>/tenant.json`); code o day quyet dinh
 * phien ban do NHAN duoc gi.
 */

/**
 * `integration-handoff` — khuon NEN TANG TRUNG TINH.
 *
 * Viec no lam: ban giao mot THAM CHIEU thuc the toi mot dich den do khach cau hinh, mot cach
 * ben vung, voi khoa idempotency do Nexagnet so huu.
 *
 * Trung tinh that su: khong ten khach, khong SKU, khong gia, khong tu vung nganh. "Day mot don
 * len ERP", "dong bo mot ho so sang CRM" va "goi mot webhook sau khi duyet" deu la khuon nay
 * voi `destination` khac nhau.
 */
export const INTEGRATION_HANDOFF_KEY = 'integration-handoff';

/**
 * HOP DONG DAU VAO v1 — THAM CHIEU, khong phai anh chup.
 *
 * Chi sau truong, va khong truong nao mang du lieu ca nhan. Worker doc `entityType`+`entityId`
 * roi goi nguoc lai dich vu nghiep vu de lay du lieu MOI NHAT. Hai loi ich, ca hai deu thuc:
 *
 *   1. PII khong bao gio nam trong `input` cua run — ma `input` thi luu nguyen van trong DB cua
 *      engine va hien tren dashboard.
 *   2. Neu don bi sua sau luc xep hang, workflow lam viec tren ban MOI chu khong phai ban cu.
 */
export const integrationHandoffV1Input: WorkflowInputContract<{
  tenant: string;
  entityType: string;
  entityId: string;
  operation: string;
  operationVersion: number;
  destination: string;
}> = defineWorkflowInput(
  z
    .object({
      tenant: z.string().min(1).max(64),
      /** Loai thuc the — KHONG phai noi dung cua no. */
      entityType: z.string().regex(/^[a-z][a-z0-9-]*$/),
      /** Dinh danh NOI BO. Khong bao gio la SDT/email/ma khach. */
      entityId: z.string().min(1).max(128),
      operation: z.string().regex(/^[a-z][a-z0-9-]*$/),
      operationVersion: z.number().int().positive(),
      /** Dich den LOGIC — worker tra ten nay ra endpoint that tu cau hinh runtime. */
      destination: z.string().regex(/^[a-z][a-z0-9-]*$/),
    })
    .strict(),
);

export interface WorkflowTemplate {
  readonly key: string;
  /** Cac phien ban CODE dang co trong repo nay. Goi khach chi duoc tro toi mot trong so nay. */
  readonly versions: Readonly<Record<string, WorkflowInputContract<never>>>;
}

/**
 * HOP DONG DAU VAO v2 — GIONG HET v1, va do la mot khang dinh chu khong phai su luoi.
 *
 * v2 khac v1 o CAC BUOC (no them `preflight` truoc `dispatch` de hien thuc muc idempotency
 * `lookup`), khong khac o du lieu nhan vao. Theo bang "khi nao phai len phien ban moi" cua
 * runbook §2, doi hop dong dau vao la mot ly do RIENG de len phien ban; o day khong doi.
 *
 * Giu hai hang tro toi cung mot hop dong (thay vi mot hang dung chung) de khi v3 doi hop dong
 * that thi cho phai sua la MOT dong o day, khong phai go ra mot cau truc dung chung.
 */
export const integrationHandoffV2Input = integrationHandoffV1Input;

const TEMPLATES = {
  [INTEGRATION_HANDOFF_KEY]: {
    key: INTEGRATION_HANDOFF_KEY,
    versions: {
      v1: integrationHandoffV1Input as unknown as WorkflowInputContract<never>,
      v2: integrationHandoffV2Input as unknown as WorkflowInputContract<never>,
    },
  },
} as const satisfies Record<string, WorkflowTemplate>;

/**
 * Tra khuon theo khoa. NEM khi khong biet — day la loi CODE (goi khach tro toi mot khuon khong
 * ton tai trong ban dang chay), khac han "khach chua bat workflow" von la mot cau hinh hop le.
 * Hai chuyen khac nhau thi phai hong khac nhau.
 */
export function workflowTemplate(key: string): WorkflowTemplate {
  const template = (TEMPLATES as Record<string, WorkflowTemplate | undefined>)[key];
  if (!template) {
    throw new Error(
      `WORKFLOW_TEMPLATE_UNKNOWN: '${key}' khong co trong ban dang chay. ` +
        `Cac khuon da biet: ${Object.keys(TEMPLATES).join(', ')}.`,
    );
  }
  return template;
}

/**
 * Hop dong dau vao cua mot phien ban. NEM khi goi khach tro toi phien ban ma ban nay khong mang
 * — do la trieu chung cua "deploy nguoc phien ban", va no phai lo ra ngay chu khong am tham
 * chay bang mot phien ban khac.
 */
export function workflowInputContract(key: string, version: string): WorkflowInputContract<never> {
  const template = workflowTemplate(key);
  const contract = template.versions[version];
  if (!contract) {
    throw new Error(
      `WORKFLOW_VERSION_UNKNOWN: khuon '${key}' khong co phien ban '${version}' trong ban dang ` +
        `chay. Cac phien ban da biet: ${Object.keys(template.versions).join(', ')}.`,
    );
  }
  return contract;
}
