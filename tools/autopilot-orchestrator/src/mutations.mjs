/**
 * JOB NAY CO DUOC GHI KHONG — mot bien, hai gia tri, mac dinh la KHONG.
 *
 * VI SAO CAN, KHI RANH GIOI THAT DA LA `permissions:`
 *
 * Ranh gioi cuong che cua blocker B4 nam o YAML: job chay ma nguon cua PR khong duoc cap
 * `issues: write`/`pull-requests: write`, nen no KHONG THE ghi du ma nguon co bao no ghi. Bien nay
 * khong thay the ranh gioi do va khong duoc doc nhu mot ranh gioi bao mat — mot ke kiem soat ma
 * nguon PR xoa duoc no trong mot dong.
 *
 * No ton tai vi mot ly do VAN HANH, va ly do do la that: `AUTOPILOT_DRY_RUN` la bien CAP REPO. Ngay
 * ai do dat no thanh `false` de bat dang comment that, job read-only tren MOI PR se bat dau thu
 * `POST` — va an 403 tren moi PR, tuc CI do vi mot thu dung theo thiet ke. Bien nay lam job
 * read-only DUNG LAI truoc loi goi ghi thay vi dam vao buc tuong quyen.
 *
 * MAC DINH LA `forbidden`, khong phai `allowed`: mot job quen khai bien nay thi khong ghi. Chieu
 * fail-closed cua mot cong bao gio cung la chieu KHONG lam.
 */

/** Ten bien moi truong. Workflow va ma nguon doc chung mot hang so nay nen chung khong lech duoc. */
export const MUTATION_ENV = 'AUTOPILOT_MUTATIONS';

/** Hai gia tri hop le. Moi chuoi khac — ke ca rong hay khong dat — deu la `FORBIDDEN`. */
export const MUTATION_ROLES = Object.freeze({
  /** Job chay ma nguon nhanh mac dinh: duoc dang comment va doi nhan. */
  ALLOWED: 'allowed',
  /** Job chay ma nguon cua PR: quyet dinh va ghi log, khong cham vao mat phang trang thai. */
  FORBIDDEN: 'forbidden',
});

/**
 * @param {Record<string, string | undefined>} env
 * @returns {'allowed' | 'forbidden'}
 */
export function mutationRoleFromEnv(env) {
  return env?.[MUTATION_ENV] === MUTATION_ROLES.ALLOWED
    ? MUTATION_ROLES.ALLOWED
    : MUTATION_ROLES.FORBIDDEN;
}
