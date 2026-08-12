import type { ContentImportManifest } from '@netviet/shared';
import { loadTenantContentManifest } from '@netviet/tenant';
import { describe, expect, it } from 'vitest';
import { ContentImportService } from './content-import.service.js';
import { InMemoryContentRepository } from './content.repository.js';
import { ContentService } from './content.service.js';
import { LocalManifestContentSource } from './local-manifest-content.source.js';
import { TenantPackContentBootstrap } from './tenant-pack-content.bootstrap.js';

const MANIFEST: ContentImportManifest = {
  source: { kind: 'local_manifest', sourceId: 'faq-mau' },
  assets: [],
  faqs: [
    {
      externalId: 'faq:mau:001',
      status: 'draft',
      productSku: 'SP-MAU',
      question: 'Bao hanh bao lau?',
      answer: '2 nam.',
    },
  ],
  advice: [],
  links: [],
};

function build(manifest: ContentImportManifest | null, knownSkus = ['SP-MAU']) {
  const repo = new InMemoryContentRepository({}, knownSkus);
  const imports = new ContentImportService(repo, new LocalManifestContentSource());
  const content = new ContentService(repo);
  return { repo, content, boot: new TenantPackContentBootstrap(imports, content, manifest) };
}

describe('TenantPackContentBootstrap', () => {
  it('nap FAQ tu goi khach vao kho noi dung', async () => {
    const { boot, content } = build(MANIFEST);
    await boot.onModuleInit();
    expect(content.snapshot().faqs).toHaveLength(1);
  });

  it('noi dung nap vao o trang thai draft — KHONG tu dung de tra loi khach', async () => {
    const { boot, content } = build(MANIFEST);
    await boot.onModuleInit();
    expect(content.snapshot().faqs[0]?.status).toBe('draft');

    const advice = content.productAdvice('SP-MAU bao hanh bao lau', [
      { sku: 'SP-MAU', name: 'San pham mau' },
    ]);
    expect(advice.ready).toBe(false);
  });

  it('chay lai (restart) KHONG nhan ban du lieu', async () => {
    const { boot, content } = build(MANIFEST);
    await boot.onModuleInit();
    await boot.onModuleInit();
    expect(content.snapshot().faqs).toHaveLength(1);
  });

  it('KHONG ha nguoc trang thai ma nguoi van hanh da duyet', async () => {
    const { boot, content } = build(MANIFEST);
    await boot.onModuleInit();
    const id = content.snapshot().faqs[0]!.id;
    for (const status of ['reviewed', 'approved', 'active'] as const) {
      await content.setStatus('faq', id, status);
    }

    await boot.onModuleInit();

    expect(content.snapshot().faqs[0]?.status).toBe('active');
  });

  it('goi khach khong co manifest -> khong lam gi, khong nem', async () => {
    const { boot, content } = build(null);
    await expect(boot.onModuleInit()).resolves.toBeUndefined();
    expect(content.snapshot().faqs).toEqual([]);
  });

  it('manifest tro toi SKU khong ton tai -> log loi, KHONG lam sap boot', async () => {
    const { boot, content } = build(MANIFEST, ['SKU-KHAC']);
    await expect(boot.onModuleInit()).resolves.toBeUndefined();
    expect(content.snapshot().faqs).toEqual([]);
  });
});

/**
 * Kiem GOI KHACH THAT dang duoc chon (TENANT/TENANT_DIR). Muc dich: bat loi du lieu — FAQ tro toi
 * SKU khong co trong danh muc thi import se bi tu choi luc chay, va o day thi bi tu choi luc CI.
 */
describe('goi khach dang dung — content manifest', () => {
  const manifest = loadTenantContentManifest();

  it('moi productSku trong manifest deu ton tai trong danh muc san pham', async () => {
    if (!manifest) return;
    const { SEED } = await import('../knowledge/seed.js');
    const known = new Set(SEED.products.map((product) => product.sku));
    const referenced = new Set(
      [
        ...manifest.faqs.map((faq) => faq.productSku),
        ...manifest.advice.map((item) => item.productSku),
        ...manifest.links.map((link) => link.productSku),
        ...manifest.assets.flatMap((asset) => asset.productSkus),
      ].filter((sku): sku is string => Boolean(sku)),
    );
    expect([...referenced].filter((sku) => !known.has(sku))).toEqual([]);
  });

  it('externalId khong trung nhau (trung = ban ghi sau de len ban ghi truoc)', () => {
    if (!manifest) return;
    const ids = [
      ...manifest.faqs.map((item) => `faq:${item.externalId}`),
      ...manifest.advice.map((item) => `advice:${item.externalId}`),
      ...manifest.links.map((item) => `link:${item.externalId}`),
      ...manifest.assets.map((item) => `asset:${item.externalId}`),
    ];
    expect(ids.length).toBe(new Set(ids).size);
  });
});
