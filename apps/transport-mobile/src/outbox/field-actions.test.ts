import type { OutboxAttachment, OutboxItem } from '@netviet/driver-outbox';
import { beforeEach, describe, expect, it } from 'vitest';
import { HttpClient } from '../api/http';
import { ApiError } from '../api/errors';
import {
  PAUSE_PASSWORD_CHANGE,
  PAUSE_UNAUTHENTICATED,
  executeFieldAction,
  outcomeOf,
  type FieldAction,
  type FieldActionDeps,
  type ProgressStore,
} from './field-actions';

/**
 * MAY CHU GIA mo phong DUNG hop dong idempotency da do tren ma (#394 map:driver-api): mot khoa su
 * kien -> mot hang, lap lai tra ban cu. Kem "mang chap chon": co the lam ROT phan hoi SAU KHI may
 * chu da ghi — dung tinh huong lam sinh ra ban trung neu may khach thu lai mu quang.
 */
interface Call {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

class FakeServer {
  readonly calls: Call[] = [];
  readonly checkpoints = new Map<string, { id: string; observationId?: string }>();
  readonly observations = new Map<string, string>();
  readonly files: string[] = [];
  readonly documents = new Map<string, { fileId: string }>();
  readonly slips = new Map<string, { id: string; evidenceCount: number }>();
  readonly waiting = new Map<string, string>();
  sessions: Array<{ sessionId: string; status: string; runId: string | null; tripId: null }> = [];
  /** Duong dan -> so lan con lai se ghi xong roi LAM ROT phan hoi. */
  dropAfterCommit = new Map<string, number>();
  unauthenticated = false;
  private seq = 0;

  fetch = async (url: string, init: RequestInit): Promise<Response> => {
    const path = url.replace('https://api.example.vn', '');
    const body =
      typeof init.body === 'string'
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : init.body;
    this.calls.push({ method: String(init.method), path, body });
    if (this.unauthenticated) return json(401, { message: 'Bạn cần đăng nhập' });
    const result = this.route(String(init.method), path, body as Record<string, unknown>);
    const drops = this.dropAfterCommit.get(path) ?? 0;
    if (drops > 0) {
      this.dropAfterCommit.set(path, drops - 1);
      throw new TypeError('Network request failed');
    }
    return result;
  };

  private id(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  private route(method: string, path: string, body: Record<string, unknown>): Response {
    if (method === 'POST' && path === '/transport/me/tracking/sessions') {
      const open = this.sessions.find((row) => row.status === 'ACTIVE');
      if (open && open.runId === body.runId) return json(201, { id: open.sessionId });
      if (open)
        return json(409, { message: 'phien khac', reason: 'DRIVER_HAS_ANOTHER_OPEN_SESSION' });
      const sessionId = this.id('sess');
      this.sessions.push({ sessionId, status: 'ACTIVE', runId: String(body.runId), tripId: null });
      return json(201, { id: sessionId });
    }
    if (method === 'GET' && path === '/transport/me/tracking/sessions')
      return json(200, this.sessions);
    const close = /^\/transport\/me\/tracking\/sessions\/([^/]+)\/close$/.exec(path);
    if (method === 'POST' && close) {
      this.sessions = this.sessions.map((row) =>
        row.sessionId === close[1] ? { ...row, status: 'CLOSED' } : row,
      );
      return json(201, {});
    }
    if (method === 'POST' && /\/observations$/.test(path)) {
      const [first] = body.observations as Array<Record<string, unknown>>;
      const key = String(first?.clientEventId);
      const existing = this.observations.get(key) ?? this.id('obs');
      this.observations.set(key, existing);
      return json(201, [{ id: existing }]);
    }
    if (method === 'POST' && path === '/transport/me/checkpoints') {
      const key = `${String(body.runId)}|${String(body.type)}|${String(body.clientEventId)}`;
      if (!this.checkpoints.has(key)) {
        this.checkpoints.set(key, {
          id: this.id('cp'),
          observationId: body.observationId as string | undefined,
        });
      }
      return json(201, this.checkpoints.get(key));
    }
    if (method === 'POST' && path === '/files') {
      const fileId = this.id('file');
      this.files.push(fileId);
      return json(201, { id: fileId });
    }
    if (method === 'POST' && path === '/transport/me/documents') {
      const key = String(body.clientEventId);
      if (!this.documents.has(key)) this.documents.set(key, { fileId: String(body.fileId) });
      return json(201, { id: key });
    }
    if (method === 'POST' && path === '/transport/me/waiting-sessions') {
      const key = String(body.clientEventId);
      if (!this.waiting.has(key)) this.waiting.set(key, this.id('wait'));
      return json(201, { id: this.waiting.get(key) });
    }
    if (method === 'POST' && path === '/transport/me/fuel/slips') {
      const key = String(body.correlationKey);
      if (!this.slips.has(key)) this.slips.set(key, { id: this.id('slip'), evidenceCount: 0 });
      return json(201, this.slips.get(key));
    }
    const slipRead = /^\/transport\/me\/fuel\/slips\/([^/]+)$/.exec(path);
    if (method === 'GET' && slipRead) {
      const slip = [...this.slips.values()].find((row) => row.id === slipRead[1]);
      return slip ? json(200, slip) : json(404, { message: 'x', reason: 'FUEL_ENTRY_NOT_FOUND' });
    }
    const evidence = /^\/transport\/me\/fuel\/slips\/([^/]+)\/evidence\/upload$/.exec(path);
    if (method === 'POST' && evidence) {
      const slip = [...this.slips.values()].find((row) => row.id === evidence[1]);
      if (!slip) return json(404, { message: 'x' });
      slip.evidenceCount += 1; // KHONG idempotent — dung nhu may chu that
      return json(201, slip);
    }
    return json(404, { message: `khong co route ${method} ${path}`, reason: 'TEST_NO_ROUTE' });
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

class MemoryProgress implements ProgressStore {
  readonly values = new Map<string, string>();
  async readProgress(itemId: string, step: string) {
    return this.values.get(`${itemId}:${step}`) ?? null;
  }
  async writeProgress(itemId: string, step: string, value: string) {
    this.values.set(`${itemId}:${step}`, value);
  }
}

const PHOTO: OutboxAttachment = {
  uri: 'file:///doc.jpg',
  contentType: 'image/jpeg',
  captureMode: 'LIVE_CAMERA',
};

function outboxItem(action: FieldAction, attachments: OutboxAttachment[] = []): OutboxItem {
  return {
    id: 'row-1',
    clientEventId: 'evt-1',
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

const FIX = {
  latitude: 21.0285,
  longitude: 105.8542,
  accuracyMetres: 8,
  speedMetresPerSecond: null,
  bearingDegrees: null,
  source: 'DEVICE_FUSED' as const,
  capturedAt: '2026-09-25T07:00:00.000Z',
  mockLocationReported: false,
};

describe('executeFieldAction — thu lai KHONG sinh ban trung', () => {
  let server: FakeServer;
  let progress: MemoryProgress;
  let deps: FieldActionDeps;

  beforeEach(() => {
    server = new FakeServer();
    progress = new MemoryProgress();
    deps = {
      http: new HttpClient({
        baseUrl: 'https://api.example.vn',
        clientTag: 'test',
        getToken: () => 'tok',
        // Goi TRE qua `server.fetch` de bai nao thay ham do (mo phong mang rot) cung co hieu luc.
        fetchImpl: ((url: string, init: RequestInit) =>
          server.fetch(url, init)) as unknown as typeof fetch,
      }),
      progress,
      device: { installationId: 'inst-1:user-1', platform: 'ANDROID', appVersion: '0.1.0' },
      formWithFile: () => ({}) as FormData,
    };
  });

  const arrival: FieldAction = {
    type: 'CHECKPOINT',
    label: 'Đã đến nơi',
    runId: 'run-1',
    legId: 'leg-1',
    checkpointType: 'DELIVERY_ARRIVAL',
    note: null,
    location: { fix: FIX, observationClientEventId: 'obs-evt-1' },
  };

  it('moc can vi tri: phien -> ban dinh vi (fix dong bang) -> moc kem observationId', async () => {
    const outcome = await executeFieldAction(outboxItem(arrival), deps);

    expect(outcome).toEqual({ kind: 'ACCEPTED' });
    const paths = server.calls.map((call) => `${call.method} ${call.path}`);
    expect(paths).toEqual([
      'POST /transport/me/tracking/sessions',
      'POST /transport/me/tracking/sessions/sess-1/observations',
      'POST /transport/me/checkpoints',
    ]);
    expect(server.calls[0]?.body).toEqual({
      runId: 'run-1',
      device: { installationId: 'inst-1:user-1', platform: 'ANDROID', appVersion: '0.1.0' },
    });
    expect(server.calls[1]?.body).toEqual({
      observations: [
        {
          clientEventId: 'obs-evt-1',
          latitude: 21.0285,
          longitude: 105.8542,
          accuracyMetres: 8,
          source: 'DEVICE_FUSED',
          capturedAt: '2026-09-25T07:00:00.000Z',
          mockLocationReported: false,
        },
      ],
    });
    expect(server.calls[2]?.body).toEqual({
      type: 'DELIVERY_ARRIVAL',
      runId: 'run-1',
      legId: 'leg-1',
      observationId: 'obs-2',
      clientEventId: 'evt-1',
    });
  });

  it('mat phan hoi SAU khi may chu ghi moc -> thu lai van ra MOT moc, dung observation cu', async () => {
    server.dropAfterCommit.set('/transport/me/checkpoints', 1);

    const first = await executeFieldAction(outboxItem(arrival), deps);
    const second = await executeFieldAction(outboxItem(arrival), deps);

    expect(first.kind).toBe('RETRY');
    expect(second).toEqual({ kind: 'ACCEPTED' });
    expect(server.checkpoints.size).toBe(1);
    expect(server.observations.size).toBe(1);
    // Lan hai khong gui lai ban dinh vi — observationId da luu o tien trinh.
    expect(server.calls.filter((call) => call.path.endsWith('/observations'))).toHaveLength(1);
  });

  it('con phien cua viec KHAC dang mo -> dong no roi mo lai dung mot lan', async () => {
    server.sessions.push({ sessionId: 'old', status: 'ACTIVE', runId: 'run-0', tripId: null });

    const outcome = await executeFieldAction(outboxItem(arrival), deps);

    expect(outcome).toEqual({ kind: 'ACCEPTED' });
    expect(server.sessions.find((row) => row.sessionId === 'old')?.status).toBe('CLOSED');
    expect(
      server.calls.some((call) => call.path === '/transport/me/tracking/sessions/old/close'),
    ).toBe(true);
  });

  it('chung tu: tep tai MOT lan; mat phan hoi o buoc ghi chung tu khong tai lai tep', async () => {
    const doc: FieldAction = {
      type: 'DOCUMENT',
      label: 'Biên nhận giao hàng',
      runId: 'run-1',
      legId: 'leg-1',
      checkpointId: null,
      documentType: 'DELIVERY_RECEIPT',
      documentLabel: null,
      captureMode: 'LIVE_CAMERA',
    };
    server.dropAfterCommit.set('/transport/me/documents', 1);

    expect((await executeFieldAction(outboxItem(doc, [PHOTO]), deps)).kind).toBe('RETRY');
    expect(await executeFieldAction(outboxItem(doc, [PHOTO]), deps)).toEqual({ kind: 'ACCEPTED' });

    expect(server.files).toHaveLength(1);
    expect(server.documents.size).toBe(1);
    const recorded = server.calls.filter((call) => call.path === '/transport/me/documents');
    expect(recorded.map((call) => (call.body as { fileId: string }).fileId)).toEqual([
      'file-1',
      'file-1',
    ]);
    expect(recorded[0]?.body).toMatchObject({
      basis: 'DIGITAL_FILE',
      captureMode: 'LIVE_CAMERA',
      clientEventId: 'evt-1',
    });
  });

  it('anh phieu dau: mat phan hoi SAU khi gan -> doc lai phieu, KHONG gan lan hai', async () => {
    const slip: FieldAction = {
      type: 'FUEL_SLIP',
      label: 'Phiếu đổ dầu',
      body: { correlationKey: 'fuel-evt-1', runId: 'run-1', businessDate: '2026-09-25' },
    };
    const path = '/transport/me/fuel/slips/slip-1/evidence/upload';
    server.dropAfterCommit.set(path, 1);

    expect((await executeFieldAction(outboxItem(slip, [PHOTO]), deps)).kind).toBe('RETRY');
    expect(await executeFieldAction(outboxItem(slip, [PHOTO]), deps)).toEqual({ kind: 'ACCEPTED' });

    expect(server.slips.get('fuel-evt-1')?.evidenceCount).toBe(1);
    expect(server.calls.filter((call) => call.path === path)).toHaveLength(1);
    expect(server.calls.filter((call) => call.path === '/transport/me/fuel/slips')).toHaveLength(1);
  });

  it('anh phieu dau: lan truoc chua toi may chu -> lan sau tai that', async () => {
    const slip: FieldAction = {
      type: 'FUEL_SLIP',
      label: 'Phiếu đổ dầu',
      body: { correlationKey: 'fuel-evt-2' },
    };
    let failUpload = true;
    const original = server.fetch;
    server.fetch = async (url, init) => {
      if (failUpload && url.endsWith('/evidence/upload')) {
        failUpload = false;
        throw new TypeError('Network request failed'); // chua toi may chu
      }
      return original(url, init);
    };

    expect((await executeFieldAction(outboxItem(slip, [PHOTO]), deps)).kind).toBe('RETRY');
    expect(await executeFieldAction(outboxItem(slip, [PHOTO]), deps)).toEqual({ kind: 'ACCEPTED' });
    expect(server.slips.get('fuel-evt-2')?.evidenceCount).toBe(1);
  });

  it('bat dau cho lap lai -> mot phien cho', async () => {
    const wait: FieldAction = {
      type: 'WAITING_START',
      label: 'Bắt đầu chờ',
      runId: 'run-1',
      legId: 'leg-1',
      arrivalCheckpointId: 'cp-9',
      reason: 'RECEIVER_NOT_READY',
      note: null,
    };
    server.dropAfterCommit.set('/transport/me/waiting-sessions', 1);
    await executeFieldAction(outboxItem(wait), deps);
    await executeFieldAction(outboxItem(wait), deps);
    expect(server.waiting.size).toBe(1);
  });

  it('401 -> RETRY co ma dung hang doi, KHONG BAO GIO chan viec', async () => {
    server.unauthenticated = true;
    expect(await executeFieldAction(outboxItem(arrival), deps)).toEqual({
      kind: 'RETRY',
      reason: PAUSE_UNAUTHENTICATED,
    });
  });

  it('may chu phan quyet (400 co reason) -> REJECTED mang ma de hien cho nguoi dung', async () => {
    const bad: FieldAction = {
      ...arrival,
      type: 'CHECKPOINT',
      location: null,
      checkpointType: 'NOT_A_TYPE',
    };
    const original = server.fetch;
    server.fetch = async (url, init) =>
      url.endsWith('/checkpoints')
        ? json(400, { message: 'Thieu moc truoc', reason: 'CHECKPOINT_PREDECESSOR_MISSING' })
        : original(url, init);
    expect(await executeFieldAction(outboxItem(bad), deps)).toEqual({
      kind: 'REJECTED',
      reason: 'CHECKPOINT_PREDECESSOR_MISSING',
    });
  });
});

describe('outcomeOf — 403 nao la phan quyet, 403 nao chi la tam dung', () => {
  it('PASSWORD_CHANGE_REQUIRED (#395) -> tam dung, KHONG phai tu choi viec da bam', () => {
    const error = new ApiError('FORBIDDEN', 'Can doi mat khau', 403, 'PASSWORD_CHANGE_REQUIRED');
    expect(outcomeOf(error)).toEqual({ kind: 'RETRY', reason: PAUSE_PASSWORD_CHANGE });
  });

  it('403 quyen thuong van la phan quyet cuoi', () => {
    const error = new ApiError('FORBIDDEN', 'Khong co quyen', 403, 'TRANSPORT_ACTION_DENIED');
    expect(outcomeOf(error)).toEqual({ kind: 'REJECTED', reason: 'TRANSPORT_ACTION_DENIED' });
  });
});
