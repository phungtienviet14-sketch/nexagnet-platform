import type { PwaUpdate } from './register-sw';

/**
 * DANG KY SERVICE WORKER cua PWA (`public/sw.js`) — chi o ban dung production (ban dev cua Metro
 * doi bo JS lien tuc; mot SW giu vo cu o dev chi gay nham), chi trong ngu canh an toan (HTTPS,
 * hoac localhost khi test).
 *
 * Ba viec:
 *   1. dang ky, va BAO khi mot ban moi da cai xong dang CHO (khong tu thay ma giua chung);
 *   2. khi nguoi dung dong y: nhan SW moi len ngoi, tai lai trang DUNG MOT lan — `controllerchange`
 *      cua lan cai DAU TIEN (clients.claim) khong duoc lam trang tu tai lai;
 *   3. bao SW nhung tep tinh trang DA nap truoc khi SW kip dieu khien (lan mo dau): font, icon —
 *      de lan mo ngoai tuyen sau co du chu va icon.
 *
 * Loi dang ky KHONG lam hong ung dung: chi mat kha nang mo khi mat song, ung dung van chay online.
 */
const SW_URL = '/sw.js';
const UPDATE_CHECK_MS = 60 * 60 * 1000;
const WARM_PREFIXES = ['/assets/', '/_expo/static/'];

function supported(): boolean {
  return (
    process.env.NODE_ENV === 'production' &&
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'serviceWorker' in navigator
  );
}

function loadedStaticUrls(): string[] {
  return performance
    .getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((name) => {
      const url = new URL(name, window.location.origin);
      return (
        url.origin === window.location.origin &&
        WARM_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
      );
    });
}

export function registerServiceWorker(onUpdate: (update: PwaUpdate) => void): () => void {
  if (!supported()) return () => undefined;
  const container = navigator.serviceWorker;
  let disposed = false;
  let applying = false;
  let registration: ServiceWorkerRegistration | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;

  const offer = (worker: ServiceWorker): void => {
    if (disposed) return;
    onUpdate({
      apply: () => {
        applying = true;
        worker.postMessage({ type: 'SKIP_WAITING' });
      },
    });
  };
  const onControllerChange = (): void => {
    if (applying) window.location.reload();
  };
  const checkForUpdate = (): void => {
    if (document.visibilityState === 'visible') void registration?.update().catch(() => undefined);
  };
  const watch = (reg: ServiceWorkerRegistration): void => {
    registration = reg;
    if (reg.waiting && container.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      installing?.addEventListener('statechange', () => {
        // Co controller = day la BAN MOI thay ban dang chay; khong co = lan cai dau, khong hoi gi.
        if (installing.state === 'installed' && container.controller) offer(installing);
      });
    });
    document.addEventListener('visibilitychange', checkForUpdate);
    timer = setInterval(checkForUpdate, UPDATE_CHECK_MS);
  };

  container.addEventListener('controllerchange', onControllerChange);
  void container
    .register(SW_URL, { scope: '/', updateViaCache: 'none' })
    .then((reg) => {
      watch(reg);
      return container.ready;
    })
    .then((ready) => ready.active?.postMessage({ type: 'CACHE_URLS', urls: loadedStaticUrls() }))
    .catch(() => undefined);

  return () => {
    disposed = true;
    container.removeEventListener('controllerchange', onControllerChange);
    document.removeEventListener('visibilitychange', checkForUpdate);
    if (timer) clearInterval(timer);
  };
}
