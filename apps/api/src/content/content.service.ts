import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type {
  ContentLifecycleStatus,
  ContentSnapshotView,
  ProductAdviceResult,
} from '@netviet/shared';
import { normalize } from '../rules/text.js';
import { ContentRepository, type ContentEntityKind } from './content.repository.js';

type ProductRef = { sku: string; name: string; aliases?: string[] };

@Injectable()
export class ContentService implements OnModuleInit {
  private readonly logger = new Logger('ContentService');
  private cache: ContentSnapshotView = {
    provenance: [],
    assets: [],
    faqs: [],
    advice: [],
    links: [],
    readiness: [],
  };

  constructor(private readonly repo: ContentRepository) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<ContentSnapshotView> {
    const snapshot = await this.repo.snapshot();
    const readiness = buildReadiness(await this.repo.productSkus(), snapshot);
    await Promise.all(readiness.map((item) => this.repo.setReadiness(item)));
    this.cache = { ...snapshot, readiness };
    this.logger.log(
      `Nạp content: ${this.cache.faqs.length} FAQ, ${this.cache.assets.length} media, ${this.cache.links.length} link.`,
    );
    return structuredClone(this.cache);
  }

  snapshot(): ContentSnapshotView {
    return structuredClone(this.cache);
  }

  async setStatus(
    kind: ContentEntityKind,
    id: string,
    status: ContentLifecycleStatus,
  ): Promise<ContentSnapshotView> {
    const current = collection(this.cache, kind).find((item) => item.id === id);
    if (!current) throw new Error(`Không tìm thấy ${kind} ${id}`);
    if (current.status === status) return this.snapshot();
    if (!ALLOWED_TRANSITIONS[current.status].includes(status)) {
      throw new Error(`Chuyển trạng thái không hợp lệ: ${current.status} → ${status}`);
    }
    const updated = await this.repo.setStatus(kind, id, status, true);
    if (!updated) throw new Error(`Không tìm thấy ${kind} ${id}`);
    return this.reload();
  }

  productAdvice(text: string, products: ProductRef[]): ProductAdviceResult {
    const norm = normalize(text);
    const matched = products.filter((product) =>
      [product.sku, product.name, ...(product.aliases ?? [])]
        .map(normalize)
        .filter((candidate) => candidate.length >= 3)
        .some((candidate) => norm.includes(candidate)),
    );
    const productSkus = matched.map((product) => product.sku);
    if (!productSkus.length) {
      return safeHandoff([], ['identified_product']);
    }

    const readinessMissing = productSkus.flatMap(
      (sku) =>
        this.cache.readiness.find((item) => item.productSku === sku)?.missing ?? [
          'content_readiness',
        ],
    );
    if (readinessMissing.length) {
      return safeHandoff(productSkus, Array.from(new Set(readinessMissing)));
    }

    const active = (status: ContentLifecycleStatus): boolean => status === 'active';
    const faqs = this.cache.faqs.filter(
      (faq) => active(faq.status) && (!faq.productSku || productSkus.includes(faq.productSku)),
    );
    const advice = this.cache.advice.filter(
      (item) => active(item.status) && (!item.productSku || productSkus.includes(item.productSku)),
    );
    if (!faqs.length && !advice.length)
      return safeHandoff(productSkus, ['approved_product_content']);

    const selectedFaqs = faqs.filter((faq) => {
      const words = normalize(faq.question)
        .split(/\s+/)
        .filter((word) => word.length >= 3);
      return words.length === 0 || words.some((word) => norm.includes(word));
    });
    const body = [
      ...(selectedFaqs.length ? selectedFaqs : faqs).map((faq) => faq.answer),
      ...advice.map((item) => item.body),
    ];
    const image = this.cache.assets.find(
      (asset) =>
        asset.kind === 'image' &&
        active(asset.status) &&
        asset.productSkus.some((sku) => productSkus.includes(sku)),
    );
    const links = this.cache.links
      .filter(
        (link) =>
          active(link.status) && (!link.productSku || productSkus.includes(link.productSku)),
      )
      .map((link) => ({ kind: link.kind, label: link.title, url: link.url }));
    return {
      ready: true,
      productSkus,
      missing: [],
      text: body.join('\n'),
      ...(image ? { image: { url: image.locator, alt: image.title } } : {}),
      ...(links.length ? { links } : {}),
    };
  }
}

const ALLOWED_TRANSITIONS: Record<ContentLifecycleStatus, ContentLifecycleStatus[]> = {
  draft: ['reviewed'],
  reviewed: ['draft', 'approved'],
  approved: ['reviewed', 'active'],
  active: ['approved', 'reviewed'],
};

function collection(
  snapshot: ContentSnapshotView,
  kind: ContentEntityKind,
): { id: string; status: ContentLifecycleStatus }[] {
  if (kind === 'asset') return snapshot.assets;
  if (kind === 'faq') return snapshot.faqs;
  if (kind === 'advice') return snapshot.advice;
  return snapshot.links;
}

function buildReadiness(productSkus: string[], snapshot: ContentSnapshotView) {
  return productSkus.map((productSku) => {
    const missing: string[] = [];
    const active = (status: ContentLifecycleStatus) => status === 'active';
    const hasText =
      snapshot.faqs.some((item) => item.productSku === productSku && active(item.status)) ||
      snapshot.advice.some((item) => item.productSku === productSku && active(item.status));
    if (!hasText) missing.push('approved_faq_or_advice');
    if (
      !snapshot.assets.some(
        (item) =>
          item.kind === 'image' && item.productSkus.includes(productSku) && active(item.status),
      )
    ) {
      missing.push('active_image');
    }
    if (!snapshot.links.some((item) => item.productSku === productSku && active(item.status))) {
      missing.push('active_catalog_or_video_link');
    }
    return { productSku, ready: missing.length === 0, missing };
  });
}

function safeHandoff(productSkus: string[], missing: string[]): ProductAdviceResult {
  return {
    ready: false,
    productSkus,
    missing,
    text: 'Thông tin đã duyệt chưa đủ để trả lời chính xác. Sale sẽ xác minh và phản hồi anh/chị sớm ạ.',
  };
}
