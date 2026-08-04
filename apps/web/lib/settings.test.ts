import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildParticipantQuery,
  filterParticipants,
  normalizeSourceTruthChanges,
  parseSettingsSummary,
  resolveSourceTruthRowId,
  settingsApi,
  type GroupParticipant,
} from './settings';

const PARTICIPANTS: GroupParticipant[] = [
  {
    id: 'participant-1',
    groupId: 'group-1',
    externalUserId: 'zca-user-1',
    displayName: 'Lan Anh',
    customerRank: 'dai_ly',
    operationalRole: 'khach_hang',
    handlingMode: 'process',
    active: true,
    source: 'zca_sync',
  },
  {
    id: 'participant-2',
    groupId: 'group-1',
    externalUserId: 'zca-user-2',
    displayName: 'Minh Kế toán',
    customerRank: 'unknown',
    operationalRole: 'ke_toan',
    handlingMode: 'ignore',
    active: true,
    source: 'zca_sync',
  },
];

describe('settings response schemas', () => {
  it('keeps the operator page usable when summary fields are absent', () => {
    expect(parseSettingsSummary({})).toEqual(
      expect.objectContaining({
        channelMode: 'mock',
        autoSend: false,
        sourceTruth: expect.objectContaining({ status: 'unavailable' }),
        rules: expect.objectContaining({ status: 'unavailable' }),
        groups: [],
      }),
    );
  });

  it('fails closed for unknown channel and automation values', () => {
    const summary = parseSettingsSummary({ channelMode: 'future-mode', autoSend: 'yes' });

    expect(summary.channelMode).toBe('mock');
    expect(summary.autoSend).toBe(false);
  });

  it('normalizes an enveloped summary without trusting extra fields', () => {
    const summary = parseSettingsSummary({
      success: true,
      data: {
        channelMode: 'hybrid',
        autoSend: { enabled: true },
        botIdentity: { state: 'ready', id: 'bot-1', name: 'Ultty Bot', token: 'hidden' },
        groups: [{ id: 'zca-1', name: 'Đại lý Hà Nội', allowed: true, memberCount: 12 }],
      },
    });

    expect(summary.channelMode).toBe('hybrid');
    expect(summary.autoSend).toBe(true);
    expect(summary.botIdentity).toEqual({ state: 'ready', id: 'bot-1', name: 'Ultty Bot' });
    expect(summary.groups).toEqual([
      expect.objectContaining({ zcaChatId: 'zca-1', name: 'Đại lý Hà Nội', allowed: true }),
    ]);
  });
});

describe('participant view model', () => {
  it('builds encoded filters and omits empty values', () => {
    expect(
      buildParticipantQuery({
        search: 'kế toán & sale',
        customerRank: 'all',
        operationalRole: 'ke_toan',
        handlingMode: 'ignore',
      }),
    ).toBe('?search=k%E1%BA%BF+to%C3%A1n+%26+sale&operationalRole=ke_toan&handlingMode=ignore');
  });

  it('filters by normalized name and classification without mutating input', () => {
    const original = [...PARTICIPANTS];
    const filtered = filterParticipants(PARTICIPANTS, {
      search: 'ke toan',
      customerRank: 'all',
      operationalRole: 'ke_toan',
      handlingMode: 'all',
    });

    expect(filtered.map((participant) => participant.id)).toEqual(['participant-2']);
    expect(PARTICIPANTS).toEqual(original);
  });
});

describe('source-truth form view model', () => {
  it('does not coerce a cleared required price to zero', () => {
    expect(
      normalizeSourceTruthChanges(
        { productId: 'product-1', wholesale: '' },
        ['productId', 'wholesale'],
        ['wholesale'],
      ),
    ).toEqual({ success: false, error: 'Cần nhập wholesale.' });
  });

  it('converts validated numeric fields and rejects negative prices', () => {
    expect(
      normalizeSourceTruthChanges({ wholesale: '1500000' }, ['wholesale'], ['wholesale']),
    ).toEqual({
      success: true,
      data: { wholesale: 1_500_000 },
    });
    expect(normalizeSourceTruthChanges({ wholesale: '-1' }, ['wholesale'], ['wholesale'])).toEqual({
      success: false,
      error: 'wholesale không được là số âm.',
    });
  });

  it('turns cleared nullable fields into null without coercing them to zero', () => {
    expect(
      normalizeSourceTruthChanges(
        { wholesale: '1500000', minRetailPrice: '', validMonth: '' },
        ['wholesale'],
        ['wholesale', 'minRetailPrice'],
        ['minRetailPrice', 'validMonth'],
      ),
    ).toEqual({
      success: true,
      data: { wholesale: 1_500_000, minRetailPrice: null, validMonth: null },
    });
  });

  it('uses stable resource identifiers, including the inferred override composite', () => {
    expect(resolveSourceTruthRowId('prices', { sku: 'FELIX' }, 0)).toBe('FELIX');
    expect(resolveSourceTruthRowId('overrides', { dealerId: 'meta-hn', sku: 'FELIX' }, 0)).toBe(
      'meta-hn:FELIX',
    );
    expect(resolveSourceTruthRowId('glossary', { term: 'HN' }, 0)).toBe('HN');
  });
});

describe('settings API contracts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('syncs members through the planned allowlisted group endpoint', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ active: 11, inactive: 1, syncedAt: '2026-08-03T08:00:00.000Z' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await settingsApi.syncMembers('zca group/1');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/zalo/groups/zca%20group%2F1/members/sync',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('falls back to the three existing status endpoints when the summary facade is unavailable', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/settings/summary')) return new Response(null, { status: 404 });
      if (url.endsWith('/zalo/status')) {
        return Response.json({ state: 'ready', displayName: 'Tài khoản phụ' });
      }
      if (url.endsWith('/zalo/groups')) {
        return Response.json([{ id: 'group-1', name: 'Nhóm Hà Nội', allowed: true }]);
      }
      return Response.json({ channelMode: 'zca', autoSend: false });
    });
    vi.stubGlobal('fetch', fetchMock);

    const summary = await settingsApi.summary();

    expect(summary).toEqual(
      expect.objectContaining({
        availability: 'fallback',
        channelMode: 'zca',
        zcaState: 'ready',
        zcaDisplayName: 'Tài khoản phụ',
        groups: [expect.objectContaining({ zcaChatId: 'group-1', allowed: true })],
      }),
    );
  });

  it('loads source-truth resources independently and keeps a failed section usable', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/groups')) {
        return Response.json({ message: 'Database chưa sẵn sàng' }, { status: 503 });
      }
      if (url.endsWith('/prices')) return Response.json([{ sku: 'FELIX', wholesale: 1_250_000 }]);
      if (url.endsWith('/overrides')) {
        return Response.json([{ dealerId: 'meta-hn', sku: 'FELIX', price: 1_100_000 }]);
      }
      return Response.json([]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const sections = await settingsApi.sourceTruth();

    expect(sections).toHaveLength(6);
    expect(sections.find((section) => section.resource === 'groups')).toEqual(
      expect.objectContaining({ rows: [], error: 'Database chưa sẵn sàng' }),
    );
    expect(sections.find((section) => section.resource === 'prices')?.rows[0]).toEqual(
      expect.objectContaining({ id: 'FELIX', label: 'FELIX' }),
    );
    expect(sections.find((section) => section.resource === 'overrides')?.rows[0]?.id).toBe(
      'meta-hn:FELIX',
    );
  });

  it('patches only the explicit participant classification fields', async () => {
    const fetchMock = vi.fn(async () => Response.json(PARTICIPANTS[0]));
    vi.stubGlobal('fetch', fetchMock);

    await settingsApi.updateParticipant('group/1', 'participant/1', {
      customerRank: 'ctv',
      operationalRole: 'sale',
      handlingMode: 'manual_review',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/groups/group%2F1/participants/participant%2F1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          customerRank: 'ctv',
          operationalRole: 'sale',
          handlingMode: 'manual_review',
        }),
      }),
    );
  });

  it('previews and atomically applies bulk participant changes through the collection endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ affectedCount: 2, warnings: [] }))
      .mockResolvedValueOnce(Response.json({ participants: PARTICIPANTS, total: 2 }));
    vi.stubGlobal('fetch', fetchMock);
    const request = {
      participantIds: ['participant-1', 'participant-2'],
      patch: { handlingMode: 'manual_review' as const },
    };

    await settingsApi.previewParticipantBulk('group-1', request);
    await settingsApi.bulkUpdateParticipants('group-1', request);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/groups/group-1/participants',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          participantIds: request.participantIds,
          changes: request.patch,
          preview: true,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/groups/group-1/participants',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          participantIds: request.participantIds,
          changes: request.patch,
          preview: false,
          confirmed: true,
        }),
      }),
    );
  });

  it('keeps create identifiers in the body and strips immutable identifiers on update', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([]));
    vi.stubGlobal('fetch', fetchMock);

    await settingsApi.saveSourceTruth('products', undefined, {
      sku: 'FELIX',
      name: 'Ghế Felix',
      unit: 'chiếc',
    });
    await settingsApi.saveSourceTruth('prices', 'FELIX', {
      sku: 'FELIX',
      wholesale: 1_250_000,
      minRetailPrice: null,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/settings/source-truth/products',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ sku: 'FELIX', name: 'Ghế Felix', unit: 'chiếc' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/settings/source-truth/prices/FELIX',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ wholesale: 1_250_000, minRetailPrice: null }),
      }),
    );
  });

  it('uses the shared automation facade and sends the two-step acknowledgement', async () => {
    const fetchMock = vi.fn(async () => Response.json({ autoSend: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(settingsApi.setAutoSend(true)).resolves.toEqual({ autoSend: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/settings/automation/auto-send',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ enabled: true, acknowledged: true }),
      }),
    );
  });

  it('surfaces a useful API error without exposing a long response body', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: 'Nhóm chưa nằm trong danh sách cho phép' }), {
          status: 403,
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(settingsApi.syncMembers('group-1')).rejects.toThrow(
      'Nhóm chưa nằm trong danh sách cho phép',
    );
  });

  it('requires the API to explicitly clear provisional rules before activation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json([{ id: 'rule-unknown', version: 1, status: 'preview', payload: {} }]),
      )
      .mockResolvedValueOnce(
        Response.json([
          {
            id: 'rule-verified',
            version: 2,
            status: 'preview',
            payload: {},
            provisionalKeys: [],
          },
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(settingsApi.rules()).resolves.toEqual([
      expect.objectContaining({ id: 'rule-unknown', provisionalVerified: false }),
    ]);
    await expect(settingsApi.rules()).resolves.toEqual([
      expect.objectContaining({ id: 'rule-verified', provisionalVerified: true }),
    ]);
  });

  it('redacts sensitive audit keys at the final display boundary', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        entries: [
          {
            id: 'audit-1',
            actor: 'operator',
            action: 'update',
            entityType: 'participant',
            createdAt: '2026-08-03T08:00:00.000Z',
            after: {
              handlingMode: 'ignore',
              phone: '0900000000',
              nested: { accessToken: 'secret' },
            },
          },
        ],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const page = await settingsApi.audit({});

    expect(page.entries[0]?.after).toEqual({
      handlingMode: 'ignore',
      phone: '[đã ẩn]',
      nested: { accessToken: '[đã ẩn]' },
    });
  });
});
