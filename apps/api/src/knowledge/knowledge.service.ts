import { Injectable } from '@nestjs/common';
import type { Dealer, GlossaryEntry, PriceRow, Product } from './domain.js';
import { SEED } from './seed.js';

/**
 * Nguon su that (tang 6) — demo dung in-memory tu SEED.
 * Boc sau service de sau thay bang Prisma/Postgres o GD1 ma khong dung pipeline.
 */
@Injectable()
export class KnowledgeService {
  private readonly snapshot = SEED;

  products(): Product[] {
    return this.snapshot.products;
  }

  prices(): PriceRow[] {
    return this.snapshot.prices;
  }

  glossary(): GlossaryEntry[] {
    return this.snapshot.glossary;
  }

  dealers(): Dealer[] {
    return this.snapshot.dealers;
  }

  findDealerById(id: string): Dealer | null {
    return this.snapshot.dealers.find((d) => d.id === id) ?? null;
  }

  /** Map nhom Zalo -> dai ly + chi nhanh. */
  resolveByChatId(chatId: string): { dealer: Dealer | null; branch: string | null } {
    const group = this.snapshot.groups.find((g) => g.chatId === chatId);
    if (!group) return { dealer: null, branch: null };
    return { dealer: this.findDealerById(group.dealerId), branch: group.branch };
  }
}
