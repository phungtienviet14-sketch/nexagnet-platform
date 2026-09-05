/**
 * Deps gia cho `routeWakeFrame`. Khong Chrome, khong mang, khong dia — chi mot ban ghi trong bo nho.
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
  return {
    dom,
    writes,
    injections,
    deliveredNow: () => store,
    deps: {
      readArm: async () =>
        arm === undefined ? { state: 'ARMED_EXACT_CHAT', conversationUrl: ARMED_URL } : arm,
      readDelivered: async () => store,
      writeDelivered: async (next) => {
        writes.push(Object.keys(next));
        store = next;
      },
      queryTabs: async () => tabs ?? [{ id: 42, url: ARMED_URL }],
      executeInTab: async ({ tabId, func, args }) => {
        injections.push({ tabId, message: args[0]?.message });
        return withDom(dom, () => func(args[0]));
      },
      now: () => '2026-09-05T03:00:00.000Z',
    },
  };
}
