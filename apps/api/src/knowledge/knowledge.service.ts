import { Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';
import type {
  GlossaryView,
  GroupMapView,
  KnowledgeProductView,
  KnowledgeSummary,
  SenderType,
} from '@ultty/shared';
import type {
  Dealer,
  DealerPriceOverride,
  GlossaryEntry,
  GroupMap,
  KnowledgeSnapshot,
  PriceRow,
  Product,
} from './domain.js';
import { KnowledgeRepository } from './knowledge.repository.js';
import { SEED } from './seed.js';

/** Ket qua map 1 nhom Zalo -> ngu canh dai ly/chi nhanh (dung trong pipeline + UI). */
export interface ResolvedGroup {
  dealer: Dealer | null;
  branch: string | null;
  groupName: string | null;
  /** Loai nguoi gui suy tu cap dai ly (RouterAgent). */
  senderType: SenderType;
}

/**
 * Nguon su that (tang 6) — demo dung in-memory tu SEED.
 * Boc sau service de sau thay bang Prisma/Postgres o GD1 ma khong dung pipeline.
 */
@Injectable()
export class KnowledgeService implements OnModuleInit {
  private readonly logger = new Logger('KnowledgeService');
  private snapshot: KnowledgeSnapshot = SEED;

  // @Optional: test dung `new KnowledgeService()` (khong DI) van chay voi SEED nhu cu.
  constructor(@Optional() private readonly repo?: KnowledgeRepository) {}

  /** Nap nguon su that vao bo nho luc boot: Prisma (PERSISTENCE=prisma) hoac giu SEED (mac dinh). */
  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  /** Nap lai snapshot tu repo (goi sau khi CRUD nguon su that qua UI/MCP). */
  async reload(): Promise<void> {
    if (!this.repo) return;
    this.snapshot = await this.repo.loadSnapshot();
    this.logger.log(
      `Nap nguon su that: ${this.snapshot.products.length} SP, ${this.snapshot.dealers.length} dai ly, ${this.snapshot.groups.length} nhom da map.`,
    );
  }

  products(): Product[] {
    return this.snapshot.products;
  }

  /** DTO danh muc + gia si cho cot "Nguon su that". Canh bao neu SKU thieu dong gia. */
  productViews(): KnowledgeProductView[] {
    const priceBySku = new Map(this.snapshot.prices.map((p) => [p.sku, p]));
    return this.snapshot.products.map((p) => {
      const price = priceBySku.get(p.sku);
      if (!price) {
        this.logger.warn(`SKU ${p.sku} thiếu dòng giá — hiển thị 0đ (kiểm tra seed/bảng giá).`);
      }
      return {
        sku: p.sku,
        name: p.name,
        unit: p.unit,
        wholesale: price?.wholesale ?? 0,
        retailPrice: price?.retailPrice,
        description: p.description,
      };
    });
  }

  /** DTO glossary viet tat. */
  glossaryViews(): GlossaryView[] {
    return this.snapshot.glossary.map((g) => ({ term: g.term, meaning: g.meaning }));
  }

  /** DTO map nhom -> dai ly (kem cap + chinh sach). Dung chung cho console + /demo/groups. */
  groupViews(): GroupMapView[] {
    return this.snapshot.groups.map((g) => {
      const dealer = this.findDealerById(g.dealerId);
      return {
        chatId: g.chatId,
        groupName: g.name,
        dealerName: dealer?.name ?? null,
        dealerTier: dealer?.tier ?? null,
        policy: dealer?.defaultPolicy ?? null,
        branch: g.branch,
      };
    });
  }

  /** Tong hop kho tri thuc cho cot "Nguon su that" (1 lan goi). */
  knowledgeSummary(): KnowledgeSummary {
    const products = this.productViews();
    const glossary = this.glossaryViews();
    const groups = this.groupViews();
    return {
      products,
      glossary,
      groups,
      productCount: products.length,
      glossaryCount: glossary.length,
      groupCount: groups.length,
    };
  }

  prices(): PriceRow[] {
    return this.snapshot.prices;
  }

  /** Deal rieng theo dealer+sku (override wholesale). Rong khi chua co so lieu khach. */
  priceOverrides(): DealerPriceOverride[] {
    return this.snapshot.priceOverrides;
  }

  glossary(): GlossaryEntry[] {
    return this.snapshot.glossary;
  }

  dealers(): Dealer[] {
    return this.snapshot.dealers;
  }

  /** Danh sach nhom da map (cho bo chon nhom khi demo + kiem tra cau hinh). */
  groups(): GroupMap[] {
    return this.snapshot.groups;
  }

  findDealerById(id: string): Dealer | null {
    return this.snapshot.dealers.find((d) => d.id === id) ?? null;
  }

  /** Map nhom Zalo -> dai ly + chi nhanh + ten nhom + loai nguoi gui. */
  resolveByChatId(chatId: string): ResolvedGroup {
    const group = this.snapshot.groups.find((g) => g.chatId === chatId);
    if (!group) return { dealer: null, branch: null, groupName: null, senderType: 'unknown' };
    const dealer = this.findDealerById(group.dealerId);
    return {
      dealer,
      branch: group.branch,
      groupName: group.name,
      senderType: dealer ? (dealer.tier === 'ctv' ? 'ctv' : 'dai_ly') : 'unknown',
    };
  }
}
