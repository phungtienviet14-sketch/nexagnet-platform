import { loadTenantConfig } from '@netviet/tenant';

/**
 * CONG BAO VE cua duong gieo/xoa du lieu mau (T8/#90 — "khong bao gio mo lenh reset len mot khach
 * that ma khong co mot cong an toan tuong minh").
 *
 * ---------------------------------------------------------------------------
 * VI SAO CONG NAY DOC `readiness.demoTenant` CHU KHONG DOC SLUG.
 *
 * Mot danh sach slug (`slug === 'transport-preview'`) se sai theo hai chieu cung luc: them mot goi
 * mau thu hai la phai sua code, va — nguy hiem hon — no dat quyet dinh "co duoc xoa sach khong" o
 * MOT NOI KHAC voi noi mo ta goi khach. Nguoi them mot goi khach moi doc `tenant.json` cua ho, ho
 * khong doc tep nay.
 *
 * `demoTenant` la mot LOI TU KHAI nam trong chinh goi khach, va no da duoc chung minh la co suc
 * phan biet: `transport-tenant-allowlist.spec.ts` khoa ca hai chieu — moi goi mau phai khai `true`,
 * va KHONG goi khach that nao duoc khai. Nen cong nay khong phai mot khang dinh moi phai tin, no
 * dua vao mot bat bien da co bo test giu.
 *
 * ---------------------------------------------------------------------------
 * CO `demoTenant` KHONG BAO GIO RA MAN HINH.
 *
 * Do la ly do no thay cho `previewNotice` o #195: mot co ky thuat de quyet dinh duong ghi, khong
 * phai mot cau chu de hien cho khach doc.
 */

export class DemoTenantGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DemoTenantGuardError';
  }
}

/** `true` khi goi khach dang chay tu khai la goi mau. Khong nem — dung cho nhanh re duong. */
export function isTransportDemoTenant(): boolean {
  return loadTenantConfig().policies.readiness.demoTenant === true;
}

/**
 * Chan moi duong GHI du lieu mau tren mot goi khach that.
 *
 * Nem `DemoTenantGuardError` chu khong tra `false`: ben goi la mot script gieo, va mot script gieo
 * "khong lam gi ca" trong im lang tren mot goi khach that la ket cuc te nhat — nguoi van hanh se
 * cho mot bo du lieu khong bao gio den, va di tim loi o cho khac.
 */
export function assertTransportDemoTenant(action: string): void {
  const config = loadTenantConfig();
  if (config.policies.readiness.demoTenant !== true) {
    throw new DemoTenantGuardError(
      `Tu choi ${action}: goi khach "${config.slug}" khong tu khai ` +
        '`policies.readiness.demoTenant` — day la mot goi khach that, khong phai goi mau.',
    );
  }
}

/** Bien moi truong bat duong XOA. Mot chuoi tuong minh, khong phai mot co `true/1` mo ho. */
export const DEMO_RESET_ENV = 'TRANSPORT_DEMO_RESET';
export const DEMO_RESET_TOKEN = 'xoa-va-gieo-lai';

/**
 * CONG THU HAI, va no chi gac duong XOA.
 *
 * Gieo them vao mot DB rong la mot viec khong mat gi neu lam nham. XOA SACH thi khac: no khong
 * hoan tac duoc, va khoang cach giua "chay lai lenh gieo" va "xoa mat mot buoi trinh dien da
 * chuan bi" chi la mot lan bam mui ten len trong terminal.
 *
 * Nen no doi HAI dieu doc lap: goi khach phai la goi mau (cong tren), VA nguoi chay phai go dung
 * mot chuoi noi ra y dinh. Mot bien `=1` khong dat duoc dieu do — no de dat nham va khong doc len
 * thanh mot cau nao.
 */
export function assertDemoResetAllowed(env: NodeJS.ProcessEnv = process.env): void {
  assertTransportDemoTenant('xoa du lieu van tai');
  if (env[DEMO_RESET_ENV] !== DEMO_RESET_TOKEN) {
    throw new DemoTenantGuardError(
      `Tu choi xoa du lieu van tai: dat ${DEMO_RESET_ENV}=${DEMO_RESET_TOKEN} de xac nhan. ` +
        'Lenh nay xoa toan bo du lieu van tai cua stack dang tro toi.',
    );
  }
}
