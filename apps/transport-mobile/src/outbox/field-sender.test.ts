import type { OutboxAttachment, OutboxItem } from '@netviet/driver-outbox';
import { describe, expect, it } from 'vitest';
import { HttpClient } from '../api/http';
import { PAUSE_UNAUTHENTICATED, type FieldAction, type ProgressStore } from './field-actions';
import { createFieldSender } from './field-sender';

/**
 * NGUOI GUI dung chung native + PWA: thu tu bam, dung hang khi het phien, va doi `FormData` bat dong
 * bo (PWA doc byte tu IndexedDB) truoc khi tai tep len.
 */
interface Call {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

function stubHttp(status: (path: string) => number, calls: Call[]): HttpClient {
  return new HttpClient({
    baseUrl: 'https://api.example.vn',
    clientTag: 'test',
    getToken: () => 'tok',
    fetchImpl: (async (url: string, init: RequestInit) => {
      const path = url.replace('https://api.example.vn', '');
      calls.push({ method: String(init.method), path, body: init.body });
      const code = status(path);
      const body = code === 401 ? { message: 'Bạn cần đăng nhập' } : { id: `id-${calls.length}` };
      return new Response(JSON.stringify(body), { status: code });
    }) as unknown as typeof fetch,
  });
}

class MemoryProgress implements ProgressStore {
  private readonly values = new Map<string, string>();
  async readProgress(itemId: string, step: string) {
    return this.values.get(`${itemId}/${step}`) ?? null;
  }
  async writeProgress(itemId: string, step: string, value: string) {
    this.values.set(`${itemId}/${step}`, value);
  }
  async listPending(): Promise<readonly OutboxItem[]> {
    return [];
  }
}

function proof(id: string, action: FieldAction, attachments: OutboxAttachment[] = []): OutboxItem {
  return {
    id,
    clientEventId: `evt-${id}`,
    kind: 'PROOF',
    capturedAt: '2026-09-25T07:00:00.000Z',
    payload: action as unknown as Record<string, unknown>,
    attachments,
    attempts: 0,
    nextAttemptAt: '2026-09-25T07:00:00.000Z',
    state: 'PENDING',
    lastError: null,
  };
}

const checkpoint = (label: string): FieldAction => ({
  type: 'CHECKPOINT',
  label,
  runId: 'run-1',
  legId: 'leg-1',
  checkpointType: 'PICKUP_ARRIVAL',
  note: null,
  location: null,
});

describe('createFieldSender', () => {
  it('gui viec bam TUNG CAI theo thu tu; het phien thi dung, khong goi them', async () => {
    const calls: Call[] = [];
    const sender = createFieldSender(
      stubHttp(() => 401, calls),
      new MemoryProgress(),
      null,
      () => new FormData(),
    );

    const outcomes = await sender.sendBatch([
      proof('a', checkpoint('Đã tới')),
      proof('b', checkpoint('Rời điểm lấy hàng')),
    ]);

    expect(outcomes).toEqual([
      { kind: 'RETRY', reason: PAUSE_UNAUTHENTICATED },
      { kind: 'RETRY', reason: PAUSE_UNAUTHENTICATED },
    ]);
    expect(calls.map((call) => call.path)).toEqual(['/transport/me/checkpoints']);
  });

  it('cho FormData BAT DONG BO (PWA) roi moi tai tep — tep tai len la tep that', async () => {
    const calls: Call[] = [];
    const file = new File([new Uint8Array([1, 2, 3])], 'f1.jpg', { type: 'image/jpeg' });
    const sender = createFieldSender(
      stubHttp(() => 201, calls),
      new MemoryProgress(),
      null,
      async (_attachment, fields) => {
        await Promise.resolve();
        const form = new FormData();
        for (const [key, value] of Object.entries(fields)) form.append(key, value);
        form.append('file', file, file.name);
        return form;
      },
    );
    const document: FieldAction = {
      type: 'DOCUMENT',
      label: 'Chụp biên bản giao hàng',
      runId: 'run-1',
      legId: 'leg-1',
      checkpointId: null,
      documentType: 'DELIVERY_NOTE',
      documentLabel: null,
      captureMode: 'LIVE_CAMERA',
    };

    const outcomes = await sender.sendBatch([
      proof('d', document, [
        { uri: 'idb://f1', contentType: 'image/jpeg', captureMode: 'LIVE_CAMERA' },
      ]),
    ]);

    expect(outcomes).toEqual([{ kind: 'ACCEPTED' }]);
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      'POST /files',
      'POST /transport/me/documents',
    ]);
    const uploaded = calls[0]?.body as FormData;
    expect(uploaded.get('purpose')).toBe('OPERATIONAL_DOCUMENT');
    expect((uploaded.get('file') as File).name).toBe('f1.jpg');
  });
});
