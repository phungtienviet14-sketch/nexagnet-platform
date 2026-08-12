import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMasterDataImport } from './master-data-import.js';

describe('parseMasterDataImport', () => {
  it('parses JSON dealer, private-deal, and group rows without source edits', async () => {
    const parsed = await parseMasterDataImport({
      format: 'json',
      encoding: 'utf8',
      content: JSON.stringify({
        dealers: [
          {
            id: 'dealer-hn',
            name: 'Đại lý Hà Nội',
            aliases: ['DL HN'],
            tier: 'dai_ly',
            defaultPolicy: 'cong_no_30',
            status: 'active',
            metadata: { province: 'HN' },
          },
        ],
        deals: [
          {
            dealerId: 'dealer-hn',
            sku: 'FELIX',
            price: 900_000,
            effectiveFrom: '2026-08-01T00:00:00.000Z',
            effectiveTo: '2026-08-31T23:59:59.999Z',
            enabled: true,
          },
        ],
        groups: [
          {
            chatId: 'zca-group-1',
            name: 'Nhóm Hà Nội',
            dealerId: 'dealer-hn',
            branch: 'HN',
            enabled: true,
          },
        ],
      }),
    });

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resource: 'dealer', rowNumber: 1, value: expect.objectContaining({ id: 'dealer-hn' }) }),
        expect.objectContaining({ resource: 'deal', rowNumber: 1, value: expect.objectContaining({ sku: 'FELIX' }) }),
        expect.objectContaining({ resource: 'group', rowNumber: 1, value: expect.objectContaining({ chatId: 'zca-group-1' }) }),
      ]),
    );
  });

  it('parses a resource-tagged CSV and reports invalid rows independently', async () => {
    const parsed = await parseMasterDataImport({
      format: 'csv',
      encoding: 'utf8',
      content: [
        'resource,id,name,tier,defaultPolicy,aliases,status',
        'dealer,dealer-1,Đại lý 1,dai_ly,cong_no_30,"dl1, one",active',
        'dealer,dealer-2,Đại lý 2,invalid,cong_no_30,,active',
      ].join('\n'),
    });

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      resource: 'dealer',
      rowNumber: 2,
      value: { id: 'dealer-1', aliases: ['dl1', 'one'] },
    });
    expect(parsed.errors).toEqual([
      expect.objectContaining({ rowNumber: 3, resource: 'dealer', message: expect.stringContaining('tier') }),
    ]);
  });

  it('round-trips the existing A4 workbook and keeps missing chat IDs for safe preview resolution', async () => {
    const workbook = await readFile(
      resolve(process.cwd(), '../../docs/khach-hang/ultty/trao-doi/a4-dai-ly-map-nhom-ultty.xlsx'),
    );
    const parsed = await parseMasterDataImport({
      format: 'xlsx',
      encoding: 'base64',
      content: workbook.toString('base64'),
      filename: 'a4.xlsx',
    });

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows.filter((row) => row.resource === 'dealer')).toHaveLength(3);
    expect(parsed.rows.filter((row) => row.resource === 'group')).toHaveLength(2);
    expect(parsed.rows).toContainEqual(
      expect.objectContaining({
        resource: 'dealer',
        sheet: '1. Đại lý & CTV',
        value: expect.objectContaining({ name: 'Meta HN', tier: 'dai_ly' }),
      }),
    );
  });

  it('rejects oversized and malformed payloads before parsing', async () => {
    await expect(
      parseMasterDataImport({ format: 'json', encoding: 'utf8', content: '{not-json}' }),
    ).rejects.toThrow(/JSON/i);
    await expect(
      parseMasterDataImport({ format: 'json', encoding: 'utf8', content: 'x'.repeat(5_000_001) }),
    ).rejects.toThrow(/5 MB/i);
  });
});
