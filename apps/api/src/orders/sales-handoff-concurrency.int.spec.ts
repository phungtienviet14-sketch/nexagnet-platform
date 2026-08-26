import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { OrderView } from '@netviet/shared';
import { PrismaService } from '../config/prisma.service.js';
import { PrismaOrdersRepository } from './prisma-orders.repository.js';
import { SalesHandoffFollowupService } from './sales-handoff-followup.service.js';
import { TelemetryService } from '../observability/telemetry.service.js';
import type { TelemetryRecord } from '../observability/telemetry-record.js';

/**
 * EXACTLY-ONCE DUOI TAI SONG SONG — tren Postgres THAT.
 *
 * ---------------------------------------------------------------------------
 * VI SAO BAI TUAN TU KHONG DU (va vi sao tep nay ton tai):
 *
 * `sales-handoff-followup.spec.ts` goi `markFollowup` HAI LAN LIEN TIEP va thay lan hai tra
 * `applied: false`. Dung — nhung no khong tra loi duoc cau hoi that:
 *
 *     A doc (chua nhac) | B doc (chua nhac) | A ghi | B ghi   -> CA HAI cung `applied: true`
 *
 * Do la mot `check-then-act` khong nguyen tu, va no khong lo ra o duong tuan tu. Voi outbox
 * at-least-once + engine at-least-once + retry cua HTTP, hai lan goi CHONG NHAU khong phai gia
 * thuyet — no la hanh vi da duoc cong bo cua ha tang.
 *
 * MOT `$transaction` THUONG CUNG KHONG DU: Postgres mac dinh `READ COMMITTED`, nen hai giao dich
 * van doc duoc CUNG mot anh chup cu roi ca hai cung ghi de. Phai co khoa hang (`FOR UPDATE`)
 * hoac mot cau `UPDATE ... WHERE <dieu kien>` co dieu kien.
 *
 * ---------------------------------------------------------------------------
 * CHAY: can Postgres that (`RUN_PRISMA_IT=1`), giong `prisma-orders.repository.int.spec.ts`:
 *   RUN_PRISMA_IT=1 DATABASE_URL=postgresql://netviet:netviet_local@127.0.0.1:5432/netviet \
 *     pnpm --filter @netviet/api exec vitest run src/orders/sales-handoff-concurrency.int.spec.ts
 */

const RUN_IT = process.env.RUN_PRISMA_IT === '1';
const CHAT_ID = 'it-race-chat';
const ORDER_ID = 'it-followup-race';

function pendingOrder(): OrderView {
  return {
    id: ORDER_ID,
    status: 'sent',
    intent: 'dat_don',
    chatId: CHAT_ID,
    rawText: 'lay 1 aaa',
    createdAt: new Date('2026-08-25T00:00:00.000Z').toISOString(),
    salesHandoff: {
      action: 'manual_erp_entry',
      status: 'pending',
      createdAt: new Date('2026-08-25T00:00:00.000Z').toISOString(),
    },
  } as unknown as OrderView;
}

describe.skipIf(!RUN_IT)('markFollowup duoi hai yeu cau SONG SONG (Postgres that)', () => {
  const prisma = new PrismaService();
  const repo = new PrismaOrdersRepository(prisma);
  const records: TelemetryRecord[] = [];
  const telemetry = new TelemetryService();
  telemetry.configure({
    release: { tenant: 'fixture', environment: 'test', gitSha: 'unknown', source: 'none' },
    privacy: 'redacted',
    sinks: [{ record: (record) => records.push(record) }],
  });
  const followup = new SalesHandoffFollowupService(repo, telemetry);

  beforeEach(async () => {
    records.length = 0;
    await prisma.order.deleteMany({ where: { chatId: CHAT_ID } });
    await repo.create(pendingOrder());
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { chatId: CHAT_ID } });
    await prisma.$disconnect();
  });

  it('hai lan goi CHONG NHAU -> dung MOT lan danh dau', async () => {
    const [first, second] = await Promise.all([
      followup.markFollowup(ORDER_ID, 'reminder'),
      followup.markFollowup(ORDER_ID, 'reminder'),
    ]);

    const applied = [first, second].filter((r) => r?.applied === true);
    const skipped = [first, second].filter((r) => r?.applied === false);

    // (1) Dung MOT ben thang. Day la khang dinh chinh.
    expect(applied).toHaveLength(1);
    expect(skipped).toHaveLength(1);
    // Ben thua phai noi ro VI SAO — khong duoc gop thanh mot `false` khong ly do.
    expect(skipped[0]?.reason).toBe('FOLLOWUP_ALREADY_MARKED');

    // (2) DB chi mang MOT dau vet, va viec ban giao van la viec cua nguoi.
    const stored = await repo.findById(ORDER_ID);
    expect(stored?.salesHandoff?.followUp?.stage).toBe('reminder');
    expect(stored?.salesHandoff?.status).toBe('pending');

    // (3) Va dung MOT quyet dinh `FOLLOWUP_MARKED` — neu hai, moi bao cao dem tu day deu sai.
    const marked = records.filter(
      (r) => r.type === 'decision' && (r as { reason?: string }).reason === 'FOLLOWUP_MARKED',
    );
    expect(marked).toHaveLength(1);
  });

  it('nam lan goi chong nhau -> van dung MOT lan danh dau', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => followup.markFollowup(ORDER_ID, 'reminder')),
    );

    expect(results.filter((r) => r?.applied === true)).toHaveLength(1);
    expect(results.filter((r) => r?.applied === false)).toHaveLength(4);
    expect(
      records.filter(
        (r) => r.type === 'decision' && (r as { reason?: string }).reason === 'FOLLOWUP_MARKED',
      ),
    ).toHaveLength(1);
  });

  it('nguoi hoan tat XEN GIUA -> khong lan goi nao danh dau duoc', async () => {
    await repo.update(ORDER_ID, {
      salesHandoff: {
        action: 'manual_erp_entry',
        status: 'completed',
        createdAt: new Date('2026-08-25T00:00:00.000Z').toISOString(),
      },
    });

    const results = await Promise.all([
      followup.markFollowup(ORDER_ID, 'reminder'),
      followup.markFollowup(ORDER_ID, 'reminder'),
    ]);

    expect(results.every((r) => r?.applied === false)).toBe(true);
    expect(results.every((r) => r?.reason === 'FOLLOWUP_NOT_PENDING')).toBe(true);
    expect((await repo.findById(ORDER_ID))?.salesHandoff?.followUp).toBeUndefined();
  });
});
