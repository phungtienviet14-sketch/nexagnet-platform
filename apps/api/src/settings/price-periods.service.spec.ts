import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuditLogService } from '../audit/audit-log.service.js';
import type { PrismaService } from '../config/prisma.service.js';
import type { KnowledgeService } from '../knowledge/knowledge.service.js';
import { currentPriceMonth } from '../knowledge/price-periods.js';
import { PricePeriodsService, buildPriceImportPreview } from './price-periods.service.js';

const rows = [
  { sku: 'A', wholesale: 100, minRetailPrice: 120 },
  { sku: 'B', wholesale: 200 },
];

describe('price period import preview', () => {
  it('is deterministic/idempotent and reports unchanged rows', () => {
    const preview = buildPriceImportPreview(rows, rows, new Set(['A', 'B']));
    expect(preview).toMatchObject({ valid: true, created: 0, updated: 0, unchanged: 2 });
    expect(preview.diff).toEqual([]);
  });

  it('does not overwrite operator rows without explicit overwrite', () => {
    const preview = buildPriceImportPreview(
      [{ sku: 'A', wholesale: 999 }],
      [{ sku: 'A', wholesale: 100 }],
      new Set(['A']),
    );
    expect(preview.valid).toBe(false);
    expect(preview.errors.join(' ')).toContain('overwrite');
  });

  it('rejects duplicate and unknown SKU before DB writes', () => {
    const preview = buildPriceImportPreview(
      [
        { sku: 'A', wholesale: 100 },
        { sku: 'A', wholesale: 100 },
        { sku: 'X', wholesale: 1 },
      ],
      [],
      new Set(['A']),
    );
    expect(preview.valid).toBe(false);
    expect(preview.errors.join(' ')).toContain('trùng');
    expect(preview.errors.join(' ')).toContain('không tồn tại');
  });
});

/**
 * Xoa dong gia khoi ky NHAP (Issue #116).
 *
 * Truoc day khong co duong nao: `applyImport()` chi upsert dong gui len, nen mot ban nhap copy 19
 * mat hang khong the rut ve 1. Nguoi van hanh chi con cach nho nguoi co quyen goi API.
 */
describe('PricePeriodsService.removeDraftPrice', () => {
  function makeWith(period: { id: string; status: string; prices: Array<{ sku: string }> }) {
    // `$transaction` + `$executeRaw` la BAT BUOC ke tu #121: ca ba nguoi ghi vong doi deu chay
    // trong mot giao dich da `SELECT ... FOR UPDATE` hang ky. Ban gia lap chuyen thang chinh no
    // lam `tx` — du de khang dinh hanh vi tuan tu, con viec khoa co THAT SU chan duoc dua hay
    // khong thi phai do tren Postgres that (`price-periods-concurrency.int.spec.ts`).
    const prisma = {
      pricePeriod: {
        findUnique: vi.fn(async () => ({ validMonth: '2026-09', ...period })),
      },
      price: { deleteMany: vi.fn(async () => ({ count: 1 })) },
      $executeRaw: vi.fn(async () => 1),
      $transaction: vi.fn(async (input: ((tx: unknown) => unknown) | unknown[]) =>
        typeof input === 'function' ? input(prisma) : Promise.all(input),
      ),
    } as unknown as PrismaService;
    const audit = { append: vi.fn(async () => undefined) } as unknown as AuditLogService;
    const knowledge = { reload: vi.fn(async () => undefined) } as unknown as KnowledgeService;
    return {
      service: new PricePeriodsService(prisma, audit, knowledge, 'prisma'),
      prisma,
      audit,
      knowledge,
    };
  }

  const draft = {
    id: 'p1',
    status: 'draft',
    prices: [
      { sku: 'A', wholesale: 100 },
      { sku: 'B', wholesale: 200 },
    ],
  };

  it('xoa dung mot dong cua dung ky do, va ghi audit kem trang thai truoc', async () => {
    const { service, prisma, audit } = makeWith(draft);

    const result = await service.removeDraftPrice('p1', 'A', 'operator', 'req-1');

    expect(prisma.price.deleteMany).toHaveBeenCalledWith({ where: { periodId: 'p1', sku: 'A' } });
    expect(result).toEqual({ periodId: 'p1', sku: 'A', removed: true, remaining: 1 });
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'price_period.price.remove',
        entityType: 'PricePeriod',
        entityId: 'p1',
        before: { sku: 'A', wholesale: 100 },
        after: null,
        requestId: 'req-1',
      }),
    );
  });

  it('tu choi xoa dong cua ky DANG AP DUNG', async () => {
    const { service, prisma } = makeWith({ ...draft, status: 'active' });

    await expect(service.removeDraftPrice('p1', 'A', 'operator', null)).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.price.deleteMany).not.toHaveBeenCalled();
  });

  it('tu choi xoa dong cua ky DA LUU TRU', async () => {
    const { service, prisma } = makeWith({ ...draft, status: 'archived' });

    await expect(service.removeDraftPrice('p1', 'A', 'operator', null)).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.price.deleteMany).not.toHaveBeenCalled();
  });

  it('SKU khong thuoc ky nay thi tra 404 that tha, khong dung 500', async () => {
    const { service, prisma } = makeWith(draft);

    await expect(service.removeDraftPrice('p1', 'KHONG-CO', 'operator', null)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.price.deleteMany).not.toHaveBeenCalled();
  });

  it('bam Xoa hai lan cung luc: lan sau dem duoc 0 dong -> 404, khong phai loi may chu', async () => {
    const { service, prisma } = makeWith(draft);
    (prisma.price.deleteMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      count: 0,
    });

    await expect(service.removeDraftPrice('p1', 'A', 'operator', null)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('SKU rong khong duoc bien thanh mot lenh xoa khong dieu kien', async () => {
    const { service, prisma } = makeWith(draft);

    await expect(service.removeDraftPrice('p1', '   ', 'operator', null)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.price.deleteMany).not.toHaveBeenCalled();
  });

  it('khong nap lai kien thuc: ban nhap chua bao gio nam trong bang gia dang chay', async () => {
    const { service, knowledge } = makeWith(draft);

    await service.removeDraftPrice('p1', 'A', 'operator', null);

    expect(knowledge.reload).not.toHaveBeenCalled();
  });
});

describe('PricePeriodsService lifecycle', () => {
  function make() {
    const prisma = {
      pricePeriod: {
        findMany: vi.fn(async () => []),
        findFirst: vi.fn(async () => null),
        findUnique: vi.fn(async () => ({
          id: 'p1',
          validMonth: '2026-08',
          status: 'draft',
          prices: rows,
        })),
        create: vi.fn(async ({ data }: { data: object }) => ({
          id: 'p1',
          status: 'draft',
          ...data,
        })),
        updateMany: vi.fn(async () => ({ count: 0 })),
        update: vi.fn(async () => ({ id: 'p1', validMonth: '2026-08', status: 'active' })),
      },
      product: { findMany: vi.fn(async () => [{ sku: 'A' }, { sku: 'B' }]) },
      price: {
        createMany: vi.fn(async () => ({ count: 2 })),
        upsert: vi.fn(async () => ({})),
        deleteMany: vi.fn(async () => ({ count: 1 })),
      },
      $executeRaw: vi.fn(async () => 1),
      $transaction: vi.fn(async (input: ((tx: unknown) => unknown) | unknown[]) =>
        typeof input === 'function' ? input(prisma) : Promise.all(input),
      ),
    } as unknown as PrismaService;
    const audit = { append: vi.fn(async () => undefined) } as unknown as AuditLogService;
    const knowledge = { reload: vi.fn(async () => undefined) } as unknown as KnowledgeService;
    return {
      service: new PricePeriodsService(prisma, audit, knowledge, 'prisma'),
      prisma,
      audit,
      knowledge,
    };
  }

  it('creates draft only; creation can never activate implicitly', async () => {
    const { service, prisma } = make();
    await service.createDraft({ validMonth: '2026-08' }, 'sale', null);
    expect(prisma.pricePeriod.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ validMonth: '2026-08', status: 'draft' }),
      include: { prices: true },
    });
  });

  it('stores explicit test-only drafts in the existing source field', async () => {
    const { service, prisma } = make();

    await service.createDraft({ validMonth: '2026-08', testOnly: true }, 'sale', null);

    expect(prisma.pricePeriod.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ source: 'test_only', status: 'draft' }),
      include: { prices: true },
    });
  });

  it('keeps a current test-only period visible but never reports it as production current', async () => {
    const { service, prisma } = make();
    const validMonth = currentPriceMonth();
    vi.mocked(prisma.pricePeriod.findMany).mockResolvedValue([
      {
        id: 'test-current',
        validMonth,
        status: 'active',
        source: 'test_only',
        prices: [rows[0]],
        _count: { prices: 1 },
      },
    ] as never);

    await expect(service.list()).resolves.toMatchObject({
      currentPeriodId: null,
      testOnlyCurrentPeriodId: 'test-current',
      missingCurrentPeriod: true,
    });
  });

  it('rejects activation until every catalog SKU has a valid price', async () => {
    const { service, prisma } = make();
    vi.mocked(prisma.pricePeriod.findUnique).mockResolvedValue({
      id: 'p1',
      validMonth: '2026-08',
      status: 'draft',
      prices: [rows[0]],
    } as never);
    await expect(service.activate('p1', 'sale', null)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows explicit test-only periods to activate with one or two priced SKUs', async () => {
    const { service, prisma, knowledge } = make();
    vi.mocked(prisma.pricePeriod.findUnique).mockResolvedValue({
      id: 'p1',
      validMonth: '2026-08',
      status: 'draft',
      source: 'test_only',
      prices: [rows[0]],
    } as never);

    await expect(service.activate('p1', 'sale', 'req')).resolves.toMatchObject({
      status: 'active',
    });

    expect(prisma.pricePeriod.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: expect.objectContaining({ status: 'active' }),
    });
    expect(prisma.pricePeriod.updateMany).toHaveBeenCalledWith({
      where: {
        validMonth: '2026-08',
        status: 'active',
        NOT: { id: 'p1' },
        source: 'test_only',
      },
      data: { status: 'archived' },
    });
    expect(knowledge.reload).toHaveBeenCalled();
  });

  it('refuses to replace an active production period with test-only prices', async () => {
    const { service, prisma } = make();
    vi.mocked(prisma.pricePeriod.findUnique).mockResolvedValue({
      id: 'p1',
      validMonth: '2026-08',
      status: 'draft',
      source: 'test_only',
      prices: [rows[0]],
    } as never);
    vi.mocked(prisma.pricePeriod.findFirst).mockResolvedValue({
      id: 'production-current',
    } as never);

    await expect(service.activate('p1', 'sale', null)).rejects.toThrow(
      'đã có kỳ production active cùng tháng',
    );
    expect(prisma.pricePeriod.updateMany).not.toHaveBeenCalled();
    expect(prisma.pricePeriod.update).not.toHaveBeenCalled();
  });

  it('refuses test-only activation when the runtime is classified as customer data', async () => {
    const { service, prisma } = make();
    vi.mocked(prisma.pricePeriod.findUnique).mockResolvedValue({
      id: 'p1',
      validMonth: '2026-08',
      status: 'draft',
      source: 'test_only',
      prices: [rows[0]],
    } as never);
    vi.stubEnv('DATA_CLASSIFICATION', 'customer');
    vi.stubEnv('PARSER_MODE', 'claude');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    vi.stubEnv('PERSISTENCE', 'prisma');
    vi.stubEnv('AUTH_MODE', 'session');
    vi.stubEnv('SESSION_SECRET', 'x'.repeat(32));
    vi.stubEnv('CHANNEL_MODE', 'mock');

    try {
      await expect(service.activate('p1', 'sale', null)).rejects.toThrow(
        'chỉ được activate trong môi trường dữ liệu TEST',
      );
    } finally {
      vi.unstubAllEnvs();
    }

    expect(prisma.pricePeriod.updateMany).not.toHaveBeenCalled();
    expect(prisma.pricePeriod.update).not.toHaveBeenCalled();
  });

  it('keeps test-only activation bounded to at most two priced SKUs', async () => {
    const { service, prisma } = make();
    vi.mocked(prisma.pricePeriod.findUnique).mockResolvedValue({
      id: 'p1',
      validMonth: '2026-08',
      status: 'draft',
      source: 'test_only',
      prices: [...rows, { sku: 'C', wholesale: 300 }],
    } as never);
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { sku: 'A' },
      { sku: 'B' },
      { sku: 'C' },
    ] as never);

    await expect(service.activate('p1', 'sale', null)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('archives old same-month active period and activates atomically', async () => {
    const { service, prisma, knowledge } = make();
    await expect(service.activate('p1', 'sale', 'req')).resolves.toMatchObject({
      status: 'active',
    });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.pricePeriod.updateMany).toHaveBeenCalledWith({
      where: { validMonth: '2026-08', status: 'active', NOT: { id: 'p1' } },
      data: { status: 'archived' },
    });
    expect(knowledge.reload).toHaveBeenCalled();
  });

  it.each(['active', 'draft'] as const)(
    'archives an exact %s period with audit and reload',
    async (status) => {
      const { service, prisma, audit, knowledge } = make();
      vi.mocked(prisma.pricePeriod.findUnique).mockResolvedValue({
        id: 'p1',
        validMonth: '2026-08',
        status,
        source: 'test_only',
        prices: [rows[0]],
      } as never);
      vi.mocked(prisma.pricePeriod.update).mockResolvedValue({
        id: 'p1',
        validMonth: '2026-08',
        status: 'archived',
        source: 'test_only',
      } as never);

      await expect(service.archive('p1', 'sale', 'req-archive')).resolves.toMatchObject({
        id: 'p1',
        status: 'archived',
      });

      expect(prisma.pricePeriod.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { status: 'archived' },
      });
      expect(audit.append).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'price_period.archive',
          entityType: 'PricePeriod',
          entityId: 'p1',
          requestId: 'req-archive',
        }),
      );
      expect(knowledge.reload).toHaveBeenCalled();
    },
  );

  it('refuses to archive an already archived period', async () => {
    const { service, prisma, knowledge } = make();
    vi.mocked(prisma.pricePeriod.findUnique).mockResolvedValue({
      id: 'p1',
      validMonth: '2026-08',
      status: 'archived',
      prices: [rows[0]],
    } as never);

    await expect(service.archive('p1', 'sale', null)).rejects.toThrow('Chỉ kỳ active hoặc draft');
    expect(prisma.pricePeriod.update).not.toHaveBeenCalled();
    expect(knowledge.reload).not.toHaveBeenCalled();
  });

  it('applies an explicitly confirmed preview and keeps upsert idempotency key', async () => {
    const { service, prisma } = make();
    await expect(
      service.applyImport('p1', { rows, overwrite: false, confirmed: true }, 'sale', null),
    ).resolves.toMatchObject({ periodId: 'p1', preview: { valid: true, unchanged: 2 } });
    expect(prisma.price.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.price.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { periodId_sku: { periodId: 'p1', sku: 'A' } } }),
    );
  });

  it('allows a draft revision for a month that already has history', async () => {
    const { service, prisma } = make();
    vi.mocked(prisma.pricePeriod.findMany).mockResolvedValueOnce([{ id: 'exists' }] as never);
    await expect(
      service.copyDraft('p1', { validMonth: '2026-09' }, 'sale', null),
    ).resolves.toMatchObject({
      status: 'draft',
      validMonth: '2026-09',
    });
  });
});

/**
 * MOT GIAO THUC KHOA CHO CA BA NGUOI GHI VONG DOI (Issue #121).
 *
 * Bai o day chi chung minh mot dieu, nhung la dieu de vo nhat khi ai do them nguoi ghi thu tu:
 * ca ba deu di qua `SELECT ... FOR UPDATE` tren DUNG hang `PricePeriod` do, tuc la khong ai con
 * mot duong rieng ne duoc hang doi.
 *
 * No KHONG chung minh duoc rang khoa that su chan duoc dua — mot ban gia lap khong tra loi duoc
 * cau hoi do. Phan ay thuoc ve `price-periods-concurrency.int.spec.ts`, chay tren Postgres that.
 */
describe('PricePeriod lifecycle — mot giao thuc khoa duy nhat', () => {
  function make(status: 'draft' | 'active' = 'draft') {
    const prisma = {
      pricePeriod: {
        findUnique: vi.fn(async () => ({
          id: 'p1',
          validMonth: '2026-08',
          status,
          source: null,
          prices: rows,
        })),
        findFirst: vi.fn(async () => null),
        updateMany: vi.fn(async () => ({ count: 0 })),
        update: vi.fn(async () => ({ id: 'p1', validMonth: '2026-08', status: 'active' })),
      },
      product: { findMany: vi.fn(async () => [{ sku: 'A' }, { sku: 'B' }]) },
      price: { deleteMany: vi.fn(async () => ({ count: 1 })) },
      $executeRaw: vi.fn(async () => 1),
      $transaction: vi.fn(async (input: ((tx: unknown) => unknown) | unknown[]) =>
        typeof input === 'function' ? input(prisma) : Promise.all(input),
      ),
    } as unknown as PrismaService;
    const audit = { append: vi.fn(async () => undefined) } as unknown as AuditLogService;
    const knowledge = { reload: vi.fn(async () => undefined) } as unknown as KnowledgeService;
    return { service: new PricePeriodsService(prisma, audit, knowledge, 'prisma'), prisma };
  }

  /** `$executeRaw` nhan (TemplateStringsArray, ...values) — ghep lai de doc duoc cau SQL. */
  function rawLocks(prisma: PrismaService): Array<{ sql: string; values: unknown[] }> {
    const calls = (prisma.$executeRaw as unknown as ReturnType<typeof vi.fn>).mock.calls as Array<
      [TemplateStringsArray, ...unknown[]]
    >;
    return calls.map(([parts, ...values]) => ({ sql: parts.join('?'), values }));
  }

  /** Thu tu goi cua lan dau; nem neu ham chua he duoc goi, de bai do noi ro ly do. */
  function firstCallOrder(fn: unknown, label: string): number {
    const order = (fn as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    if (order === undefined) throw new Error(`${label} chua he duoc goi`);
    return order;
  }

  it.each([
    ['removeDraftPrice', (s: PricePeriodsService) => s.removeDraftPrice('p1', 'A', 'sale', null)],
    ['activate', (s: PricePeriodsService) => s.activate('p1', 'sale', null)],
    ['archive', (s: PricePeriodsService) => s.archive('p1', 'sale', null)],
  ])('%s khoa dung hang PricePeriod truoc khi quyet dinh', async (_name, run) => {
    const { service, prisma } = make();

    await run(service);

    const rowLocks = rawLocks(prisma).filter((lock) => lock.sql.includes('FOR UPDATE'));
    expect(rowLocks).toHaveLength(1);
    const [lock] = rowLocks;
    expect(lock?.sql).toContain('"PricePeriod"');
    // Khoa dung MOT hang, khong phai ca bang: id phai di vao truy van co tham so.
    expect(lock?.values[0]).toBe('p1');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  /**
   * THU TU la toan bo phan chung minh khong-deadlock cua Issue #122 — nen no duoc khoa bang bai
   * test, khong phai bang mot cau ghi chu.
   *
   * Dao lai thanh `khoa hang muc tieu -> roi moi khoa thang` thi hai `activate()` cua hai ban
   * nhap cung thang se giu hai hang KHAC NHAU roi doi khoa cua nhau. Bai duoi day do ngay khi ai
   * do doi thu tu, ke ca khi tren Postgres that cuoc dua chua kip xay ra.
   */
  it('activate xep hang CA THANG truoc, roi moi khoa hang ky (Issue #122)', async () => {
    const { service, prisma } = make();

    await service.activate('p1', 'sale', null);

    const locks = rawLocks(prisma);
    expect(locks).toHaveLength(2);
    expect(locks[0]?.sql).toContain('pg_advisory_xact_lock');
    // Khoa theo TEN THANG, khong phai theo id ky: hai ky khac nhau cung thang phai gap nhau.
    expect(locks[0]?.sql).toContain('hashtext');
    expect(locks[0]?.values).toContain('2026-08');
    expect(locks[1]?.sql).toContain('FOR UPDATE');
  });

  it.each([
    ['removeDraftPrice', (s: PricePeriodsService) => s.removeDraftPrice('p1', 'A', 'sale', null)],
    ['archive', (s: PricePeriodsService) => s.archive('p1', 'sale', null)],
  ])(
    '%s KHONG xep hang theo thang — no khong tao ra duoc ky ACTIVE thu hai',
    async (_name, run) => {
      // Bat ca ba nguoi ghi xep hang theo thang thi van dung, nhung se lam mot thao tac chi cham
      // vao MOT hang phai cho ca thang. Chi `activate()` quyet dinh dua tren trang thai ca thang.
      const { service, prisma } = make();

      await run(service);

      const sql = rawLocks(prisma)
        .map((lock) => lock.sql)
        .join(' ');
      expect(sql).not.toContain('pg_advisory_xact_lock');
    },
  );

  it('trang thai duoc doc SAU khi khoa, khong phai truoc', async () => {
    const { service, prisma } = make();

    await service.archive('p1', 'sale', null);

    // Doc truoc roi moi khoa thi van la check-then-act — chi hep cua so lai, khong dong duoc no.
    expect(firstCallOrder(prisma.$executeRaw, 'khoa hang')).toBeLessThan(
      firstCallOrder(prisma.pricePeriod.findUnique, 'doc ky'),
    );
  });

  it('activate cham diem tren dong doc SAU khoa, khong dung anh chup cu', async () => {
    const { service, prisma } = make();

    await service.activate('p1', 'sale', null);

    // Danh muc phai duoc doc bang chinh `tx` dang giu khoa. Neu ai do doi ve `this.prisma`
    // ngoai giao dich, mot `removeDraftPrice` vua commit se khong duoc nhin thay.
    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
    expect(firstCallOrder(prisma.$executeRaw, 'khoa hang')).toBeLessThan(
      firstCallOrder(prisma.product.findMany, 'doc danh muc'),
    );
  });
});
