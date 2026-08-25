/**
 * DUONG BAM SANG DASHBOARD ENGINE — mot cong thuc, mot cho.
 *
 * Truoc ban nay cong thuc nam trong `HatchetWorkflowEngineAdapter` va chi noi goi do dung duoc.
 * Man hinh chan doan cung can dung duong do, va no KHONG duoc phep goi engine chi de xin mot cai
 * URL: `describeRun()` la mot lan di mang, con day chi la mot phep noi chuoi.
 *
 * Tach ra thay vi go lai o cho thu hai: hai ban cua cung mot duong dan se troi khoi nhau dung
 * vao ngay co nguoi doi bo cuc dashboard, va cai troi do khong do o dau ca — no chi bieu hien
 * thanh mot cai link 404 luc nguoi ta dang can no nhat.
 *
 * KHONG dinh Hatchet ve mat kieu: day la mot ham chuoi. Doi engine thi doi noi dung `/runs/`,
 * khong phai doi kien truc.
 */

/** Ten bien moi truong khai goc URL dashboard. Xuat ra de khong ai go lai chuoi nay o cho khac. */
export const WORKFLOW_ENGINE_DASHBOARD_URL_ENV = 'WORKFLOW_ENGINE_DASHBOARD_URL';

/**
 * Goc URL dashboard, hoac `undefined` khi ha tang khong khai.
 *
 * `undefined` la mot cau tra loi HOP LE, khong phai loi cau hinh: mot ban trien khai co the co
 * engine ma khong mo dashboard ra ngoai. Luc do console don gian la khong hien nut "Mo trong
 * engine" — chu khong hien mot nut dan toi hu vo.
 */
export function resolveDashboardBaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = env[WORKFLOW_ENGINE_DASHBOARD_URL_ENV]?.trim();
  return raw ? raw : undefined;
}

/** URL cua MOT lan thuc thi. `undefined` khi khong co goc — khong doan mot goc mac dinh. */
export function workflowRunDashboardUrl(
  baseUrl: string | undefined,
  engineRunId: string,
): string | undefined {
  if (!baseUrl || !engineRunId) return undefined;
  return `${baseUrl.replace(/\/$/, '')}/runs/${engineRunId}`;
}
