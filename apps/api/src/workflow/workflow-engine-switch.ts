import { NO_WORKFLOW_ENGINE, tenantWorkflowEngine } from '@netviet/tenant';
import type { WorkflowEngineIntegration } from '@netviet/tenant';

/**
 * CONG TAC VAN HANH cho workflow engine — quyet dinh Q1-A (23/08/2026).
 *
 * ---------------------------------------------------------------------------
 * VAN DE CO THAT MA NO GIAI:
 *
 * `deploy-remote.sh:108` rsync CUNG MOT `tenant-pack` cho ca hai stack cua mot khach:
 *
 *     tenants/ultty/tenant.json  ->  zalo-ultty            (production)
 *                                ->  zalo-ultty-gd1-test   (moi truong ky thuat)
 *
 * Nen khai `integrations.workflowEngine` de bat engine cho gd1-test dong thoi VU TRANG dispatcher
 * tren production o lan deploy ke tiep — noi khong co engine nao de goi. `WorkflowScheduler` se
 * chay moi 5 giay va that bai moi lan, lam day log cua khach vi mot tinh nang khong ai bat.
 *
 * ---------------------------------------------------------------------------
 * HAI CAU HOI KHAC NHAU, va tach chung ra la toan bo y nghia cua file nay:
 *
 *   goi khach       "khach NAY dung khuon nao, phien ban nao"  -> CHINH SACH, giong nhau moi noi
 *   bien moi truong "BAN TRIEN KHAI NAY co bat khong"          -> VAN HANH, khac nhau tung stack
 *
 * Cung khuon `AUTO_SEND` da co. CLAUDE.md quyet dinh #4 noi ro: kill switch van hanh KHONG phai
 * noi chua policy cua tenant, va nguoc lai.
 *
 * ---------------------------------------------------------------------------
 * VI SAO KHONG THEM MOT NHANH MA NAO: khi tat, ham nay tra ve `NO_WORKFLOW_ENGINE` — dung thu ma
 * `WorkflowScheduler`, `createWorkflowEngineAdapter` va `createWorkflowWorker` DA biet xu ly
 * (dispatcher khong khoi dong, cong la `DisabledWorkflowEngineAdapter`, tien trinh worker tu choi
 * khoi dong). Cong tac nay dung lai duong SAN CO thay vi mo mot duong moi chua ai kiem.
 */

/** TEN bien moi truong. Xuat ra de compose, render-secrets va test khong go lai chuoi nay. */
export const WORKFLOW_ENGINE_SWITCH_ENV = 'WORKFLOW_ENGINE';

/**
 * Ban trien khai nay co bat workflow engine khong.
 *
 * MAC DINH TAT, va do la ca diem: mot cong tac mac dinh `on` khong bao ve duoc gi — production se
 * tu bat o lan deploy dau tien ma khong ai quyet dinh. Chi dung `'on'` moi bat; moi gia tri khac
 * (ke ca `'true'`, `'1'`, `'ON'`) deu la TAT, vi mot cong tac an toan khong duoc phep doan y.
 */
export function workflowEngineEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[WORKFLOW_ENGINE_SWITCH_ENV]?.trim() === 'on';
}

/**
 * Rang buoc workflow DANG CO HIEU LUC = goi khach VA cong tac van hanh.
 *
 * Moi noi trong `apps/api` can biet "khach nay dung engine gi" phai goi ham NAY, khong goi thang
 * `tenantWorkflowEngine()`. Goi thang se bo qua cong tac — va vi mac dinh la tat, mot cho bi bo
 * sot se hong theo huong NGUY HIEM (bat trong khi le ra phai tat), khong phai huong an toan.
 */
export function activeWorkflowEngine(
  env: NodeJS.ProcessEnv = process.env,
): WorkflowEngineIntegration {
  return workflowEngineEnabled(env) ? tenantWorkflowEngine() : NO_WORKFLOW_ENGINE;
}
