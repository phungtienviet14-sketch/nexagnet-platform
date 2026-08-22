import { engineWorkflowName } from './workflow-engine.port.js';
import { INTEGRATION_HANDOFF_KEY, workflowInputContract } from './workflow-registry.js';

/**
 * PHAN GIAI "tien trinh worker nay mang phien ban nao" — logic THUAN, khong dinh Nest, khong
 * dinh Hatchet.
 *
 * ---------------------------------------------------------------------------
 * VI SAO PHIEN BAN DEN TU BIEN MOI TRUONG chu khong tu goi khach:
 *
 * `tenants/<slug>/tenant.json` noi khach dang DUNG phien ban nao — do la lua chon van hanh, va
 * no ghim vao hang outbox luc XEP HANG. Con bien nay noi container nay MANG code phien ban nao.
 * Hai chuyen khac nhau, va chinh khoang cach giua chung lam cho thu tuc
 * REGISTER -> ACTIVATE -> DRAIN -> DEACTIVATE -> REMOVE chay duoc:
 *
 *   REGISTER  worker v2 len (bien = v2) trong khi khach van ACTIVATE v1 -> hai worker song song
 *   ACTIVATE  goi khach doi sang v2 -> chi run MOI di v2
 *   DRAIN     dem run `.v1` chua xong; worker v1 van song vi no la container RIENG
 *
 * Neu phien ban doc tu goi khach thi ca ba buoc tren sup thanh mot: khong the co hai worker khac
 * phien ban cung luc, va DRAIN khong con cho de dung.
 *
 * ---------------------------------------------------------------------------
 * MOT CONTAINER = MOT PHIEN BAN. Day la he qua bat buoc cua `evidence/version-gate-a.md` §8.1,
 * khong phai lua chon kien truc. Engine dinh tuyen viec theo `actionId = <tenWorkflow>:<tenBuoc>`
 * va mot worker chi nhan viec cua action CHINH NO dang ky. Mot tien trinh dang ky ca `.v1` lan
 * `.v2` se lam tan bien duong bien do — nen ham nay nhan DUNG MOT chuoi phien ban va moi thu
 * giong mot danh sach deu bi nem.
 */

/** TEN bien moi truong. Xuat ra de test va compose khong go lai chuoi nay o hai noi. */
export const WORKFLOW_WORKER_VERSION_ENV = 'WORKFLOW_WORKER_VERSION';

export interface WorkerRegistration {
  /** Khoa ON DINH cua khuon — khong doi khi len phien ban. */
  readonly workflowKey: string;
  readonly workflowVersion: string;
  /** Ten dang ky voi engine, gom phien ban: `integration-handoff.v1`. */
  readonly engineName: string;
  /** Ten tien trinh worker hien tren dashboard engine. */
  readonly workerName: string;
}

/**
 * Doc + kiem + dung ten dang ky. NEM voi moi dau vao khong dung — khong co duong lui mac dinh.
 *
 * Mot worker doan sai phien ban cua chinh no la che do hong TE NHAT trong ca he: no dang ky mot
 * ten, engine tin no, va run cua phien ban do chay bang code khac. Nen o day khong co gia tri
 * mac dinh nao ca, ke ca `v1`.
 */
export function resolveWorkerRegistration(
  env: NodeJS.ProcessEnv = process.env,
): WorkerRegistration {
  const raw = env[WORKFLOW_WORKER_VERSION_ENV]?.trim();
  if (!raw) {
    throw new Error(
      `${WORKFLOW_WORKER_VERSION_ENV}_MISSING: tien trinh worker phai biet minh mang phien ban ` +
        `nao. Dat ${WORKFLOW_WORKER_VERSION_ENV}=v1 (mot phien ban, mot container) trong khoi ` +
        `'environment:' cua service worker.`,
    );
  }

  const workflowKey = INTEGRATION_HANDOFF_KEY;

  // Thu tu hai buoc kiem la CO Y va khong doi cho duoc:
  //   1. HINH DANG — `engineWorkflowName` tu choi 'latest', 'v1,v2', 'v1 v2', dau ':'… Day cung
  //      la cho ep dau CHAM lam dau phan cach, thu chi lo ra luc worker khoi dong tren engine
  //      that neu khong kiem o day.
  //   2. TON TAI — ban dang chay co THUC SU mang phien ban do khong. Mot ten dung khuon nhung
  //      khong co code di kem se dang ky duoc voi engine, roi moi run rot vao no deu treo.
  const engineName = engineWorkflowName(workflowKey, raw);
  workflowInputContract(workflowKey, raw);

  return {
    workflowKey,
    workflowVersion: raw,
    engineName,
    // Dau GACH NOI, khong phai dau cham: ten worker va ten workflow doc canh nhau tren dashboard,
    // va hai dinh dang khac nhau lam "cai nao la workflow, cai nao la tien trinh" doc ra ngay.
    workerName: `workflow-worker-${workflowKey}-${raw}`,
  };
}
