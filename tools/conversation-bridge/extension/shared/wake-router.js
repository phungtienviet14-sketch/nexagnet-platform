/**
 * DINH TUYEN MOT KHUNG WAKE — logic THUAN, moi thao tac trinh duyet di qua `deps`.
 *
 * Tach ra khoi `background.js` vi mot ly do duy nhat: bay bai kiem quan trong nhat cua nhiem vu
 * nay (#204 §12 muc 9-15) noi ve DUONG DI, khong ve Chrome. Neu logic nam trong service worker
 * thi muon kiem no phai dung mot trinh duyet that — va luc do CI se phai cham vao chatgpt.com,
 * dieu ma §7 cam thang.
 *
 * THU TU CAC BUOC O DAY LA HOP DONG, khong phai khau vi:
 *
 *   1. khung hop le      — mot khung hong khong duoc di xa hon
 *   2. da arm chua       — chua arm thi dung, truoc moi truy van tab
 *   3. khoa da giao chua — poll trung lap phai la KHONG-LAM-GI, khong phai "lam roi kiem sau"
 *   4. dung mot tab      — khong tab / nhieu tab deu la tu choi, khong doan
 *   5. URL tab dung y    — doi chieu voi URL da arm, khong phai voi mot mau
 *   6. GHI KHOA          <- TRUOC khi cham vao DOM
 *   7. tiem              — va trong trang lai doi chieu `location.href` mot lan nua
 *
 * BUOC 4-5 LA RANH GIOI THAT, KHONG PHAI QUYEN CUA CHROME. Quyen host cap cho tien ich la quyen
 * tren TOAN BO origin `https://chatgpt.com` — duong dan trong mau quyen host bi Chrome bo qua (xem
 * the than dau `arming.js`). Nghia la `queryTabs` co the tra ve moi tab chatgpt.com dang mo, ke ca
 * cac cuoc hoi thoai khac. Bo loc `isExactConfiguredConversation` o buoc 5 moi la thu quyet dinh
 * tab nao du dieu kien, va buoc 7 con doi chieu lai lan nua tu ben trong chinh trang do.
 *
 * Buoc 6 dat truoc buoc 7 co chu dich va co cai gia phai tra. Neu ghi sau, mot service worker bi
 * dung giua chung (Chrome thu hoi service worker bat ky luc nao) se de lai mot khoa CHUA ghi cho
 * mot tin nhan DA gui — va lan poll sau se gui lai. Dat truoc thi dieu nguoc lai xay ra: mot lan
 * tiem that bai co the "chay" khoa vinh vien. Ta chon huong do vi hai kieu hong khong ngang gia —
 * mot ben la lam phien mot cuoc hoi thoai that, ben kia la mot lan danh thuc bi bo lo va con nguoi
 * co the tu chay lai. Xem `docs/.../conversation-bridge-v0.md` muc "Rui ro con lai".
 */
import {
  isExactConfiguredConversation,
  injectWakeMessage,
  COMPOSER_SELECTORS,
  SUBMIT_SELECTORS,
} from './composer-adapter.js';
import { BRIDGE_REASONS, BRIDGE_STATES, rejected } from './states.js';
import { buildWakeMessage } from './wake-message.js';
import { decodeFrame, IPC_KINDS } from './ipc.js';
import { readArmState } from './arming.js';

/**
 * @typedef {object} RouterDeps
 * @property {() => Promise<unknown>} readArm
 * @property {() => Promise<Record<string, unknown>>} readDelivered
 * @property {(next: Record<string, unknown>) => Promise<void>} writeDelivered
 * @property {(url: string) => Promise<ReadonlyArray<{ id?: number, url?: string }>>} queryTabs
 * @property {(call: { tabId: number, func: Function, args: ReadonlyArray<unknown> }) => Promise<{ ok: boolean, reason: string }>} executeInTab
 * @property {() => string} now
 */

/**
 * @param {unknown} frame Khung da giai ma JSON tu duong ong Native Messaging. KHONG TIN CAY.
 * @param {RouterDeps} deps
 * @returns {Promise<{ ok: boolean, state: string, reason: string, detail?: Record<string, unknown> }>}
 */
export async function routeWakeFrame(frame, deps) {
  const decoded = decodeFrame(frame);
  if (!decoded.ok || decoded.frame.kind !== IPC_KINDS.WAKE) {
    return rejected(BRIDGE_REASONS.PROTOCOL_REJECTED, {
      ipcError: decoded.ok ? 'FRAME_KIND_UNEXPECTED' : decoded.error,
    });
  }
  const wake = /** @type {{ key: string, repo: string, pr: number, headSha: string }} */ (
    /** @type {unknown} */ (decoded.frame)
  );

  const arm = readArmState(await deps.readArm());
  if (arm.state !== BRIDGE_STATES.ARMED_EXACT_CHAT) {
    return rejected(BRIDGE_REASONS.NOT_ARMED);
  }
  const conversationUrl = arm.conversationUrl;

  const delivered = (await deps.readDelivered()) ?? {};
  if (Object.prototype.hasOwnProperty.call(delivered, wake.key)) {
    return rejected(BRIDGE_REASONS.ALREADY_DELIVERED);
  }

  const tabs = await deps.queryTabs(conversationUrl);
  const matching = (tabs ?? []).filter(
    (tab) =>
      typeof tab?.id === 'number' &&
      typeof tab?.url === 'string' &&
      isExactConfiguredConversation(tab.url, conversationUrl),
  );
  if (matching.length === 0) return rejected(BRIDGE_REASONS.TARGET_TAB_NOT_FOUND);
  if (matching.length > 1) return rejected(BRIDGE_REASONS.TARGET_TAB_AMBIGUOUS);
  const target = matching[0];

  const message = buildWakeMessage({ repo: wake.repo, pr: wake.pr, headSha: wake.headSha });

  // Buoc 6 — xem the than dau tep. Khoa duoc ghi TRUOC khi cham vao DOM.
  await deps.writeDelivered({
    ...delivered,
    [wake.key]: { state: 'ATTEMPTED', at: deps.now() },
  });

  const outcome = await deps.executeInTab({
    tabId: /** @type {number} */ (target.id),
    func: injectWakeMessage,
    args: [
      {
        expectedHref: /** @type {string} */ (target.url),
        // URL da ARM di THANG vao trang, khong di qua ban ghi tab. Trong trang, hai gia tri nay
        // duoc doi chieu doc lap — xem the than cua `injectWakeMessage`.
        armedHref: conversationUrl,
        message,
        composerSelectors: [...COMPOSER_SELECTORS],
        submitSelectors: [...SUBMIT_SELECTORS],
      },
    ],
  });

  if (!outcome?.ok) {
    return rejected(outcome?.reason ?? BRIDGE_REASONS.SUBMIT_FAILED);
  }
  await deps.writeDelivered({
    ...delivered,
    [wake.key]: { state: BRIDGE_STATES.DELIVERED, at: deps.now() },
  });
  return {
    ok: true,
    state: BRIDGE_STATES.DELIVERED,
    reason: BRIDGE_REASONS.WAKE_SENT,
  };
}
