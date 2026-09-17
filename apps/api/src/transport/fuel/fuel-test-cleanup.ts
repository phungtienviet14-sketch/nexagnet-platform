import type { PrismaService } from '../../config/prisma.service.js';

/**
 * XOA CHENH LECH (ke ca quyet dinh DA GHI) cua cac ky doi soat fixture — CHI dung bo Postgres
 * integration test.
 *
 * ===========================================================================
 * VI SAO PHAI CO HAM NAY (`#317` G0)
 *
 * `transport_fuel_discrepancy_decision_append_only` tu choi moi `DELETE`/`UPDATE` len hang da
 * `RESOLVED` — do la ca diem cua trigger: khong duong san xuat nao duoc xoa lich su quyet dinh. Don
 * dep kiem thu thi PHAI xoa, nen no tat trigger TRONG MOT giao dich, xoa, roi bat lai — khuon cua
 * `customer-ar-test-cleanup.ts` tren `main`.
 *
 * ===========================================================================
 * GIAO DICH CHI CHUA DUNG LENH XOA NAY, va do la co y
 *
 * `ALTER TABLE ... DISABLE TRIGGER` lay khoa `ACCESS EXCLUSIVE` tren bang cho toi het giao dich.
 * Job `integration` chay nhieu tep SONG SONG tren mot Postgres: mot tep khac dang giu khoa hang ky
 * doi soat cua no (`SELECT ... FOR UPDATE`) roi doi bang nay se phai doi giao dich nay xong. Neu
 * giao dich nay con xoa them bang khac (vd chinh ky doi soat) thi hai ben co the cho nhau — nen
 * trong giao dich chi co mot lenh xoa, pham vi theo `reconciliationId` cua chinh fixture.
 */
export async function deleteFuelDiscrepanciesForTest(
  prisma: PrismaService,
  reconciliationIds: readonly string[],
): Promise<void> {
  if (reconciliationIds.length === 0) return;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('ALTER TABLE "TransportFuelDiscrepancy" DISABLE TRIGGER USER');
    await tx.transportFuelDiscrepancy.deleteMany({
      where: { reconciliationId: { in: [...reconciliationIds] } },
    });
    await tx.$executeRawUnsafe('ALTER TABLE "TransportFuelDiscrepancy" ENABLE TRIGGER USER');
  });
}
