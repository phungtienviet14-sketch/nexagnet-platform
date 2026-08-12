import { describe, expect, it } from 'vitest';
import { ContentImportService } from './content-import.service.js';
import { InMemoryContentRepository } from './content.repository.js';
import { LocalManifestContentSource } from './local-manifest-content.source.js';

const manifest = {
  source: { kind: 'local_manifest' as const, sourceId: 'inventory-v1', version: '1' },
  assets: [],
  faqs: [
    {
      externalId: 'faq-elni-clean',
      productSku: 'ELNI',
      question: 'Vệ sinh?',
      answer: 'Khăn mềm',
    },
  ],
  advice: [],
  links: [],
};

describe('ContentImportService', () => {
  it('previews and applies an idempotent manifest with provenance', async () => {
    const repo = new InMemoryContentRepository({}, ['ELNI']);
    const service = new ContentImportService(repo, new LocalManifestContentSource());

    expect(await service.preview(manifest)).toMatchObject({ creates: 1, updates: 0, unchanged: 0 });
    const first = await service.apply(manifest, true, 'operator');
    const second = await service.apply(manifest, true, 'operator');

    expect(first.applied).toBe(1);
    expect(second).toMatchObject({ applied: 0, unchanged: 1 });
    const snapshot = await repo.snapshot();
    expect(snapshot.provenance[0]).toMatchObject({ sourceId: 'inventory-v1', version: '1' });
  });

  it('does not overwrite an operator-edited record without an explicit policy', async () => {
    const repo = new InMemoryContentRepository(
      {
        provenance: [],
        assets: [],
        faqs: [
          {
            id: 'manual',
            externalId: 'faq-elni-clean',
            productSku: 'ELNI',
            question: 'Vệ sinh?',
            answer: 'Nội dung Sale đã sửa',
            status: 'active',
            operatorEdited: true,
            provenanceKey: 'local_manifest:inventory-v1',
          },
        ],
        advice: [],
        links: [],
        readiness: [],
      },
      ['ELNI'],
    );
    const service = new ContentImportService(repo, new LocalManifestContentSource());

    const preview = await service.preview({
      ...manifest,
      faqs: [{ ...manifest.faqs[0], answer: 'Nội dung Drive mới' }],
    });
    const result = await service.apply(
      { ...manifest, faqs: [{ ...manifest.faqs[0], answer: 'Nội dung Drive mới' }] },
      true,
      'operator',
    );

    expect(preview.conflicts).toBe(1);
    expect(result.skippedConflicts).toBe(1);
    expect((await repo.snapshot()).faqs[0]?.answer).toBe('Nội dung Sale đã sửa');
  });

  it('reports an unknown product mapping before writing anything', async () => {
    const repo = new InMemoryContentRepository({}, ['ELNI']);
    const service = new ContentImportService(repo, new LocalManifestContentSource());

    await expect(
      service.preview({
        ...manifest,
        faqs: [{ ...manifest.faqs[0], productSku: 'UNKNOWN' }],
      }),
    ).rejects.toThrow(/SKU không tồn tại: UNKNOWN/);
    expect((await repo.snapshot()).faqs).toHaveLength(0);
  });

  it('never lets an import bypass review by declaring itself active', async () => {
    const repo = new InMemoryContentRepository({}, ['ELNI']);
    const service = new ContentImportService(repo, new LocalManifestContentSource());

    await service.apply(
      { ...manifest, faqs: [{ ...manifest.faqs[0], status: 'active' as const }] },
      true,
      'operator',
    );

    expect((await repo.snapshot()).faqs[0]?.status).toBe('draft');
  });
});
