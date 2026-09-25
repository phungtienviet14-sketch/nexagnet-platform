import type { OutboxAttachment } from '@netviet/driver-outbox';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

/**
 * TEP DINH KEM CUA HANG DOI — chep vao thu muc TAI LIEU cua ung dung truoc khi xep hang.
 *
 * Anh tu camera/thu vien nam o thu muc CACHE: he dieu hanh co quyen xoa no bat cu luc nao khi may
 * day bo nho. Mot chung tu xep hang luc mat song ma tro vao cache co the mat anh truoc khi co song
 * lai — va hang doi se gui mot tham chieu toi mot tep khong con. Chep sang `Paths.document` (khong
 * bi don tu dong); xoa khi muc da len may chu (`sweepAttachments`).
 */
const FOLDER = 'outbox-files';

function folder(): Directory {
  const directory = new Directory(Paths.document, FOLDER);
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
  return directory;
}

function extensionFor(contentType: string): string {
  if (contentType === 'application/pdf') return 'pdf';
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'jpg';
}

export async function persistAttachment(
  sourceUri: string,
  contentType: string,
  captureMode: OutboxAttachment['captureMode'],
): Promise<OutboxAttachment> {
  const target = new File(folder(), `${randomUUID()}.${extensionFor(contentType)}`);
  await new File(sourceUri).copy(target);
  return { uri: target.uri, contentType, captureMode };
}

/** Xoa tep khong con muc nao tham chieu (muc da gui, muc da bo). */
export function sweepAttachments(referenced: ReadonlySet<string>): number {
  const directory = new Directory(Paths.document, FOLDER);
  if (!directory.exists) return 0;
  let removed = 0;
  for (const entry of directory.list()) {
    if (entry instanceof File && !referenced.has(entry.uri)) {
      entry.delete();
      removed += 1;
    }
  }
  return removed;
}

/** `FormData` cua React Native: phan tep la `{ uri, name, type }`, native tu doc tep tu dia. */
export function formWithFile(
  attachment: OutboxAttachment,
  fields: Readonly<Record<string, string>>,
): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  const name =
    attachment.uri.split('/').pop() ?? `evidence.${extensionFor(attachment.contentType)}`;
  form.append('file', {
    uri: attachment.uri,
    name,
    type: attachment.contentType,
  } as unknown as Blob);
  return form;
}
