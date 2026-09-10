/**
 * HOA GIAI MOT KHOA GIAO — phia tien ich. Logic THUAN, moi thao tac trinh duyet di qua `deps`.
 *
 * VAN DE MA TEP NAY GIAI: co HAI so khoa giao, khong phai mot.
 *
 *   so #1  native host, tren dia   — ghi TRUOC khi khung WAKE roi khoi tien trinh
 *   so #2  chrome.storage.local    — ghi TRUOC khi cham vao DOM
 *
 * Ca hai deu ghi-truoc-khi-hanh-dong, va do la co y (xem `ledger.mjs` va `wake-router.js`): huong
 * hong an toan la BO LO mot lan danh thuc, khong phai lam phien mot cuoc hoi thoai that hai lan.
 * Cai gia la mot lan tiem that bai co the "chay" mot khoa vinh vien.
 *
 * XOA MOT MINH SO #2 KHONG HOI PHUC DUOC GI. So #1 van giu khoa, nen vong poll ke tiep dung o
 * `ALREADY_DELIVERED` va khung WAKE khong bao gio duoc dung lai. Bat ky nut nao chi xoa so #2 deu
 * dang hua mot dieu khong co that.
 *
 * NEN DUONG HOI PHUC O DAY LA CO DICH, VA DI QUA CA HAI SO, THEO DUNG THU TU NAY:
 *
 *   1. nguoi chon DUNG MOT muc trong so #2 va xac nhan     (khong co "xoa tat ca")
 *   2. tien ich gui khung RESET co kieu qua Native Messaging
 *   3. host TU DUNG LAI khoa canonical tu {repo, pr, headSha} va doi chieu; chi go neu khop
 *   4. host tra khung RESET_RESULT co kieu
 *   5. CHI KHI host bao xong, tien ich moi go dung khoa do khoi so #2
 *
 * Buoc 5 dat sau buoc 4 co chu dich: neu tien ich go truoc, mot lan host tu choi se de lai dung
 * cai trang thai lech ma B4 noi toi, chi lech theo chieu nguoc lai.
 *
 * Dieu nay KHONG bien at-most-once thanh at-least-once. Mot khoa da chay chi duoc mo lai boi mot
 * CON NGUOI, cho DUNG MOT khoa duoc goi ten. Khong co lan thu lai tu dong nao o day.
 */
import { parseDeliveryKey, resetFrame } from './ipc.js';
import { RESET_REASONS, RESET_STATES, resetOutcome } from './states.js';

/**
 * Dung khung RESET tu mot khoa cua so #2.
 *
 * Ba nguyen thuy duoc doc NGUOC ra tu chinh chuoi khoa, khong lay tu dau khac: nho vay khung gui
 * di luon TU MAU THUAN duoc kiem o phia host — host dung lai khoa tu ba nguyen thuy do roi so voi
 * chuoi khoa. Mot khoa bia se lech ngay o do.
 *
 * @param {unknown} key
 * @returns {{ ok: true, frame: { v: number, kind: string, key: string, repo: string, pr: number, headSha: string } } | { ok: false, state: string, reason: string }}
 */
export function buildResetRequest(key) {
  /** @param {string} reason @returns {{ ok: false, state: string, reason: string }} */
  const refuse = (reason) => ({ ...resetOutcome(reason), ok: false });
  const parsed = parseDeliveryKey(key);
  if (!parsed.ok) return refuse(RESET_REASONS.RESET_KEY_MALFORMED);
  try {
    return {
      ok: true,
      frame: resetFrame({
        key: /** @type {string} */ (key),
        repo: parsed.repo,
        pr: parsed.pr,
        headSha: parsed.headSha,
      }),
    };
  } catch {
    return refuse(RESET_REASONS.RESET_KEY_MALFORMED);
  }
}

/**
 * Bo DUNG MOT khoa khoi so #2, bang cach dung lai mot ban ghi moi — khong `delete` tai cho.
 * @param {Record<string, unknown>} delivered
 * @param {string} key
 * @returns {Record<string, unknown>}
 */
export function withoutDeliveredKey(delivered, key) {
  /** @type {Record<string, unknown>} */
  const next = {};
  for (const [existing, value] of Object.entries(delivered ?? {})) {
    if (existing !== key) next[existing] = value;
  }
  return next;
}

/**
 * @typedef {object} ResetDeps
 * @property {() => Promise<Record<string, unknown>>} readDelivered
 * @property {(next: Record<string, unknown>) => Promise<void>} writeDelivered
 */

/**
 * Ap ket qua host tra ve len so #2.
 *
 * `RESET_REFUSED` KHONG dong vao so #2. Do la diem quan trong nhat cua ham nay: hai so chi duoc
 * phep lech theo MOT chieu (host con khoa, tien ich con khoa), khong duoc lech theo chieu con lai
 * — mot khoa con o host ma mat o tien ich se lam lan poll sau im lang khong ai hieu vi sao.
 *
 * @param {{ key: string, state: string, reason: string }} result
 * @param {ResetDeps} deps
 * @returns {Promise<{ ok: boolean, state: string, reason: string }>}
 */
export async function applyResetResult(result, deps) {
  if (result?.state !== RESET_STATES.RESET_DONE) {
    return {
      ok: false,
      state: RESET_STATES.RESET_REFUSED,
      reason: result?.reason ?? RESET_REASONS.RESET_KEY_UNKNOWN,
    };
  }
  const delivered = (await deps.readDelivered()) ?? {};
  await deps.writeDelivered(withoutDeliveredKey(delivered, result.key));
  return resetOutcome(RESET_REASONS.RESET_APPLIED);
}
