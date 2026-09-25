import type { OutboxItem } from '@netviet/driver-outbox';
import { describe, expect, it } from 'vitest';
import { HttpClient } from '../api/http';
import { sendObservationBatch } from './observation-sender';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function point(id: string, runId: string, latitude = 21): OutboxItem {
  return {
    id: `row-${id}`,
    clientEventId: id,
    kind: 'OBSERVATION',
    capturedAt: '2026-09-25T07:00:00.000Z',
    payload: {
      runId,
      fix: {
        latitude,
        longitude: 105,
        accuracyMetres: 12,
        speedMetresPerSecond: 8.5,
        bearingDegrees: null,
        source: 'DEVICE_FUSED',
        capturedAt: '2026-09-25T07:00:00.000Z',
        mockLocationReported: false,
      },
    },
    attachments: [],
    attempts: 0,
    nextAttemptAt: '2026-09-25T07:00:00.000Z',
    state: 'PENDING',
    lastError: null,
  };
}

function client(route: (path: string, body: Record<string, unknown>) => Response) {
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  const http = new HttpClient({
    baseUrl: 'https://api.example.vn',
    clientTag: 'test',
    getToken: () => 'tok',
    fetchImpl: (async (url: string, init: RequestInit) => {
      const path = url.replace('https://api.example.vn', '');
      const body = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
      calls.push({ path, body });
      return route(path, body);
    }) as unknown as typeof fetch,
  });
  return { http, calls };
}

describe('sendObservationBatch', () => {
  it('mot lo cho moi vong chay, mo phien theo runId', async () => {
    const { http, calls } = client((path, body) =>
      path.endsWith('/sessions') ? json(201, { id: `s-${String(body.runId)}` }) : json(201, []),
    );

    const outcomes = await sendObservationBatch(
      [point('a', 'r1'), point('b', 'r2'), point('c', 'r1')],
      http,
      null,
    );

    expect(outcomes.map((row) => row.kind)).toEqual(['ACCEPTED', 'ACCEPTED', 'ACCEPTED']);
    const batches = calls.filter((call) => call.path.endsWith('/observations'));
    expect(batches.map((call) => call.path)).toEqual([
      '/transport/me/tracking/sessions/s-r1/observations',
      '/transport/me/tracking/sessions/s-r2/observations',
    ]);
    expect((batches[0]?.body.observations as unknown[]).length).toBe(2);
  });

  it('mot diem hong -> tach tung diem: chi diem do bi chan, cac diem khac duoc nhan', async () => {
    const { http } = client((path, body) => {
      if (path.endsWith('/sessions')) return json(201, { id: 's1' });
      const rows = body.observations as Array<{ latitude: number }>;
      return rows.some((row) => row.latitude === 0)
        ? json(400, { message: 'Toa do khong hop le', reason: 'COORDINATE_REJECTED' })
        : json(201, []);
    });

    const outcomes = await sendObservationBatch(
      [point('a', 'r1'), point('bad', 'r1', 0), point('c', 'r1')],
      http,
      null,
    );

    expect(outcomes).toEqual([
      { kind: 'ACCEPTED' },
      { kind: 'REJECTED', reason: 'COORDINATE_REJECTED' },
      { kind: 'ACCEPTED' },
    ]);
  });

  it('vong chay da ket thuc -> chan ca nhom, KHONG tach tung diem vo ich', async () => {
    const { http, calls } = client((path) =>
      path.endsWith('/sessions')
        ? json(409, { message: 'Vong chay da xong', reason: 'RUN_NOT_ACTIVE' })
        : json(201, []),
    );

    const outcomes = await sendObservationBatch([point('a', 'r1'), point('b', 'r1')], http, null);

    expect(outcomes.every((row) => row.kind === 'REJECTED')).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('mat mang -> ca nhom thu lai sau, khong diem nao bi chan', async () => {
    const { http } = client(() => {
      throw new TypeError('Network request failed');
    });
    const outcomes = await sendObservationBatch([point('a', 'r1')], http, null);
    expect(outcomes[0]?.kind).toBe('RETRY');
  });
});
