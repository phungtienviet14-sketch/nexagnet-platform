/**
 * SERVICE WORKER — chi PWA co. Tren Android/iOS ham nay khong lam gi: ung dung native cap nhat qua
 * cua hang, vo ung dung nam san trong goi cai. Ban that o `register-sw.web.ts`.
 */
export interface PwaUpdate {
  /** Cho SW moi len ngoi roi tai lai trang — CHI goi khi nguoi dung dong y. */
  readonly apply: () => void;
}

export function registerServiceWorker(_onUpdate: (update: PwaUpdate) => void): () => void {
  return () => undefined;
}
