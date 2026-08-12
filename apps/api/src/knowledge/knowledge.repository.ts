import { Injectable } from '@nestjs/common';
import type { KnowledgeSnapshot } from './domain.js';
import { SEED } from './seed.js';
import { selectCurrentSnapshotPrices } from './price-periods.js';

/**
 * Nguon su that (tang 6) — nap TOAN BO snapshot 1 lan (du lieu nho: 19 SP + vai dai ly/nhom,
 * doi it). KnowledgeService cache vao bo nho -> getter dong bo, khong lan async xuong pipeline.
 */
export abstract class KnowledgeRepository {
  abstract loadSnapshot(): Promise<KnowledgeSnapshot>;
}

/** Mac dinh (PERSISTENCE=memory): SEED in-memory — demo/CI khong can DB. */
@Injectable()
export class SeedKnowledgeRepository extends KnowledgeRepository {
  async loadSnapshot(): Promise<KnowledgeSnapshot> {
    return {
      ...SEED,
      prices: selectCurrentSnapshotPrices(SEED),
    };
  }
}
