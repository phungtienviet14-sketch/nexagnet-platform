/**
 * Deps gia cho `routeWakeFrame`. Khong Chrome, khong mang, khong dia — chi mot ban ghi trong bo nho.
 *
 * `queryTabs` o day CO Y KHONG loc theo mau URL duoc yeu cau. Do khong phai su luoi: quyen host
 * cua Chrome duoc cap theo ORIGIN (thanh phan duong dan trong mau quyen host bi bo qua), nen mot
 * lan truy van tab hoan toan co the tra ve MOI tab `chatgpt.com` dang mo. Fixture nay mo phong
 * dung dieu do, va nho vay MOI bai kiem trong kho deu chay tren gia dinh THAT chu khong tren mot
 * gia dinh de chiu hon. Thu quyet dinh tab nao du dieu kien la bo loc trong `wake-router.js`.
 */
import { chatgptPage } from './chatgpt-page.mjs';
import { withDom } from './dom.mjs';

export const ARMED_URL = 'https://chatgpt.com/c/6a1f0c9e-2b7d-4f11-9a30-5c8e2d1b4a77';

/**
 * @param {{
 *   arm?: unknown,
 *   delivered?: Record<string, unknown>,
 *   tabs?: Array<{ id?: number, url?: string }>,
 *   page?: ReturnType<typeof chatgptPage>,
 * }} [options]
 */
export function makeDeps({ arm, delivered = {}, tabs, page } = {}) {
  const dom = page ?? chatgptPage({ href: ARMED_URL });
  let store = { ...delivered };
  const writes = [];
  const injections = [];
  /** @type {string[]} */
  const tabQueries = [];
  return {
    dom,
    writes,
    injections,
    tabQueries,
    deliveredNow: () => store,
    deps: {
      readArm: async () =>
        arm === undefined ? { state: 'ARMED_EXACT_CHAT', conversationUrl: ARMED_URL } : arm,
      readDelivered: async () => store,
      writeDelivered: async (next) => {
        writes.push(Object.keys(next));
        store = next;
      },
      queryTabs: async (url) => {
        tabQueries.push(url);
        return tabs ?? [{ id: 42, url: ARMED_URL }];
      },
      executeInTab: async ({ tabId, func, args }) => {
        injections.push({ tabId, message: args[0]?.message, armedHref: args[0]?.armedHref });
        return withDom(dom, () => func(args[0]));
      },
      now: () => '2026-09-05T03:00:00.000Z',
    },
  };
}
