import type { ErpAdapterName } from '@netviet/tenant';
import type { KnowledgeService } from '../knowledge/knowledge.service.js';
import type { ErpPort } from './erp.port.js';
import { KiotVietMockAdapter } from './kiotviet.mock.adapter.js';
import { NoopErpAdapter } from './noop-erp.adapter.js';

/**
 * Bang tra cuu hien thuc `ErpPort` theo goi khach (G1-12).
 *
 * Tach khoi Nest provider co chu dich — dung khuon `media-policy.ts` (thuan) / `media.provider.ts`
 * (day day): ham nay khong doc bien moi truong, khong doc file, khong dung DI, nen kiem duoc tung
 * nhanh ma khong phai dung goi khach gia.
 *
 * Them khach dung ERP khac (vd Nhanh.vn — Dot B4) = them mot hien thuc + mot nhanh o day + mot
 * gia tri trong `erpAdapterSchema`. KHONG sua `app.module.ts` va khong them nhanh theo ten khach.
 */
export interface ErpAdapterDeps {
  readonly knowledge: KnowledgeService;
}

export function createErpAdapter(
  adapter: ErpAdapterName | undefined,
  deps: ErpAdapterDeps,
): ErpPort {
  switch (adapter) {
    case 'kiotviet_mock':
      return new KiotVietMockAdapter(deps.knowledge);
    // `none` va goi khach khong khai bao deu ve day: khong doan nha cung cap cho khach.
    default:
      return new NoopErpAdapter();
  }
}
