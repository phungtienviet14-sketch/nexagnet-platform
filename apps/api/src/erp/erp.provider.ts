import { Logger, type Provider } from '@nestjs/common';
import { tenantErp } from '@netviet/tenant';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { createErpAdapter } from './erp-adapter.js';
import { ErpPort } from './erp.port.js';

/**
 * Noi day cong ERP theo GOI KHACH — cung khuon `channels/channel.provider.ts` va
 * `media/media.provider.ts`.
 *
 * Truoc G1-12 nhan bind cung mot nha cung cap (`useClass: KiotVietMockAdapter`), tuc la nen tang
 * dung chung "biet" ERP cua mot khach cu the — dieu `nen-tang-da-khach.md` cam. Nay lua chon nam
 * trong `tenants/<slug>/tenant.json`; nhan chi con biet `ErpPort`.
 */
export const erpProvider: Provider = {
  provide: ErpPort,
  inject: [KnowledgeService],
  useFactory: (knowledge: KnowledgeService): ErpPort => {
    const { adapter } = tenantErp();
    new Logger('ErpProvider').log(`Cong ERP: ${adapter}`);
    return createErpAdapter(adapter, { knowledge });
  },
};
