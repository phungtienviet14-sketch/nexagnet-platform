import { Injectable } from '@nestjs/common';
import type { Dealer, GlossaryEntry, GroupMap, PriceRow, Product } from './domain.js';
import { SEED } from './seed.js';

/** Ket qua map 1 nhom Zalo -> ngu canh dai ly/chi nhanh (dung trong pipeline + UI). */
export interface ResolvedGroup {
  dealer: Dealer | null;
  branch: string | null;
  groupName: string | null;
}

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

  /** Danh sach nhom da map (cho bo chon nhom khi demo + kiem tra cau hinh). */
  groups(): GroupMap[] {
    return this.snapshot.groups;
  }

  findDealerById(id: string): Dealer | null {
    return this.snapshot.dealers.find((d) => d.id === id) ?? null;
  }

  /** Map nhom Zalo -> dai ly + chi nhanh + ten nhom. */
  resolveByChatId(chatId: string): ResolvedGroup {
    const group = this.snapshot.groups.find((g) => g.chatId === chatId);
    if (!group) return { dealer: null, branch: null, groupName: null };
    return {
      dealer: this.findDealerById(group.dealerId),
      branch: group.branch,
      groupName: group.name,
    };
  }
}
