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
 * ---------------------------------------------------------------------------
 * CAI LINK 404 DO DA XAY RA THAT (26/08/2026, `ultty-gd1-test`). Nguoi van hanh bam "Mo trong
 * engine" cho run `4ea9cafd-…`; run TON TAI (COMPLETED, 1m 26s), dashboard vao duoc, `engineRunId`
 * dung — nhung trang tra ve `404 Page not found`, `requested path: /runs/4ea9cafd-…`.
 *
 * Cong thuc cu (`<goc>/runs/<id>`) doan mot route KHONG TON TAI. Duong that doc tu ma nguon
 * Hatchet tai dung the `v0.101.27` (`frontend/app/src/router.tsx`):
 *
 *     rootRoute
 *       └ authenticatedRoute   path: '/'
 *           └ tenantRoute      path: 'tenants/$tenant'
 *               └ tenantRunRoute  path: 'runs/$run'
 *
 *   =>  /tenants/<tenantId>/runs/<runId>
 *
 * (Cung cay do con `task-runs/$run` va `workflow-runs/$run`, nhung ca hai chi REDIRECT — mot cai
 * ve chinh route tren, mot cai ve DANH SACH. Chung khong phai duong canonical.)
 *
 * ---------------------------------------------------------------------------
 * KHONG DINH Hatchet ve mat kieu: day van la mot ham chuoi. Doi engine thi doi noi dung route o
 * `RUN_PATH`, khong phai doi kien truc.
 */

/** Ten bien moi truong khai goc URL dashboard. Xuat ra de khong ai go lai chuoi nay o cho khac. */
export const WORKFLOW_ENGINE_DASHBOARD_URL_ENV = 'WORKFLOW_ENGINE_DASHBOARD_URL';

/**
 * Ten bien moi truong giu TOKEN API cua engine.
 *
 * Xuat hien o day vi mot ly do khong hien nhien — xem `engineTenantIdFromToken()`: doan duong
 * `tenants/<id>` doi mot dinh danh ma chi token moi biet.
 */
export const WORKFLOW_ENGINE_TOKEN_ENV = 'WORKFLOW_ENGINE_TOKEN';

/**
 * DU DE DUNG MOT DUONG BAM, va khong hon.
 *
 * Hai manh phai di cung nhau: goc khong co tenant thi ra 404 (chinh su co 26/08), va tenant khong
 * co goc thi khong tro di dau ca. Gop lam MOT gia tri de khong ai lo truyen mot nua.
 */
export interface EngineDashboardTarget {
  /** Goc da chuan hoa — con giu duong dan phu (Hatchet co `BASE_PATH`), bo dau `/` cuoi. */
  readonly baseUrl: string;
  /**
   * Tenant CUA HATCHET — mot UUID.
   *
   * KHONG PHAI khach cua Nexagnet. Trong repo nay "tenant" hau het nghia la `ultty`/`amico`;
   * o day no la khai niem cach ly RIENG cua engine, va hai thu do khong anh xa 1-1. Ten truong
   * mang tien to `engine` de cho nham ay lo ra ngay tai noi goi.
   */
  readonly engineTenantId: string;
}

/** Duong dan cua MOT lan chay, tuong doi so voi goc. Doi engine thi doi DUNG mot dong nay. */
const RUN_PATH = (engineTenantId: string, runSegment: string): string =>
  `/tenants/${engineTenantId}/runs/${runSegment}`;

/** UUID moi phien ban. Hatchet doi dung khuon nay o `$tenant` — sai khuon la 400, khong phai 404. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Goc URL dashboard, hoac `undefined` khi ha tang khong khai / khai mot thu khong dung duoc.
 *
 * `undefined` la mot cau tra loi HOP LE, khong phai loi cau hinh: mot ban trien khai co the co
 * engine ma khong mo dashboard ra ngoai. Luc do console don gian la khong hien nut "Mo trong
 * engine" — chu khong hien mot nut dan toi hu vo.
 *
 * BA DIEU BI TU CHOI o day, va deu la tu choi CO CHU DICH:
 *
 *   · khong phai URL hop le      -> khong the noi chuoi ra mot duong dung duoc;
 *   · khong phai `http`/`https`  -> mot goc `javascript:` se thanh XSS ngay khi render thanh href;
 *   · CO `user:pass@`            -> mat khau se di vao thanh dia chi trinh duyet, log proxy va
 *                                   lich su. Khong co link con hon mot link mang mat khau.
 */
function normalizeBaseUrl(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
  if (parsed.username || parsed.password) return undefined;

  // Cat dau `/` cuoi tren CHUOI GOC chu khong dung lai tu `parsed`: goc co the mang duong dan phu
  // (`https://host/hatchet`) va dung lai se lam mat no.
  return trimmed.replace(/\/+$/, '');
}

/**
 * Tenant Hatchet, suy tu chinh TOKEN cua engine.
 *
 * ---------------------------------------------------------------------------
 * VI SAO LAY TU TOKEN chu khong them mot bien moi truong thu ba:
 *
 * Token API cua Hatchet duoc DUC RIENG cho mot tenant — `hatchet-admin token create --tenant-id
 * <id>` — va id do nam trong claim `sub` cua chinh no (SDK cung doc dung cho nay:
 * `sdks/typescript/src/util/config-loader/token.ts`). Nghia la:
 *
 *   · khong stack nao phai khai them gi, ke ca stack da chay;
 *   · khong the lech: token va tenant khong the tro hai noi khac nhau;
 *   · DA KHACH dung theo cau truc — moi stack co token rieng nen tu ra tenant rieng.
 *
 * KHONG XAC THUC CHU KY, va khong can: ta khong quyet dinh quyen o day, ta chi doc mot cai nhan
 * de dung mot duong dan. Token gia chi dan toi mot trang 404/403 cua engine.
 *
 * CHI `sub` DUOC DI RA, va chi khi no dung khuon UUID. Rang buoc khuon do la thu bien "khong ro
 * ri token" tu mot loi hua thanh mot dieu ep buoc duoc: khong manh nao cua mot JWT that di lot
 * qua mot bo loc chi nhan 36 ky tu hex-va-gach.
 *
 * FAIL-SOFT tuyet doi: token thieu / khong phai JWT / claim la rac -> `undefined`. Mot cai link
 * khong dang gia lam sap man hinh chan doan.
 */
function engineTenantIdFromToken(token: string | undefined): string | undefined {
  const raw = token?.trim();
  if (!raw) return undefined;

  const parts = raw.split('.');
  if (parts.length !== 3) return undefined;

  try {
    const decoded = Buffer.from(parts[1] ?? '', 'base64url').toString('utf8');
    const claims = JSON.parse(decoded) as { sub?: unknown };
    const sub = typeof claims.sub === 'string' ? claims.sub.trim() : '';
    return UUID.test(sub) ? sub : undefined;
  } catch {
    // `JSON.parse` tren rac, hoac mot manh khong phai base64url. Ca hai deu la "khong suy duoc".
    return undefined;
  }
}

/**
 * Dich bam, dung tu HAI manh cau hinh. `undefined` khi thieu bat ky manh nao.
 *
 * Tach khoi `resolveDashboardTarget()` de noi goi DA CO cau hinh (adapter engine) khong phai di
 * vong qua bien moi truong — va de bai kiem khong phai nhem `process.env`.
 */
export function engineDashboardTarget(
  baseUrl: string | undefined,
  token: string | undefined,
): EngineDashboardTarget | undefined {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) return undefined;

  const engineTenantId = engineTenantIdFromToken(token);
  if (!engineTenantId) return undefined;

  return { baseUrl: normalized, engineTenantId };
}

/** Dich bam doc tu bien moi truong cua chinh tien trinh. Khong nem: thieu la mot cau tra loi. */
export function resolveDashboardTarget(
  env: NodeJS.ProcessEnv = process.env,
): EngineDashboardTarget | undefined {
  return engineDashboardTarget(
    env[WORKFLOW_ENGINE_DASHBOARD_URL_ENV],
    env[WORKFLOW_ENGINE_TOKEN_ENV],
  );
}

/**
 * URL cua MOT lan thuc thi. `undefined` khi khong co dich — khong doan mot goc mac dinh.
 *
 * `encodeURIComponent` KHONG phai trang tri: `engineRunId` di ra tu mot ban ghi, va mot gia tri
 * co `/` hay `?` trong do se de ra them mot doan duong (`/tenants/<khac>/runs/…`) hoac mot phan
 * query. Ma hoa ep no nam TRON trong dung mot doan duong cua no.
 */
export function workflowRunDashboardUrl(
  target: EngineDashboardTarget | undefined,
  engineRunId: string,
): string | undefined {
  if (!target || !engineRunId) return undefined;
  return `${target.baseUrl}${RUN_PATH(target.engineTenantId, encodeURIComponent(engineRunId))}`;
}
