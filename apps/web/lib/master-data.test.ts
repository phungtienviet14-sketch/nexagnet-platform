import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetAuthClientForTests } from './auth';
import {
  parseMasterDataView,
  settingsApi,
  type MasterDataImportPayload,
} from './settings';

afterEach(() => {
  vi.unstubAllGlobals();
  resetAuthClientForTests();
});

describe('master-data settings client', () => {
  it('parses dealer metadata, effective deals, groups and explicit unmapped groups fail-closed', () => {
    expect(
      parseMasterDataView({
        dealers: [
          { id: 'd1', name: 'Đại lý 1', status: 'future', metadata: { province: 'HN' } },
        ],
        deals: [
          {
            id: 'deal-1',
            dealerId: 'd1',
            sku: 'FELIX',
            price: 900000,
            enabled: true,
            effectiveFrom: '2026-08-01T00:00:00.000Z',
          },
        ],
        groups: [{ id: 'g1', chatId: 'chat-1', name: 'Nhóm 1', status: 'mapped' }],
        unmappedGroups: [
          { id: 'g2', chatId: 'chat-2', name: 'Nhóm 2', status: 'pending' },
        ],
      }),
    ).toEqual(
      expect.objectContaining({
        dealers: [expect.objectContaining({ id: 'd1', status: 'inactive' })],
        deals: [expect.objectContaining({ id: 'deal-1', enabled: true })],
        unmappedGroups: [expect.objectContaining({ chatId: 'chat-2', status: 'pending' })],
      }),
    );
  });

  it('uses preview then token-bound apply and sends DELETE for soft-disable endpoints', async () => {
    const preview = {
      valid: true,
      previewToken: 'a'.repeat(64),
      totals: { create: 1, update: 0, unchanged: 0, error: 0 },
      rows: [],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ csrfToken: 'csrf-1' }))
      .mockResolvedValueOnce(Response.json(preview))
      .mockResolvedValueOnce(Response.json({ ...preview, applied: 1 }))
      .mockResolvedValueOnce(Response.json({ id: 'd1', status: 'inactive' }))
      .mockResolvedValueOnce(Response.json({ id: 'deal-1', enabled: false }));
    vi.stubGlobal('fetch', fetchMock);
    const payload: MasterDataImportPayload = {
      format: 'json',
      encoding: 'utf8',
      content: '{"dealers":[]}',
    };

    await expect(settingsApi.previewMasterDataImport(payload)).resolves.toEqual(preview);
    await expect(settingsApi.applyMasterDataImport(payload, preview.previewToken)).resolves.toEqual(
      expect.objectContaining({ applied: 1 }),
    );
    await settingsApi.disableDealer('d/1');
    await settingsApi.disableDeal('deal/1');

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/settings/master-data/import/preview',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify(payload),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3001/settings/master-data/import/apply',
      expect.objectContaining({
        body: JSON.stringify({ ...payload, previewToken: preview.previewToken, confirmed: true }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'http://localhost:3001/settings/master-data/dealers/d%2F1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
