import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  MAX_OUTBOUND_IMAGES,
  type ContentAssetView,
  type ContentLifecycleStatus,
  type ContentSnapshotView,
  type ProductAdviceResult,
} from '@netviet/shared';
import { loadFoundationEnv } from '../config/foundation-env.js';
import { normalize } from '../rules/text.js';
import { rankFaqs, type GlossaryTerm } from './faq-ranking.js';
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

  /**
   * Duyet HANG LOAT qua tung buoc `draft -> reviewed -> approved -> active`.
   *
   * Vi sao can: goi khach nap 102 anh san pham, deu o `draft`, ma `productAdvice` chi doc `active`.
   * Duyet tay la 102 x 3 lan bam — tuc trong thuc te khong ai duyet, va anh khong bao gio den tay
   * khach. Van DI QUA `setStatus` (khong ghi thang) de moi buoc chuyen van bi luat chuyen trang
   * thai kiem, va van la mot hanh dong CO Y cua nguoi van hanh chu khong phai tu dong luc boot.
   */
  async bulkSetStatus(
    kind: ContentEntityKind,
    ids: readonly string[],
    target: ContentLifecycleStatus,
  ): Promise<{ changed: number; skipped: string[] }> {
    const skipped: string[] = [];
    let changed = 0;
    for (const id of ids) {
      try {
        // Moi vong lay lai trang thai hien tai: `setStatus` reload cache sau moi buoc.
        while (collection(this.cache, kind).find((item) => item.id === id)?.status !== target) {
          const current = collection(this.cache, kind).find((item) => item.id === id);
          if (!current) throw new Error(`Không tìm thấy ${kind} ${id}`);
          const next = ALLOWED_TRANSITIONS[current.status].find(
            (candidate) => STATUS_ORDER.indexOf(candidate) > STATUS_ORDER.indexOf(current.status),
          );
          if (!next) throw new Error(`Không có đường lên ${target} từ ${current.status}`);
          await this.setStatus(kind, id, next);
        }
        changed += 1;
      } catch (error: unknown) {
        // Mot ban ghi hong khong duoc lam do ca me: ghi lai roi di tiep.
        skipped.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this.logger.log(
      `Duyệt hàng loạt ${kind} → ${target}: ${changed} đổi, ${skipped.length} bỏ qua.`,
    );
    return { changed, skipped };
  }

  productAdvice(
    text: string,
    products: ProductRef[],
    glossary: readonly GlossaryTerm[] = [],
  ): ProductAdviceResult {
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

    const selectedFaqs = rankFaqs(faqs, norm, glossary);
    // Truoc 15/08/2026 cho nay la `selectedFaqs.length ? selectedFaqs : faqs` — khong khop tu nao
    // thi do TOAN BO FAQ cua san pham (BB-GREY co 21 FAQ) vao mot tin. Khong khop nghia la CHUA
    // hieu khach hoi gi: co `advice` chung thi dung advice, khong co thi chuyen Sale.
    if (!selectedFaqs.length && !advice.length) {
      // Do ti le truot THAT cua retrieval: khong co dong log nay thi khong biet Pha 5 an bao
      // nhieu. Ghi cau da chuan hoa (khong phai tin goc) + so FAQ ung vien de lan lai duoc.
      this.logger.warn(
        `FAQ truot: "${norm}" — ${faqs.length} FAQ ung vien cua ${productSkus.join(',')}, khong cau nao khop.`,
      );
      return safeHandoff(productSkus, ['matching_faq']);
    }
    const body = [...selectedFaqs.map((faq) => faq.answer), ...advice.map((item) => item.body)];
    const forThisProduct = (asset: ContentAssetView): boolean =>
      active(asset.status) && asset.productSkus.some((sku) => productSkus.includes(sku));
    const images = this.cache.assets
      .filter((asset) => asset.kind === 'image' && forThisProduct(asset))
      // Locator tuong doi ma chua dat PUBLIC_BASE_URL -> BO anh do. Gui mot URL Zalo khong tai
      // duoc thi tin di ma khong co anh, con te hon la khong hua co anh.
      .flatMap((asset) => {
        const url = absoluteLocator(asset.locator);
        return url ? [{ url, ...(asset.title ? { alt: asset.title } : {}) }] : [];
      })
      .slice(0, MAX_OUTBOUND_IMAGES);
    // Asset kind='video' truoc 15/08/2026 bi BO QUA hoan toan: `productAdvice` chi doc kind='image'.
    // Zalo khong co API gui video (sendVideo tra 404 — xac minh 11/08/2026) nen video di bang LINK,
    // gop chung vao `links` de moi kenh render cung mot kieu.
    const videoAssetLinks = this.cache.assets
      .filter((asset) => asset.kind === 'video' && forThisProduct(asset))
      .flatMap((asset) => {
        const url = absoluteLocator(asset.locator);
        return url ? [{ kind: 'video' as const, label: asset.title ?? 'Video sản phẩm', url }] : [];
      });
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
      // Giu rieng tung manh de `AdviceComposer` soan lai; `text` o tren la ban fallback khi
      // khong co ban soan (hoac ban soan bi tu choi vi lo noi con so tien).
      snippets: [
        ...selectedFaqs.map((faq) => ({ question: faq.question, body: faq.answer })),
        ...advice.map((item) => ({ body: item.body })),
      ],
      productNames: matched.map((product) => product.name),
      ...(images.length ? { images } : {}),
      ...(links.length ? { links } : {}),
    };
  }
}

/**
 * Doi locator cua goi khach thanh URL TUYET DOI de Zalo di tai duoc.
 *
 * Goi khach luu duong dan tuong doi (`/media/catalog/...`) de mot goi chay duoc tren ca local,
 * demo va pilot. Ten mien duoc ghep vao O DAY — luc gui — chu khong luc dong goi.
 * Chua dat `PUBLIC_BASE_URL` thi tra `null`: ben goi bo anh do thay vi gui mot URL gay.
 */
function absoluteLocator(locator: string): string | null {
  if (!locator.startsWith('/')) return locator;
  const base = loadFoundationEnv().PUBLIC_BASE_URL;
  return base ? `${base.replace(/\/+$/, '')}${locator}` : null;
}

/** Bang voi tran `links` trong `outboundContentSchema`. */
const MAX_OUTBOUND_LINKS = 20;

/** Link video co the den tu ca `links` da bien tap lan asset kind='video' — khong gui trung URL. */
function dedupeByUrl<T extends { url: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.url) ? false : (seen.add(item.url), true)));
}

/** Thu tu tien cua vong doi — de `bulkSetStatus` biet buoc nao la "di len". */
const STATUS_ORDER: ContentLifecycleStatus[] = ['draft', 'reviewed', 'approved', 'active'];

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
