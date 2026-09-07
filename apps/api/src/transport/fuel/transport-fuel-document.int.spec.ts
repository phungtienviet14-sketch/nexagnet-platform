import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import { FuelDocumentService } from './fuel-document.service.js';
import { XmlFuelInvoiceSource, type FuelInvoiceFile } from './fuel-invoice-source.js';
import { FuelStationService } from './fuel-station.service.js';
import { PrismaFuelDocumentRepository } from './prisma-fuel-document.repository.js';
import { PrismaFuelStationRepository } from './prisma-fuel-station.repository.js';
import { PrismaFuelRepository } from './prisma-fuel.repository.js';

/**
 * C2 — NHAP HOA DON DIEN TU TREN POSTGRES THAT (Lane C, Issue #236).
 *
 * ===========================================================================
 * VI SAO PHAI LA POSTGRES THAT
 *
 * Bon thu quan trong nhat cua C2 song o RANH GIOI voi CSDL, va kho trong bo nho se XANH ca khi
 * khong cai nao ton tai:
 *
 *   · `recordDocument` la MOT GIAO DICH — chung tu va ung vien ra doi cung nhau hoac khong ai ra doi;
 *   · 13 `CHECK` cua migration, dac biet `station_match_paired` va `candidate_count_matches_status`;
 *   · hai khoa chong nhap trung;
 *   · `DECIMAL(12,3)` <-> so nguyen ty le 3 di qua CHUOI, khong qua `Number`.
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'Nhap hoa don dien tu tren Postgres THAT — C2',
  () => {
    const prisma = new PrismaService();
    const documents = new PrismaFuelDocumentRepository(prisma);
    const stations = new PrismaFuelStationRepository(prisma);
    const fuel = new PrismaFuelRepository(prisma);
    const audit = new AuditLogService(new InMemoryAuditLogRepository());

    const service = new FuelDocumentService(
      documents,
      new XmlFuelInvoiceSource(),
      new FuelStationService(stations, fuel, audit),
      fuel,
      audit,
    );

    /**
     * Tien to fixture RIENG cua C2 — KHONG long nhau voi `IT-C1-CX` (C1) hay `IT-T4-CX` (T4).
     *
     * Ca ba ham don deu dung `startsWith`, nen mot tien to la tien to cua cai kia se lam bai nay
     * xoa mat fixture cua bai kia — va lo ra CHI khi chay ca thu muc.
     */
    const SUPPLIER_CODE = 'IT-C2-CX';
    /** Ma so thue rieng cua bai nay, de khong noi nham vao mot ho so cua bai khac. */
    const TAX_CODE = '0102222333';
    const state = { supplierId: '' };

    const FIXTURE = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '__fixtures__/hoa-don-dien-tu-mau.xml'),
      'utf8',
    );

    const invoiceWith = (options: { number?: string; station?: string }): string =>
      `<?xml version="1.0" encoding="UTF-8"?>
<HDon><DLHDon><TTChung><KHHDon>C26IT2</KHHDon><SHDon>${options.number ?? '900001'}</SHDon>
<NLap>2026-09-05</NLap></TTChung>
<NDHDon><NBan><MST>${TAX_CODE}</MST>
<Ten>${options.station ?? 'Cua hang IT C2'}</Ten></NBan>
<DSHHDVu><HHDVu><SLuong>62.5</SLuong><DGia>23000</DGia><ThTien>1437500</ThTien></HHDVu></DSHHDVu>
</NDHDon></DLHDon></HDon>`;

    const fileOf = (xml: string, sourceRef = 'it-c2.xml'): FuelInvoiceFile => ({
      sourceRef,
      kind: 'EINVOICE_XML',
      content: Buffer.from(xml, 'utf8'),
    });

    async function cleanup(): Promise<void> {
      const suppliers = await prisma.transportFuelSupplier.findMany({
        where: { code: { startsWith: SUPPLIER_CODE } },
        select: { id: true },
      });
      const supplierIds = suppliers.map((row) => row.id);

      // Chung tu cua bai nay duoc nhan ra qua MST doc tu hoa don — ke ca nhung chung tu KHONG noi
      // duoc nha cung cap nao (`supplierId` = null), von la mot phan cac bai duoi day.
      const docs = await prisma.transportFuelDocument.findMany({
        where: { OR: [{ supplierId: { in: supplierIds } }, { sellerTaxCodeRaw: TAX_CODE }] },
        select: { id: true },
      });
      const docIds = docs.map((row) => row.id);
      await prisma.transportFuelCandidate.deleteMany({ where: { documentId: { in: docIds } } });
      // `duplicateOfId` la khoa ngoai `RESTRICT` tro noi bo, nen ban SAO phai di truoc ban GOC.
      await prisma.transportFuelDocument.deleteMany({
        where: { id: { in: docIds }, duplicateOfId: { not: null } },
      });
      await prisma.transportFuelDocument.deleteMany({ where: { id: { in: docIds } } });

      const rows = await prisma.transportFuelStation.findMany({
        where: { supplierId: { in: supplierIds } },
        select: { id: true },
      });
      await prisma.transportFuelStationAlias.deleteMany({
        where: { stationId: { in: rows.map((row) => row.id) } },
      });
      await prisma.transportFuelStation.deleteMany({ where: { supplierId: { in: supplierIds } } });
      await prisma.transportFuelSupplier.deleteMany({ where: { id: { in: supplierIds } } });
    }

    beforeAll(async () => {
      await cleanup();
      const at = new Date('2026-09-08T00:00:00.000Z');
      const supplier = await prisma.transportFuelSupplier.create({
        data: {
          name: 'C2 nha cung cap',
          code: `${SUPPLIER_CODE}-A`,
          taxCode: TAX_CODE,
          createdAt: at,
          updatedAt: at,
        },
      });
      state.supplierId = supplier.id;
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    const ACTOR = 'IT-C2-ke-toan';

    it('C2-INT-01 — chung tu + ba ung vien ra doi trong MOT giao dich, doc lai dung so lieu', async () => {
      const detail = await service.ingest(fileOf(FIXTURE, 'mau-day-du.xml'), ACTOR);

      expect(detail.document.status).toBe('PARSED');
      expect(detail.document.candidateCount).toBe(3);
      expect(detail.candidates).toHaveLength(3);

      // `DECIMAL(12,3)` <-> so nguyen ty le 3, di ca hai chieu ma khong mat chu so nao.
      const [first] = detail.candidates;
      expect(first?.litersUnits).toBe(62_500);
      expect(first?.unitPriceUnits).toBe(23_000_000);
      expect(first?.amount).toBe(1_437_500);
      expect(first?.issuedDate).toBe('2026-09-05');
    });

    it('C2-INT-02 — doc lai bang mot lan truy van MOI cho ra dung ung vien da ghi', async () => {
      const detail = await service.ingest(fileOf(invoiceWith({ number: '900002' })), ACTOR);
      const reread = await service.documentDetail(detail.document.id);

      expect(reread.candidates).toHaveLength(1);
      expect(reread.candidates[0]?.litersUnits).toBe(62_500);
      expect(reread.candidates[0]?.provenance.sellerTaxCode?.raw).toBe(TAX_CODE);
    });

    it('C2-INT-03 — nha cung cap duoc noi qua ma so thue', async () => {
      const detail = await service.ingest(fileOf(invoiceWith({ number: '900003' })), ACTOR);
      expect(detail.document.supplierId).toBe(state.supplierId);
    });

    it('C2-INT-04 — dung TEP do gui lai khong ghi them hang nao', async () => {
      const xml = invoiceWith({ number: '900004' });
      const first = await service.ingest(fileOf(xml), ACTOR);
      const again = await service.ingest(fileOf(xml, 'ten-khac.xml'), ACTOR);

      expect(again.document.id).toBe(first.document.id);
      expect(
        await prisma.transportFuelCandidate.count({
          where: { invoiceNo: '900004', sellerTaxCode: TAX_CODE },
        }),
      ).toBe(1);
    });

    it('C2-INT-05 — cung hoa don tu TEP KHAC ra `DUPLICATE`, khong ghi ung vien thu hai', async () => {
      const first = await service.ingest(fileOf(invoiceWith({ number: '900005' })), ACTOR);
      const twin = await service.ingest(
        fileOf(`${invoiceWith({ number: '900005' })} `, 'ban-ky-lai.xml'),
        ACTOR,
      );

      expect(twin.document.status).toBe('DUPLICATE');
      expect(twin.document.duplicateOfId).toBe(first.document.id);
      expect(
        await prisma.transportFuelCandidate.count({
          where: { invoiceNo: '900005', sellerTaxCode: TAX_CODE },
        }),
      ).toBe(1);
    });

    it('C2-INT-06 — chung tu khong doc duoc VAN duoc luu, kem ly do co ten', async () => {
      const detail = await service.ingest(fileOf('<BangKe/>', 'khong-phai-hoa-don.xml'), ACTOR);

      expect(detail.document.status).toBe('REJECTED');
      expect(detail.document.rejectReason).toBe('NOT_AN_INVOICE');
      const row = await prisma.transportFuelDocument.findUnique({
        where: { id: detail.document.id },
      });
      expect(row?.candidateCount).toBe(0);
    });

    /**
     * `CHECK TransportFuelCandidate_station_match_paired` — `RESOLVED` la ket cuc DUY NHAT co tram.
     *
     * Do bang mot lan ghi THANG xuong DB, khong qua service: cai can chung minh la DB TU CHOI, chu
     * khong phai service khong bao gio gui.
     */
    it('C2-INT-07 — DB tu choi mot ung vien `NO_MATCH` lai mang `stationId`', async () => {
      const station = await stations.createStation({
        supplierId: state.supplierId,
        name: 'Tram C2',
        nameNormalized: 'TRAM C2',
        code: null,
        codeNormalized: null,
        address: null,
        latitudeE7: null,
        longitudeE7: null,
        geofenceRadiusM: null,
        status: 'ACTIVE',
        note: null,
        at: new Date('2026-09-08T00:00:00.000Z'),
      });
      const host = await service.ingest(fileOf(invoiceWith({ number: '900007' })), ACTOR);

      await expect(
        prisma.transportFuelCandidate.create({
          data: {
            documentId: host.document.id,
            lineNumber: 99,
            sellerTaxCode: TAX_CODE,
            invoiceSymbol: 'C26IT2',
            invoiceNo: '900007-x',
            stationMatch: 'NO_MATCH',
            stationId: station.id,
            provenance: {},
          },
        }),
      ).rejects.toThrow();
    });

    it('C2-INT-08 — DB tu choi mot goi y bien so khong ghi nguon', async () => {
      const host = await service.ingest(fileOf(invoiceWith({ number: '900008' })), ACTOR);

      await expect(
        prisma.transportFuelCandidate.create({
          data: {
            documentId: host.document.id,
            lineNumber: 98,
            sellerTaxCode: TAX_CODE,
            invoiceSymbol: 'C26IT2',
            invoiceNo: '900008-x',
            stationMatch: 'NO_INPUT',
            plateHintRaw: '29C-123.45',
            provenance: {},
          },
        }),
      ).rejects.toThrow();
    });

    it.each([
      ['REJECTED khong ly do', { status: 'REJECTED' as const, rejectReason: null }],
      ['PARSED co ly do tu choi', { status: 'PARSED' as const, rejectReason: 'EMPTY' as const }],
      ['DUPLICATE khong soi day', { status: 'DUPLICATE' as const, rejectReason: null }],
    ])('C2-INT-09 — DB tu choi chung tu: %s', async (label, patch) => {
      await expect(
        prisma.transportFuelDocument.create({
          data: {
            kind: 'EINVOICE_XML',
            sourceRef: `khong-hop-le-${label}.xml`,
            contentDigest: `${'c'.repeat(56)}${label.length.toString(16).padStart(8, '0')}`,
            byteSize: 10,
            sellerTaxCodeRaw: TAX_CODE,
            candidateCount: 0,
            receivedBy: ACTOR,
            ...patch,
          },
        }),
      ).rejects.toThrow();
    });

    it('C2-INT-10 — dau van tay phai la SHA-256 viet thuong', async () => {
      await expect(
        prisma.transportFuelDocument.create({
          data: {
            kind: 'EINVOICE_XML',
            sourceRef: 'dau-van-tay-rac.xml',
            contentDigest: 'KHONG-PHAI-SHA256',
            byteSize: 10,
            sellerTaxCodeRaw: TAX_CODE,
            status: 'REJECTED',
            rejectReason: 'EMPTY',
            candidateCount: 0,
            receivedBy: ACTOR,
          },
        }),
      ).rejects.toThrow();
    });

    /**
     * PHAN "KHONG PHA T4": bang phieu do dau KHONG bi C2 dung toi.
     *
     * Sau tat ca cac lan nhap o tren, `TransportFuelEntry` cua nha cung cap nay phai VAN RONG — mot
     * ung vien khong bao gio tu tro thanh mot phieu do dau.
     */
    it('C2-INT-11 — nhap chung tu KHONG tao mot phieu do dau nao', async () => {
      expect(
        await prisma.transportFuelEntry.count({ where: { supplierId: state.supplierId } }),
      ).toBe(0);
    });
  },
);
