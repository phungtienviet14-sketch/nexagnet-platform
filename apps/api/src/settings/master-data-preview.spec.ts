import { describe, expect, it } from 'vitest';
import {
  buildMasterDataImportPreview,
  type MasterDataSnapshot,
} from './master-data-preview.js';
import type { ParsedMasterDataImport } from './master-data-import.js';

const NOW = new Date('2026-08-12T00:00:00.000Z');

function snapshot(): MasterDataSnapshot {
  return {
    dealers: [
      {
        id: 'dealer-1',
        code: 'D1',
        name: 'Đại lý 1',
        aliases: [],
        tier: 'dai_ly',
        defaultPolicy: 'cong_no_30',
        phone: null,
        status: 'active',
        metadata: null,
      },
    ],
    deals: [
      {
        id: 'deal-1',
        dealerId: 'dealer-1',
        sku: 'FELIX',
        price: 900_000,
        minQuantity: 1,
        enabled: true,
        effectiveFrom: null,
        effectiveTo: null,
      },
    ],
    groups: [
      {
        id: 'group-1',
        chatId: 'chat-1',
        name: 'Nhóm Hà Nội',
        branch: 'HN',
        dealerId: null,
        status: 'pending',
        source: 'auto_suggest',
      },
      {
        id: 'group-2',
        chatId: 'chat-2',
        name: 'Tên trùng',
        branch: null,
        dealerId: null,
        status: 'pending',
        source: 'auto_suggest',
      },
      {
        id: 'group-3',
        chatId: 'chat-3',
        name: 'Tên trùng',
        branch: null,
        dealerId: null,
        status: 'pending',
        source: 'auto_suggest',
      },
    ],
    productSkus: ['FELIX', 'MILO'],
  };
}

function parsed(rows: ParsedMasterDataImport['rows']): ParsedMasterDataImport {
  return { format: 'json', rows, errors: [] };
}

describe('buildMasterDataImportPreview', () => {
  it('returns deterministic create/update/unchanged diffs and resolves one exact discovered group name', () => {
    const input = parsed([
      {
        resource: 'dealer',
        rowNumber: 1,
        value: {
          code: 'D1',
          name: 'Đại lý 1 đổi tên',
          aliases: [],
          tier: 'dai_ly',
          defaultPolicy: 'cong_no_30',
          phone: null,
          status: 'active',
          metadata: null,
        },
      },
      {
        resource: 'deal',
        rowNumber: 1,
        value: {
          dealerId: 'dealer-1',
          sku: 'FELIX',
          price: 900_000,
          minQuantity: 1,
          enabled: true,
          effectiveFrom: null,
          effectiveTo: null,
        },
      },
      {
        resource: 'group',
        rowNumber: 1,
        value: {
          chatId: null,
          name: 'Nhóm Hà Nội',
          dealerId: 'dealer-1',
          dealerReference: 'D1',
          branch: 'HN',
          enabled: true,
        },
      },
      {
        resource: 'dealer',
        rowNumber: 2,
        value: {
          id: 'dealer-2',
          code: null,
          name: 'Đại lý 2',
          aliases: [],
          tier: 'ctv',
          defaultPolicy: 'thanh_toan_ngay',
          phone: null,
          status: 'active',
          metadata: null,
        },
      },
    ]);

    const first = buildMasterDataImportPreview(input, snapshot(), NOW);
    const second = buildMasterDataImportPreview(input, snapshot(), NOW);

    expect(first.valid).toBe(true);
    expect(first.totals).toEqual({ create: 1, update: 2, unchanged: 1, error: 0 });
    expect(first.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resource: 'group', key: 'chat-1', action: 'update' }),
        expect.objectContaining({ resource: 'deal', key: 'dealer-1:FELIX', action: 'unchanged' }),
      ]),
    );
    expect(first.previewToken).toBe(second.previewToken);
  });

  it('reports missing products, missing dealers, ambiguous name-only groups, and invalid effective ranges per row', () => {
    const input = parsed([
      {
        resource: 'deal',
        rowNumber: 4,
        value: {
          dealerId: 'missing',
          sku: 'UNKNOWN',
          price: 1,
          minQuantity: 1,
          enabled: true,
          effectiveFrom: '2026-09-01T00:00:00.000Z',
          effectiveTo: '2026-08-01T00:00:00.000Z',
        },
      },
      {
        resource: 'group',
        rowNumber: 5,
        value: {
          chatId: null,
          name: 'Tên trùng',
          dealerId: 'missing',
          dealerReference: 'missing',
          branch: null,
          enabled: true,
        },
      },
    ]);

    const preview = buildMasterDataImportPreview(input, snapshot(), NOW);

    expect(preview.valid).toBe(false);
    expect(preview.totals.error).toBe(2);
    expect(preview.rows[0]?.errors.join(' ')).toMatch(/SKU.*UNKNOWN.*đại lý.*missing.*effective/i);
    expect(preview.rows[1]?.errors.join(' ')).toMatch(/không duy nhất|nhiều nhóm/i);
  });

  it('treats duplicate natural keys in one import as row errors instead of last-write-wins', () => {
    const dealer = {
      id: 'dealer-2',
      code: null,
      name: 'Đại lý 2',
      aliases: [],
      tier: 'ctv' as const,
      defaultPolicy: 'thanh_toan_ngay' as const,
      phone: null,
      status: 'active' as const,
      metadata: null,
    };
    const preview = buildMasterDataImportPreview(
      parsed([
        { resource: 'dealer', rowNumber: 1, value: dealer },
        { resource: 'dealer', rowNumber: 2, value: dealer },
      ]),
      snapshot(),
      NOW,
    );

    expect(preview.valid).toBe(false);
    expect(preview.rows).toEqual([
      expect.objectContaining({ action: 'error', errors: [expect.stringContaining('trùng')] }),
      expect.objectContaining({ action: 'error', errors: [expect.stringContaining('trùng')] }),
    ]);
  });
});
