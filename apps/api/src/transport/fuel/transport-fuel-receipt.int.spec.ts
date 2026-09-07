import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import { FuelDocumentService } from './fuel-document.service.js';
import { XmlFuelInvoiceSource } from './fuel-invoice-source.js';
import { StubFuelReceiptExtractor } from './fuel-receipt-extraction.stub.js';
import { FuelStationService } from './fuel-station.service.js';
import { PrismaFuelDocumentRepository } from './prisma-fuel-document.repository.js';
import { PrismaFuelStationRepository } from './prisma-fuel-station.repository.js';
import { PrismaFuelRepository } from './prisma-fuel.repository.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { PrismaTripRepository } from '../trips/prisma-trip.repository.js';
import { TransportFuelCoreFactsAdapter } from './fuel.ports.js';

/**
 * C3 — NHAP MOT BUC ANH TREN POSTGRES THAT (Lane C, Issue #236).
 *
 * ===========================================================================
 * BA THU CHI DO DUOC O DAY
 *
 *   · Cot `confidence` la `jsonb`. Mot bang muc tin di qua Prisma roi ve phai GIU NGUYEN tung
 *     khoa — mot vong `JSON.stringify` sai cho se bien no thanh mot chuoi, va `NULL` cua duong XML
 *     thanh mot chuoi `"null"`. Trong bo nho, ca hai kieu hong nay deu khong ton tai.
 *   · Rang buoc `TransportFuelCandidate_confidence_is_object`.
 *   · **BAT BIEN NGHIEP VU cua #236**: nhap bao nhieu buc anh cung KHONG sinh mot buoc dong tien
 *     nao cua quy tai xe. Day la dieu duy nhat trong ca lane ma mot bai test trong bo nho khong the
 *     noi that ve, vi no la mot cau ve NHUNG BANG KHAC.
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'Nhap ANH phieu do dau tren Postgres THAT — C3',
  () => {
    const prisma = new PrismaService();
    const documents = new PrismaFuelDocumentRepository(prisma);
    const stations = new PrismaFuelStationRepository(prisma);
    const fuel = new PrismaFuelRepository(prisma);
    const audit = new AuditLogService(new InMemoryAuditLogRepository());

    const service = new FuelDocumentService(
      documents,
      new XmlFuelInvoiceSource(),
      new StubFuelReceiptExtractor(),
      new FuelStationService(stations, fuel, audit),
      fuel,
      new TransportFuelCoreFactsAdapter(
        new PrismaTripRepository(prisma),
        new PrismaFleetRepository(prisma),
      ),
      { timeZone: 'Asia/Ho_Chi_Minh' },
      audit,
    );

    /**
     * Tien to RIENG, khong long nhau voi `IT-C1-CX` / `IT-C2-CX` — ham don dung `startsWith`.
     *
     * Ma so thue `0100000000` la thu `StubFuelReceiptExtractor` phat ra. Bai nay CO Y khong tao mot
     * nha cung cap mang ma do: ket cuc dung cua mot buc anh khong noi duoc nha cung cap la
     * `SUPPLIER_UNLINKED`, va do la mot ket cuc that ma nguoi truc se gap moi ngay.
     */
    const STUB_TAX_CODE = '0100000000';
    const ACTOR = 'IT-C3-ke-toan';

    /** Byte JPEG that ve chu ky dinh dang; noi dung anh khong quan trong voi bo doc tat dinh. */
    const jpeg = (salt: string) =>
      Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(salt, 'utf8')]);

    const photo = (salt: string, sourceRef = `it-c3-${salt}.jpg`) => ({
      sourceRef,
      mediaType: 'image/jpeg',
      content: jpeg(salt),
    });

    async function cleanup(): Promise<void> {
      const docs = await prisma.transportFuelDocument.findMany({
        where: {
          OR: [{ sellerTaxCodeRaw: STUB_TAX_CODE }, { sourceRef: { startsWith: 'it-c3-' } }],
        },
        select: { id: true },
      });
      const docIds = docs.map((row) => row.id);
      await prisma.transportFuelCandidate.deleteMany({ where: { documentId: { in: docIds } } });
      await prisma.transportFuelDocument.deleteMany({
        where: { id: { in: docIds }, duplicateOfId: { not: null } },
      });
      await prisma.transportFuelDocument.deleteMany({ where: { id: { in: docIds } } });
    }

    beforeAll(cleanup);
    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it('C3-INT-01 — anh nhap duoc, `kind` ghi RECEIPT_IMAGE, muc tin GIU NGUYEN tung khoa', async () => {
      const detail = await service.ingestReceiptImage(photo('a'), ACTOR);

      const row = await prisma.transportFuelCandidate.findFirstOrThrow({
        where: { documentId: detail.document.id },
      });
      const document = await prisma.transportFuelDocument.findUniqueOrThrow({
        where: { id: detail.document.id },
      });

      expect(document.kind).toBe('RECEIPT_IMAGE');
      // `jsonb` tra ve mot DOI TUONG, khong phai mot chuoi. Neu doc ra chuoi thi mot vong stringify
      // thua da lot vao duong ghi, va moi phep loc muc tin sau nay se im lang.
      expect(typeof row.confidence).toBe('object');
      expect((row.confidence as Record<string, number>)['line.1.unitPriceMilli']).toBe(899);
    });

    it('C3-INT-02 — ung vien tu XML giu `confidence = NULL`, khong thanh chuoi "null"', async () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<HDon><DLHDon><TTChung><KHHDon>C26IT3</KHHDon><SHDon>930001</SHDon><NLap>2026-09-05</NLap></TTChung>
<NDHDon><NBan><MST>${STUB_TAX_CODE}</MST><Ten>Cua hang IT C3</Ten></NBan>
<DSHHDVu><HHDVu><SLuong>10</SLuong><DGia>21000</DGia><ThTien>210000</ThTien></HHDVu></DSHHDVu>
</NDHDon></DLHDon></HDon>`;
      const detail = await service.ingest(
        { sourceRef: 'it-c3-xml.xml', kind: 'EINVOICE_XML', content: Buffer.from(xml, 'utf8') },
        ACTOR,
      );

      const row = await prisma.transportFuelCandidate.findFirstOrThrow({
        where: { documentId: detail.document.id },
      });
      expect(row.confidence).toBeNull();
    });

    it('C3-INT-03 — dung buc anh do gui lai KHONG ghi them mot hang nao', async () => {
      const first = await service.ingestReceiptImage(photo('b'), ACTOR);
      const again = await service.ingestReceiptImage(photo('b', 'it-c3-ten-khac.jpg'), ACTOR);

      expect(again.document.id).toBe(first.document.id);
      const count = await prisma.transportFuelDocument.count({
        where: { contentDigest: first.document.contentDigest },
      });
      expect(count).toBe(1);
    });

    it('C3-INT-04 — tep khong phai anh VAN duoc ghi, kem ly do co ten va khong ung vien nao', async () => {
      const detail = await service.ingestReceiptImage(
        { sourceRef: 'it-c3-hong.jpg', mediaType: 'image/jpeg', content: Buffer.from('<html>') },
        ACTOR,
      );

      const document = await prisma.transportFuelDocument.findUniqueOrThrow({
        where: { id: detail.document.id },
      });
      expect(document.status).toBe('REJECTED');
      expect(document.rejectReason).toBe('UNSUPPORTED_MEDIA_TYPE');
      expect(
        await prisma.transportFuelCandidate.count({ where: { documentId: document.id } }),
      ).toBe(0);
    });

    /**
     * `TransportFuelCandidate_confidence_is_object` — do BANG POSTGRES, khong bang tang ung dung.
     *
     * Duong ghi cua ung dung khong the vi pham rang buoc nay (kieu TypeScript da chan), nen bai nay
     * ghi THANG bang SQL tho. Do la cach duy nhat de biet rang rang buoc THUC SU con o day, chu
     * khong bi mot lan `prisma migrate dev` nao do lang le xoa mat.
     */
    it('C3-INT-05 — Postgres tu choi mot muc tin VO HUONG, khong chi tang ung dung tu choi', async () => {
      const seed = await service.ingestReceiptImage(photo('c'), ACTOR);
      const row = await prisma.transportFuelCandidate.findFirstOrThrow({
        where: { documentId: seed.document.id },
        select: { id: true },
      });

      await expect(
        prisma.$executeRaw`UPDATE "TransportFuelCandidate" SET "confidence" = '850'::jsonb WHERE "id" = ${row.id}`,
      ).rejects.toThrow(/confidence_is_object/);
    });

    /**
     * BAT BIEN NGHIEP VU CUA #236, do tren DU LIEU THAT.
     *
     * "Supplier-account fuel KHONG duoc tao Driver Fund movement." Nhien lieu tra qua tai khoan nha
     * cung cap khong di qua tui lai xe, nen khong mot buoc dong tien nao cua quy tai xe duoc sinh
     * ra. Bai nay dem TRUOC va SAU chu khong khang dinh mot con so tuyet doi: bang nay dung chung
     * voi moi bai khac trong thu muc, va mot khang dinh `= 0` se do vi ly do khong lien quan.
     */
    it('C3-INT-06 — nhap bon buc anh KHONG sinh mot buoc dong tien nao cua quy tai xe', async () => {
      const beforeFund = await prisma.transportDriverFundEntry.count();
      const beforeEntries = await prisma.transportFuelEntry.count();

      for (const salt of ['d', 'e', 'f', 'g']) {
        await service.ingestReceiptImage(photo(salt), ACTOR);
      }

      expect(await prisma.transportDriverFundEntry.count()).toBe(beforeFund);
      // Va cung khong mot PHIEU DO DAU nao: mot ung vien khong tu tro thanh phieu duoc.
      expect(await prisma.transportFuelEntry.count()).toBe(beforeEntries);
    });
  },
);
