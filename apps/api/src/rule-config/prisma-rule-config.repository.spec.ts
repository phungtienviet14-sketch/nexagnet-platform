import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../config/prisma.service.js';
import { createDefaultRuleConfigPayload } from './rule-config.defaults.js';
import { PrismaRuleConfigRepository } from './prisma-rule-config.repository.js';

describe('PrismaRuleConfigRepository', () => {
  it('activate archive ban active cu va kich hoat preview trong mot transaction', async () => {
    const preview = {
      id: 'r2',
      version: 2,
      status: 'preview',
      payload: createDefaultRuleConfigPayload(),
      createdBy: 'operator',
      activatedBy: null,
      createdAt: new Date('2026-08-03T00:00:00.000Z'),
      activatedAt: null,
    };
    const tx = {
      ruleConfigVersion: {
        findUnique: vi.fn(async () => preview),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async () => ({
          ...preview,
          status: 'active',
          activatedBy: 'operator',
          activatedAt: new Date('2026-08-03T01:00:00.000Z'),
        })),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (run: (client: typeof tx) => unknown) => run(tx)),
    } as unknown as PrismaService;
    const repo = new PrismaRuleConfigRepository(prisma);

    const result = await repo.activatePreview('r2', {
      activatedBy: 'operator',
      activatedAt: '2026-08-03T01:00:00.000Z',
    });

    expect(tx.ruleConfigVersion.updateMany).toHaveBeenCalledWith({
      where: { status: 'active' },
      data: { status: 'archived' },
    });
    expect(result).toMatchObject({ kind: 'updated', value: { id: 'r2', status: 'active' } });
  });

  it('covers draft reads, preview guards, active lookup and archive transitions', async () => {
    const base = {
      id: 'r1',
      version: 1,
      status: 'draft' as const,
      payload: createDefaultRuleConfigPayload(),
      createdBy: 'operator',
      activatedBy: null,
      createdAt: new Date('2026-08-03T00:00:00.000Z'),
      activatedAt: null,
    };
    const model = {
      create: vi.fn(async () => base),
      findUnique: vi
        .fn()
        .mockResolvedValueOnce(base)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...base, status: 'preview' })
        .mockResolvedValueOnce({
          ...base,
          status: 'active',
          activatedBy: 'operator',
          activatedAt: new Date('2026-08-03T01:00:00.000Z'),
        }),
      findMany: vi.fn(async () => [base]),
      findFirst: vi.fn(async () => ({
        ...base,
        status: 'active',
        activatedBy: 'operator',
        activatedAt: new Date('2026-08-03T01:00:00.000Z'),
      })),
      update: vi.fn(async ({ data }: { data: { status: string } }) => ({
        ...base,
        status: data.status,
        ...(data.status === 'archived'
          ? { activatedBy: 'operator', activatedAt: new Date('2026-08-03T01:00:00.000Z') }
          : {}),
      })),
    };
    const prisma = { ruleConfigVersion: model } as unknown as PrismaService;
    const repo = new PrismaRuleConfigRepository(prisma);

    await expect(
      repo.createDraft({
        payload: createDefaultRuleConfigPayload(),
        createdBy: 'operator',
        createdAt: '2026-08-03T00:00:00.000Z',
      }),
    ).resolves.toMatchObject({ status: 'draft' });
    await expect(repo.findById('r1')).resolves.toMatchObject({ id: 'r1' });
    await expect(repo.findById('missing')).resolves.toBeNull();
    await expect(repo.list()).resolves.toHaveLength(1);
    await expect(repo.findActive()).resolves.toMatchObject({ status: 'active' });
    await expect(repo.markPreview('missing')).resolves.toEqual({ kind: 'not_found' });
    await expect(repo.markPreview('r1')).resolves.toEqual({
      kind: 'invalid_status',
      status: 'preview',
    });
    await expect(repo.archiveActive('r1')).resolves.toMatchObject({
      kind: 'updated',
      value: { status: 'archived' },
    });
  });
});
