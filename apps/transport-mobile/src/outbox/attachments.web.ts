import type { OutboxAttachment } from '@netviet/driver-outbox';
import { sharedOutboxIdb } from './idb';
import { IdbAttachmentStore } from './idb-attachments';
import type * as NativeAttachments from './attachments';

/**
 * TEP DINH KEM tren PWA — cung ten ham voi `attachments.ts` (Metro chon tep nay khi dong goi web),
 * byte nam trong IndexedDB. Chi tiet va ly do: `idb-attachments.ts`.
 *
 * Khac native o MOT cho: `formWithFile` bat dong bo (doc byte tu IndexedDB) — `FieldActionDeps`
 * nhan ca hai dang. `sweepAttachments` tra Promise va KHONG BAO GIO nem: don tep la viec phu, hong
 * thi lan sau don tiep, khong duoc lam do mot lan "Gửi ngay".
 */
async function store(): Promise<IdbAttachmentStore> {
  return new IdbAttachmentStore(await sharedOutboxIdb());
}

export async function persistAttachment(
  sourceUri: string,
  contentType: string,
  captureMode: OutboxAttachment['captureMode'],
): Promise<OutboxAttachment> {
  return (await store()).persist(sourceUri, contentType, captureMode);
}

export async function sweepAttachments(referenced: ReadonlySet<string>): Promise<number> {
  try {
    return await (await store()).sweep(referenced);
  } catch {
    return 0;
  }
}

export async function formWithFile(
  attachment: OutboxAttachment,
  fields: Readonly<Record<string, string>>,
): Promise<FormData> {
  return (await store()).formWithFile(attachment, fields);
}

/** Cung bo ten xuat voi ban native — thieu mot ten thi `tsc` do, khong doi toi luc chay tren web. */
const _parity: Record<keyof typeof NativeAttachments, unknown> &
  Pick<typeof NativeAttachments, 'persistAttachment'> = {
  persistAttachment,
  sweepAttachments,
  formWithFile,
};
