import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  MAX_OUTBOUND_IMAGES,
  type ContentAssetView,
  type ContentLifecycleStatus,
  type ContentSnapshotView,
  type OutboundContent,
  type ProductAdviceResult,
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

    const selectedFaqs = rankFaqs(faqs, norm).slice(0, MAX_FAQ_ANSWERS);
    // Truoc 15/08/2026 cho nay la `selectedFaqs.length ? selectedFaqs : faqs` — khong khop tu nao
    // thi do TOAN BO FAQ cua san pham (BB-GREY co 21 FAQ) vao mot tin. Khong khop nghia la CHUA
    // hieu khach hoi gi: co `advice` chung thi dung advice, khong co thi chuyen Sale.
    if (!selectedFaqs.length && !advice.length) {
      return safeHandoff(productSkus, ['matching_faq']);
    }
    const body = [
      ...selectedFaqs.map((faq) => faq.answer),
      ...advice.map((item) => item.body),
    ];
    const forThisProduct = (asset: ContentAssetView): boolean =>
      active(asset.status) && asset.productSkus.some((sku) => productSkus.includes(sku));
    const images = this.cache.assets
      .filter((asset) => asset.kind === 'image' && forThisProduct(asset))
      .slice(0, MAX_OUTBOUND_IMAGES)
      .map((asset) => ({ url: asset.locator, ...(asset.title ? { alt: asset.title } : {}) }));
    // Asset kind='video' truoc 15/08/2026 bi BO QUA hoan toan: `productAdvice` chi doc kind='image'.
    // Zalo khong co API gui video (sendVideo tra 404 — xac minh 11/08/2026) nen video di bang LINK,
    // gop chung vao `links` de moi kenh render cung mot kieu.
    const videoAssetLinks = this.cache.assets
      .filter((asset) => asset.kind === 'video' && forThisProduct(asset))
      .map((asset) => ({
        kind: 'video' as const,
        label: asset.title ?? 'Video sản phẩm',
        url: asset.locator,
      }));
    const curatedLinks = this.cache.links
      .filter(
        (link) =>
          active(link.status) && (!link.productSku || productSkus.includes(link.productSku)),
      )
      .map((link) => ({ kind: link.kind, label: link.title, url: link.url }));
    const links = dedupeByUrl([...curatedLinks, ...videoAssetLinks]).slice(0, MAX_OUTBOUND_LINKS);
    return {
      ready: true,
      productSkus,
      missing: [],
      text: body.join('\n'),
      ...(images.length ? { images } : {}),
      ...(links.length ? { links } : {}),
    };
  }
}

/** Tra ve nhieu hon vai cau la thanh mot buc tuong chu — khach Zalo khong doc. */
const MAX_FAQ_ANSWERS = 3;
/** Bang voi tran `links` trong `outboundContentSchema`. */
const MAX_OUTBOUND_LINKS = 20;

/**
 * Xep FAQ theo so tu khoa cua CAU HOI xuat hien trong tin khach, cao xuong thap; bo cac FAQ khong
 * khop tu nao. Truoc day chi loc `some(...)` roi giu nguyen thu tu DB, nen mot FAQ khop 1 tu vu vo
 * ("nha") duoc xep ngang mot FAQ khop 4 tu.
 */
function rankFaqs<T extends { question: string }>(faqs: T[], normalizedText: string): T[] {
  return faqs
    .map((faq) => {
      const words = new Set(
        normalize(faq.question)
          .split(/\s+/)
          .filter((word) => word.length >= 3),
      );
      const hits = [...words].filter((word) => normalizedText.includes(word)).length;
      return { faq, hits };
    })
    .filter((scored) => scored.hits > 0)
    .sort((left, right) => right.hits - left.hits)
    .map((scored) => scored.faq);
}

/** Link video co the den tu ca `links` da bien tap lan asset kind='video' — khong gui trung URL. */
function dedupeByUrl<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.url) ? false : (seen.add(item.url), true)));
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
