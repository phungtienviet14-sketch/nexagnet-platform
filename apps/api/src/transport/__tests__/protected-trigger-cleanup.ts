import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * DON DU LIEU IT DANG NAM SAU TRIGGER CHI-THEM (moc hien truong, phien cho, ...).
 *
 * Moi tep IT cham cac bang do phai tat trigger de xoa dong cua minh, va phai XEP HANG voi nhau tren
 * cung mot khoa tu van — neu khong, tep nay bat trigger lai giua luc tep kia dang xoa.
 *
 * Cach cu (`pg_advisory_lock` MUC PHIEN qua client Prisma CO POOL, roi `pg_advisory_unlock` o mot
 * lenh KHAC) ro khoa: hai lenh co the roi vao hai ket noi khac nhau, lan nha tra `false` (Postgres:
 * "you don't own a lock of type ExclusiveLock") va khoa nam lai tren ket noi kia toi luc
 * `$disconnect()` — chan buoc don cua MOI tep khac, ke ca `afterAll` cua chinh tep do. Do that tren
 * CI: run 35811743513 (bon lan trong mot job) va run 36089600885 (`afterAll` cua
 * `field-truth-leg-status.int.spec.ts` qua 60 s du 6401 bai deu xanh).
 *
 * O day moi lenh di qua CUNG mot giao dich voi khoa MUC GIAO DICH: khoa nha luc commit/rollback,
 * khong con cho nao ro; tep khac khong bao gio thay trigger dang tat vi lan tat va lan bat commit
 * cung nhau. Mau goc: `waiting-delivery-accepted.int.spec.ts` (#363).
 */
export const WAITING_TRIGGER_LOCK = 279_005;

/** Cho lay ket noi + cho khoa cua tep khac; cong lai van duoi tran 60 s cua hook. */
const CONNECTION_WAIT_MS = 10_000;
const TRANSACTION_TIMEOUT_MS = 45_000;

export type ProtectedTrigger = readonly [table: string, trigger: string];

export async function withProtectedTriggersDisabled(
  prisma: PrismaClient,
  triggers: readonly ProtectedTrigger[],
  work: (tx: Prisma.TransactionClient) => Promise<unknown>,
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${WAITING_TRIGGER_LOCK})`);
      for (const [table, trigger] of triggers) {
        await tx.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER "${trigger}"`);
      }
      await work(tx);
      for (const [table, trigger] of triggers) {
        await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE TRIGGER "${trigger}"`);
      }
    },
    { maxWait: CONNECTION_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS },
  );
}
