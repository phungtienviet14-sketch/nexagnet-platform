import type { OutboxItem, OutboxSender, SendOutcome } from '@netviet/driver-outbox';
import type { HttpClient } from '../api/http';
import {
  executeFieldAction,
  type DeviceBinding,
  type FieldActionDeps,
  type ProgressStore,
} from './field-actions';
import type { LocalOutboxStore } from './local-outbox-store';
import { sendObservationBatch } from './observation-sender';
import { sendProofBatch } from './proof-sender';

/**
 * NGUOI GUI cua hang doi — MOT ban cho ca native lan PWA. Chi hai thu khac theo nen tang di vao qua
 * tham so: kho tien trinh (SQLite/IndexedDB) va cach dung `FormData` co tep.
 *
 * Tach khoi `outbox-runtime*.ts` de hai nen tang khong the lech nhau o dung cho nguy hiem nhat:
 * thu tu gui va cach dung hang khi het phien.
 */
export function createFieldSender(
  http: HttpClient,
  store: ProgressStore & Pick<LocalOutboxStore, 'listPending'>,
  device: DeviceBinding | null,
  formWithFile: FieldActionDeps['formWithFile'],
): OutboxSender {
  return {
    async sendBatch(items: readonly OutboxItem[]): Promise<readonly SendOutcome[]> {
      if (items[0]?.kind === 'OBSERVATION') return sendObservationBatch(items, http, device);
      // Viec bam: TUAN TU, FIFO theo vong chay/chang (`proof-sender.ts`) — ke ca voi viec truoc
      // dang lui hen nam NGOAI lo nay; het phien (401) thi ca lo dung.
      const inBatch = new Set(items.map((item) => item.id));
      const outside = (await store.listPending()).filter(
        (item) => item.kind === 'PROOF' && !inBatch.has(item.id),
      );
      return sendProofBatch(
        items,
        (item) => executeFieldAction(item, { http, progress: store, device, formWithFile }),
        outside,
      );
    },
  };
}
