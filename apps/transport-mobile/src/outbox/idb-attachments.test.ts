import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import { openOutboxIdb } from './idb';
import { IdbAttachmentStore, SWEEP_GRACE_MS } from './idb-attachments';

/**
 * TEP DINH KEM cua PWA: chep byte luc chon anh, doc lai luc gui (ke ca sau khi tai lai trang), don
 * khi het ai tham chieu. `data:` doc bang `fetch` that cua Node — dung duong trinh duyet di.
 */
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('IdbAttachmentStore', () => {
  let factory: IDBFactory;
  let clock: number;
  let seq: number;

  async function open(): Promise<IdbAttachmentStore> {
    const db = await openOutboxIdb(factory);
    return new IdbAttachmentStore(
      db,
      () => clock,
      () => `f${++seq}`,
    );
  }

  beforeEach(() => {
    factory = new IDBFactory();
    clock = Date.parse('2026-09-25T08:00:00.000Z');
    seq = 0;
  });

  it('chep byte vao kho va tra tham chieu idb://, khong nhoi byte vao hang doi', async () => {
    const files = await open();

    const attachment = await files.persist(PNG_1PX, 'image/png', 'LIVE_CAMERA');

    expect(attachment).toEqual({
      uri: 'idb://f1',
      contentType: 'image/png',
      captureMode: 'LIVE_CAMERA',
    });
  });

  it('formWithFile: File that, dung ten + kieu + byte, kem cac truong — sau khi mo lai co so', async () => {
    const attachment = await (await open()).persist(PNG_1PX, 'image/png', 'GALLERY');
    const reopened = await open();

    const form = await reopened.formWithFile(attachment, { purpose: 'OPERATIONAL_DOCUMENT' });

    expect(form.get('purpose')).toBe('OPERATIONAL_DOCUMENT');
    const file = form.get('file');
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe('f1.png');
    expect((file as File).type).toBe('image/png');
    const original = new Uint8Array(await (await fetch(PNG_1PX)).arrayBuffer());
    expect(new Uint8Array(await (file as File).arrayBuffer())).toEqual(original);
  });

  it('tep da mat thi tu choi VINH VIEN (BLOCKED), khong thu lai mai', async () => {
    const files = await open();
    const lost = {
      uri: 'idb://khong-co',
      contentType: 'image/jpeg',
      captureMode: 'UNKNOWN' as const,
    };
    const foreign = {
      uri: 'file:///x.jpg',
      contentType: 'image/jpeg',
      captureMode: 'UNKNOWN' as const,
    };

    for (const attachment of [lost, foreign]) {
      const error = await files.formWithFile(attachment, {}).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).reason).toBe('OUTBOX_ATTACHMENT_MISSING');
      expect((error as ApiError).isRetryable).toBe(false);
    }
  });

  it('don tep: chi xoa tep KHONG ai tham chieu VA da qua tuoi an toan', async () => {
    const files = await open();
    const kept = await files.persist(PNG_1PX, 'image/png', 'GALLERY');
    const orphan = await files.persist(PNG_1PX, 'image/png', 'GALLERY');
    clock += SWEEP_GRACE_MS + 1;
    const fresh = await files.persist(PNG_1PX, 'image/png', 'GALLERY');

    expect(await files.sweep(new Set([kept.uri]))).toBe(1);
    await expect(files.formWithFile(orphan, {})).rejects.toBeInstanceOf(ApiError);
    await expect(files.formWithFile(kept, {})).resolves.toBeInstanceOf(FormData);
    // Vua chon anh, chua kip xep hang: mot lan don chay dung luc do khong duoc cuop no.
    await expect(files.formWithFile(fresh, {})).resolves.toBeInstanceOf(FormData);
  });

  it('nguon doc loi thi bao ro, khong ghi mot tep rong', async () => {
    const db = await openOutboxIdb(factory);
    const files = new IdbAttachmentStore(
      db,
      () => clock,
      () => 'x',
      async () => new Response(null, { status: 404 }),
    );

    await expect(
      files.persist('blob:https://a.vn/het-han', 'image/jpeg', 'GALLERY'),
    ).rejects.toThrow(/404/);
    expect(await files.sweep(new Set())).toBe(0);
  });
});
