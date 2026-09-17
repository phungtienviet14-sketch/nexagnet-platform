import { describe, expect, it } from 'vitest';
import {
  TOLL_DUPLICATE_CHAIN_MAX_HOPS,
  assertTollDuplicateChainAcyclic,
  tollDuplicateGate,
  tollDuplicateResolutionOf,
  traceTollDuplicateChain,
  type TollDuplicateResolution,
} from './toll-duplicate-guard.js';
import type { TollReviewAction } from './toll.types.js';

/**
 * `#318` — LUAT TRUNG o dang THUAN. Bai qua duong ghi that nam o `toll-duplicate-review.spec.ts`
 * (kho bo nho) va `transport-toll-duplicate.int.spec.ts` (Postgres).
 */

/** Do thi trung gia: `id -> duplicateOfCandidateId`. Ma khong co trong bang = dong khong ton tai. */
const graph =
  (edges: Readonly<Record<string, string | null>>) =>
  async (id: string): Promise<string | null> =>
    edges[id] ?? null;

describe('trang thai trung cua mot dong', () => {
  it('khong nghi, nghi, da ghi — va con tro THANG trang thai khop', () => {
    expect(tollDuplicateResolutionOf({ matchState: 'MATCHED', duplicateOfCandidateId: null })).toBe(
      'NONE',
    );
    expect(
      tollDuplicateResolutionOf({ matchState: 'DUPLICATE_CANDIDATE', duplicateOfCandidateId: null }),
    ).toBe('SUSPECTED');
    expect(
      tollDuplicateResolutionOf({ matchState: 'DUPLICATE_CANDIDATE', duplicateOfCandidateId: 'b' }),
    ).toBe('DECLARED');
    // Mot hang lech (co con tro ma khong mang nhan trung) van la DA GHI TRUNG: bao cao cung doc vay.
    expect(tollDuplicateResolutionOf({ matchState: 'MATCHED', duplicateOfCandidateId: 'b' })).toBe(
      'DECLARED',
    );
    expect(tollDuplicateResolutionOf({ matchState: null, duplicateOfCandidateId: null })).toBe(
      'NONE',
    );
  });
});

describe('cong trung theo viec x trang thai', () => {
  const table: readonly [TollReviewAction, TollDuplicateResolution, string | null][] = [
    ['CONFIRM', 'NONE', null],
    ['CONFIRM', 'SUSPECTED', 'TOLL_REVIEW_DUPLICATE_UNRESOLVED'],
    ['CONFIRM', 'DECLARED', 'TOLL_REVIEW_DUPLICATE_DECLARED'],
    ['RESOLVE_VEHICLE', 'NONE', null],
    ['RESOLVE_VEHICLE', 'SUSPECTED', 'TOLL_REVIEW_DUPLICATE_UNRESOLVED'],
    ['RESOLVE_VEHICLE', 'DECLARED', 'TOLL_REVIEW_DUPLICATE_DECLARED'],
    ['CLEAR_DUPLICATE', 'NONE', 'TOLL_REVIEW_DUPLICATE_NOT_SUSPECTED'],
    ['CLEAR_DUPLICATE', 'SUSPECTED', null],
    ['CLEAR_DUPLICATE', 'DECLARED', null],
    ['FLAG_DUPLICATE', 'NONE', null],
    ['FLAG_DUPLICATE', 'SUSPECTED', null],
    ['FLAG_DUPLICATE', 'DECLARED', null],
    ['REOPEN', 'NONE', null],
    ['REOPEN', 'SUSPECTED', null],
    ['REOPEN', 'DECLARED', null],
  ];

  it.each(table)('%s tren dong %s -> %s', (action, resolution, reason) => {
    expect(tollDuplicateGate(action, resolution)).toBe(reason);
  });
});

describe('lan chuoi dong goc', () => {
  it('tu tro -> SELF, khong can doc gi', async () => {
    const lookups: string[] = [];
    const verdict = await traceTollDuplicateChain({
      sourceId: 'a',
      targetId: 'a',
      duplicateOf: async (id) => {
        lookups.push(id);
        return null;
      },
    });
    expect(verdict).toEqual({ kind: 'SELF' });
    expect(lookups).toEqual([]);
  });

  it('dong dich la dong goc that -> ACYCLIC', async () => {
    expect(
      await traceTollDuplicateChain({ sourceId: 'a', targetId: 'b', duplicateOf: graph({}) }),
    ).toEqual({ kind: 'ACYCLIC', hops: 1 });
  });

  it('chuoi khong vong -> ACYCLIC, dem dung so buoc', async () => {
    expect(
      await traceTollDuplicateChain({
        sourceId: 'a',
        targetId: 'b',
        duplicateOf: graph({ b: 'c', c: 'd' }),
      }),
    ).toEqual({ kind: 'ACYCLIC', hops: 3 });
  });

  it('HAI nut: b da tro ve a -> CYCLE a,b,a', async () => {
    expect(
      await traceTollDuplicateChain({ sourceId: 'a', targetId: 'b', duplicateOf: graph({ b: 'a' }) }),
    ).toEqual({ kind: 'CYCLE', path: ['a', 'b', 'a'] });
  });

  it('BA nut: b -> c -> a -> CYCLE a,b,c,a', async () => {
    expect(
      await traceTollDuplicateChain({
        sourceId: 'a',
        targetId: 'b',
        duplicateOf: graph({ b: 'c', c: 'a' }),
      }),
    ).toEqual({ kind: 'CYCLE', path: ['a', 'b', 'c', 'a'] });
  });

  it('chuoi dich DA CO SAN mot vong khong chua dong nguon -> van CYCLE (fail-closed), va dung lai', async () => {
    const lookups: string[] = [];
    const verdict = await traceTollDuplicateChain({
      sourceId: 'a',
      targetId: 'b',
      duplicateOf: async (id) => {
        lookups.push(id);
        return ({ b: 'c', c: 'b' } as Record<string, string>)[id] ?? null;
      },
    });
    expect(verdict).toEqual({ kind: 'CYCLE', path: ['a', 'b', 'c', 'b'] });
    expect(lookups).toEqual(['b', 'c']);
  });

  it(`chuoi dai hon ${String(TOLL_DUPLICATE_CHAIN_MAX_HOPS)} buoc -> TOO_DEEP; dung ${String(TOLL_DUPLICATE_CHAIN_MAX_HOPS)} buoc thi qua`, async () => {
    const chain = (length: number) => {
      const edges: Record<string, string | null> = {};
      for (let index = 1; index < length; index += 1) {
        edges[`n${String(index)}`] = `n${String(index + 1)}`;
      }
      return graph(edges);
    };
    expect(
      await traceTollDuplicateChain({
        sourceId: 'src',
        targetId: 'n1',
        duplicateOf: chain(TOLL_DUPLICATE_CHAIN_MAX_HOPS),
      }),
    ).toEqual({ kind: 'ACYCLIC', hops: TOLL_DUPLICATE_CHAIN_MAX_HOPS });
    expect(
      await traceTollDuplicateChain({
        sourceId: 'src',
        targetId: 'n1',
        duplicateOf: chain(TOLL_DUPLICATE_CHAIN_MAX_HOPS + 1),
      }),
    ).toEqual({ kind: 'TOO_DEEP', hops: TOLL_DUPLICATE_CHAIN_MAX_HOPS });
  });

  it('chi ACYCLIC moi qua duoc cong ghi — ba ket luan con lai nem loi CO MA', () => {
    expect(() => assertTollDuplicateChainAcyclic({ kind: 'ACYCLIC', hops: 2 })).not.toThrow();
    expect(() => assertTollDuplicateChainAcyclic({ kind: 'SELF' })).toThrow(
      expect.objectContaining({ kind: 'INVALID', reason: 'TOLL_REVIEW_DUPLICATE_SELF' }),
    );
    expect(() => assertTollDuplicateChainAcyclic({ kind: 'CYCLE', path: ['a', 'b', 'a'] })).toThrow(
      expect.objectContaining({ kind: 'CONFLICT', reason: 'TOLL_REVIEW_DUPLICATE_CYCLE' }),
    );
    expect(() => assertTollDuplicateChainAcyclic({ kind: 'TOO_DEEP', hops: 64 })).toThrow(
      expect.objectContaining({ kind: 'CONFLICT', reason: 'TOLL_REVIEW_DUPLICATE_CHAIN_TOO_DEEP' }),
    );
  });
});
