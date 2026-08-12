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
    expect(advice.image?.url).toBe('https://cdn.example.test/elni.webp');
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
      missing: expect.arrayContaining(['active_image', 'active_catalog_or_video_link']),
    });
  });
});
