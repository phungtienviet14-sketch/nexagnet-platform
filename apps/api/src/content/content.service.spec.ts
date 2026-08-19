import { describe, expect, it } from 'vitest';
import { InMemoryContentRepository } from './content.repository.js';
import { ContentService } from './content.service.js';

describe('ContentService', () => {
  it('uses active approved content only and returns image/link without embedding binary', async () => {
    const repo = new InMemoryContentRepository({
      provenance: [],
      assets: [
        {
          id: 'asset-active',
          externalId: 'front',
          kind: 'image',
          title: 'Ảnh mặt trước',
          locator: 'https://cdn.example.test/elni.webp',
          mimeType: 'image/webp',
          source: 'object_storage',
          status: 'active',
          productSkus: ['ELNI'],
          operatorEdited: false,
        },
        {
          id: 'asset-draft',
          externalId: 'draft',
          kind: 'image',
          locator: 'https://cdn.example.test/draft.webp',
          source: 'object_storage',
          status: 'draft',
          productSkus: ['ELNI'],
          operatorEdited: false,
        },
      ],
      faqs: [
        {
          id: 'faq-active',
          externalId: 'cleaning',
          productSku: 'ELNI',
          question: 'Vệ sinh thế nào?',
          answer: 'Lau bằng khăn mềm.',
          status: 'active',
          operatorEdited: false,
        },
        {
          id: 'faq-draft',
          externalId: 'claim',
          productSku: 'ELNI',
          question: 'Có tốt nhất không?',
          answer: 'Tốt nhất thị trường.',
          status: 'draft',
          operatorEdited: false,
        },
      ],
      advice: [],
      links: [
        {
          id: 'video-active',
          externalId: 'intro-video',
          kind: 'video',
          title: 'Video giới thiệu',
          url: 'https://video.example.test/elni',
          productSku: 'ELNI',
          status: 'active',
          operatorEdited: false,
        },
      ],
      readiness: [],
    });
    const service = new ContentService(repo);
    await service.reload();

    const advice = service.productAdvice('vệ sinh ELNI', [{ sku: 'ELNI', name: 'ELNI' }]);

    expect(advice.ready).toBe(true);
    expect(advice.text).toContain('Lau bằng khăn mềm');
    expect(advice.text).not.toContain('Tốt nhất thị trường');
    expect(advice.images?.[0]?.url).toBe('https://cdn.example.test/elni.webp');
    expect(advice.links).toEqual([
      expect.objectContaining({ kind: 'video', url: 'https://video.example.test/elni' }),
    ]);
  });

  it('fails safely when no approved content exists', async () => {
    const service = new ContentService(new InMemoryContentRepository({}, ['ELNI']));
    await service.reload();

    const advice = service.productAdvice('ELNI có tốt không?', [{ sku: 'ELNI', name: 'ELNI' }]);

    expect(advice.ready).toBe(false);
    expect(advice.text).toMatch(/Sale.*xác minh/i);
    expect(advice.missing).toContain('approved_faq_or_advice');
  });

  it('allows approved text advice when optional image and catalog links are absent', async () => {
    const repo = new InMemoryContentRepository({
      provenance: [],
      assets: [],
      faqs: [
        {
          id: 'faq-princess',
          externalId: 'faq-princess',
          productSku: 'PRINCESS-EASYFILL',
          question: 'Giới thiệu máy ép chậm Princess',
          answer: 'Nội dung giới thiệu đã được duyệt.',
          status: 'draft',
          operatorEdited: false,
        },
      ],
      advice: [],
      links: [],
      readiness: [],
    });
    const service = new ContentService(repo);
    await service.reload();

    const products = [
      {
        sku: 'PRINCESS-EASYFILL',
        name: 'Máy ép chậm Princess Easy Fill',
        aliases: ['máy ép chậm Princess'],
      },
    ];
    const draft = service.productAdvice('giới thiệu sản phẩm Máy ép chậm Princess', products);
    expect(draft.ready).toBe(false);
    expect(draft.missing).toEqual(['approved_faq_or_advice']);

    for (const status of ['reviewed', 'approved', 'active'] as const) {
      await service.setStatus('faq', 'faq-princess', status);
    }
    const advice = service.productAdvice('giới thiệu sản phẩm Máy ép chậm Princess', products);

    expect(advice.ready).toBe(true);
    expect(advice.missing).toEqual([]);
    expect(advice.text).toContain('Nội dung giới thiệu đã được duyệt');
    expect(advice.images).toBeUndefined();
    expect(advice.links).toBeUndefined();
  });

  it('enforces review and approval before activation, while allowing unapprove', async () => {
    const repo = new InMemoryContentRepository({
      provenance: [],
      assets: [],
      faqs: [
        {
          id: 'faq-1',
          externalId: 'faq-1',
          productSku: 'ELNI',
          question: 'Câu hỏi',
          answer: 'Câu trả lời',
          status: 'draft',
          operatorEdited: false,
        },
      ],
      advice: [],
      links: [],
      readiness: [],
    });
    const service = new ContentService(repo);
    await service.reload();

    await expect(service.setStatus('faq', 'faq-1', 'active')).rejects.toThrow(/không hợp lệ/i);
    await service.setStatus('faq', 'faq-1', 'reviewed');
    await service.setStatus('faq', 'faq-1', 'approved');
    await service.setStatus('faq', 'faq-1', 'active');
    await service.setStatus('faq', 'faq-1', 'reviewed');

    expect(service.snapshot().faqs[0]?.status).toBe('reviewed');
    expect(service.snapshot().readiness[0]).toMatchObject({
      productSku: 'ELNI',
      ready: false,
      missing: ['approved_faq_or_advice'],
    });
  });

  it('tra loi duoc tin viet tat nho glossary tenant thay vi chuyen Sale (Pha 5)', async () => {
    const repo = new InMemoryContentRepository({
      provenance: [],
      assets: [],
      faqs: [
        {
          id: 'faq-gia',
          externalId: 'faq-gia',
          productSku: 'ELNI',
          question: 'Công suất bao nhiêu watt?',
          answer: 'Công suất 45W ở chế độ tiêu chuẩn.',
          status: 'active',
          operatorEdited: false,
        },
      ],
      advice: [],
      links: [],
      readiness: [],
    });
    const service = new ContentService(repo);
    await service.reload();
    const products = [{ sku: 'ELNI', name: 'ELNI' }];
    const glossary = [
      { term: 'cs', meaning: 'công suất' },
      { term: 'bn', meaning: 'bao nhiêu' },
      { term: 'w', meaning: 'watt' },
    ];

    // Khong co glossary: khong tu nao cua cau hoi FAQ khop -> chuyen Sale (hien trang truoc Pha 5).
    expect(service.productAdvice('ELNI cs bn w', products).missing).toEqual(['matching_faq']);

    const advice = service.productAdvice('ELNI cs bn w', products, glossary);

    expect(advice.ready).toBe(true);
    expect(advice.text).toContain('45W');
  });
});
