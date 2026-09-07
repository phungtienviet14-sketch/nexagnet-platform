import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { InMemoryFuelDocumentRepository } from './fuel-document.repository.js';
import { FuelDocumentService } from './fuel-document.service.js';
import { XmlFuelInvoiceSource, type FuelInvoiceFile } from './fuel-invoice-source.js';
import { InMemoryFuelStationRepository } from './fuel-station.repository.js';
import { FuelStationService } from './fuel-station.service.js';
import { InMemoryFuelRepository } from './in-memory-fuel.repository.js';

/**
 * `DOC-01`..`DOC-16` — nhap mot chung tu nhien lieu co cau truc (Lane C / C2, Issue #236).
 *
 * Bo test nay do hai thu:
 *
 *   1. BON KET CUC cua mot lan nhap deu duoc GHI NHAN va phan biet duoc — khong cai nao im lang;
 *   2. mot ung vien KHONG BAO GIO cham toi mot dong tien nao (`INV-C2-NOMONEY`).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(join(HERE, '__fixtures__/hoa-don-dien-tu-mau.xml'), 'utf8');
const ACTOR = 'nguoi-van-hanh';

const fileOf = (xml: string, sourceRef = 'hoa-don.xml'): FuelInvoiceFile => ({
  sourceRef,
  kind: 'EINVOICE_XML',
  content: Buffer.from(xml, 'utf8'),
});

/** Mot hoa don toi thieu, doi duoc ba manh danh tinh de dung cho cac bai chong trung. */
const invoiceWith = (options: { taxCode?: string; symbol?: string; number?: string }): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<HDon><DLHDon><TTChung><KHHDon>${options.symbol ?? 'C26TAA'}</KHHDon>
<SHDon>${options.number ?? '00001234'}</SHDon><NLap>2026-09-05</NLap></TTChung>
<NDHDon><NBan><MST>${options.taxCode ?? '0101234567'}</MST><Ten>Cua hang so 5</Ten></NBan>
<DSHHDVu><HHDVu><SLuong>10</SLuong><DGia>23000</DGia><ThTien>230000</ThTien></HHDVu></DSHHDVu>
</NDHDon></DLHDon></HDon>`;

const buildService = (
  fuel: InMemoryFuelRepository,
  documents = new InMemoryFuelDocumentRepository(),
): FuelDocumentService =>
  new FuelDocumentService(
    documents,
    new XmlFuelInvoiceSource(),
    new FuelStationService(
      new InMemoryFuelStationRepository(),
      fuel,
      new AuditLogService(new InMemoryAuditLogRepository()),
    ),
    fuel,
    new AuditLogService(new InMemoryAuditLogRepository()),
  );

describe('FuelDocumentService — bon ket cuc cua mot lan nhap', () => {
  let documents: InMemoryFuelDocumentRepository;
  let service: FuelDocumentService;

  beforeEach(() => {
    documents = new InMemoryFuelDocumentRepository();
    service = buildService(new InMemoryFuelRepository(), documents);
  });

  it('DOC-01 — hoa don doc duoc ra `PARSED` kem dung so ung vien', async () => {
    const detail = await service.ingest(fileOf(FIXTURE), ACTOR);

    expect(detail.document.status).toBe('PARSED');
    expect(detail.document.rejectReason).toBeNull();
    expect(detail.document.candidateCount).toBe(3);
    expect(detail.candidates).toHaveLength(3);
    expect(detail.document.sellerTaxCodeRaw).toBe('0101234567');
  });

  /**
   * LOP MOT cua `INV-C2-DUP`. Dung mot tep gui lai lan hai KHONG ghi mot hang nao — no tra lai
   * dung ban da nhap. Do la nghia hep cua "idempotent" o day, va no phai dung ke ca khi hop thu
   * chuyen tiep cung mot thu hai lan duoi hai cai ten khac nhau.
   */
  it('DOC-02 — dung TEP do gui lai lan hai tra lai ban cu, khong ghi them', async () => {
    const first = await service.ingest(fileOf(FIXTURE), ACTOR);
    const again = await service.ingest(fileOf(FIXTURE, 'ten-khac.xml'), ACTOR);

    expect(again.document.id).toBe(first.document.id);
    expect(again.document.sourceRef).toBe('hoa-don.xml');
    expect(
      await documents.listDocuments({ supplierId: null, status: null, limit: 50, offset: 0 }),
    ).toHaveLength(1);
  });

  /**
   * LOP HAI cua `INV-C2-DUP`. Cung mot HOA DON den bang HAI TEP khac nhau — dau van tay byte khong
   * bat duoc, khoa `(MST, ky hieu, so hoa don, dong)` moi bat duoc.
   */
  it('DOC-03 — cung hoa don tu mot TEP KHAC ra `DUPLICATE` kem soi day ve ban da nhap', async () => {
    const first = await service.ingest(fileOf(invoiceWith({})), ACTOR);
    // Cung danh tinh hoa don, byte khac (them mot khoang trang) -> dau van tay khac.
    const twin = await service.ingest(fileOf(`${invoiceWith({})} `, 'ban-ky-lai.xml'), ACTOR);

    expect(twin.document.status).toBe('DUPLICATE');
    expect(twin.document.duplicateOfId).toBe(first.document.id);
    expect(twin.document.candidateCount).toBe(0);
    expect(twin.candidates).toHaveLength(0);
  });

  it('DOC-04 — hoa don KHAC so thi khong phai ban sao', async () => {
    await service.ingest(fileOf(invoiceWith({ number: '00001234' })), ACTOR);
    const other = await service.ingest(fileOf(invoiceWith({ number: '00001235' })), ACTOR);
    expect(other.document.status).toBe('PARSED');
  });

  it.each([
    ['tep rong', '', 'EMPTY'],
    ['XML hong', '<HDon><DLHDon><TTChung></HDon>', 'MALFORMED_XML'],
    ['khong phai hoa don', '<BangKe><Dong>1</Dong></BangKe>', 'NOT_AN_INVOICE'],
  ])('DOC-05 — %s ra `REJECTED` voi ly do CO TEN, va van duoc luu', async (_l, xml, reason) => {
    const detail = await service.ingest(fileOf(xml), ACTOR);

    expect(detail.document.status).toBe('REJECTED');
    expect(detail.document.rejectReason).toBe(reason);
    expect(detail.document.candidateCount).toBe(0);
    // ...va hang VAN nam trong bang: mot tep hong bien mat khong dau vet lam nguoi doi soat thay
    // mot thang thieu chung tu ma khong biet thieu bao nhieu.
    expect((await service.documentDetail(detail.document.id)).document.id).toBe(detail.document.id);
  });

  it('DOC-06 — chung tu bi tu choi KHONG chiem khoa chong trung cua mot hoa don that', async () => {
    await service.ingest(fileOf('<BangKe/>'), ACTOR);
    const real = await service.ingest(fileOf(invoiceWith({})), ACTOR);
    expect(real.document.status).toBe('PARSED');
  });
});

describe('FuelDocumentService — noi chung tu voi nha cung cap', () => {
  const supplierWith = (fuel: InMemoryFuelRepository, taxCode: string, name: string) =>
    fuel.createSupplier({
      name,
      code: null,
      phone: null,
      address: null,
      taxCode,
      at: new Date('2026-09-01T00:00:00.000Z'),
    });

  it('DOC-07 — mot nha cung cap dung ma so thue thi duoc noi', async () => {
    const fuel = new InMemoryFuelRepository();
    const supplier = await supplierWith(fuel, '0101234567', 'Cong ty xang dau Mau');
    const detail = await buildService(fuel).ingest(fileOf(invoiceWith({})), ACTOR);

    expect(detail.document.supplierId).toBe(supplier.id);
  });

  it('DOC-08 — khong nha cung cap nao mang ma so thue do thi de TRONG, van nhap', async () => {
    const detail = await buildService(new InMemoryFuelRepository()).ingest(
      fileOf(invoiceWith({})),
      ACTOR,
    );

    expect(detail.document.supplierId).toBeNull();
    // Chung tu VAN duoc nhap: khong noi duoc ho so khong phai ly do vut mot to hoa don.
    expect(detail.document.status).toBe('PARSED');
    expect(detail.document.sellerTaxCodeRaw).toBe('0101234567');
  });

  /**
   * `TransportFuelSupplier.taxCode` KHONG unique, nen hai ho so cung ma so thue la mot tinh trang
   * co that. Chon dai mot cai se noi chung tu vao nham ho so, va sai lech do chi lo ra khi cong no
   * cua mot cay xang lech — sau khi da bao cao.
   */
  it('DOC-09 — HAI nha cung cap cung ma so thue thi de TRONG, khong chon dai', async () => {
    const fuel = new InMemoryFuelRepository();
    await supplierWith(fuel, '0101234567', 'Ho so A');
    await supplierWith(fuel, '0101234567', 'Ho so B (nhap trung)');

    const detail = await buildService(fuel).ingest(fileOf(invoiceWith({})), ACTOR);
    expect(detail.document.supplierId).toBeNull();
  });
});

/**
 * `DOC-16` — `INV-C2-NOMONEY`: KHONG DUONG TINH TIEN NAO BIET DEN UNG VIEN.
 *
 * ===========================================================================
 * VI SAO BAI NAY DOC MA NGUON THAY VI GOI MOT HAM
 *
 * Cai can chan la mot lan sua TUONG LAI: mot ung vien co day du so lit, don gia va thanh tien, nen
 * rat de co nguoi noi no thang vao gia thanh chuyen "cho nhanh". Lam vay se bo qua ca hai cong ma
 * `TX-04` dung de chan that thoat — lan duyet cua ke toan, va vong doi soat bang ke — va bo qua ca
 * cau hoi ma hoa don KHONG tra loi duoc: XE NAO.
 *
 * Khong mot bai test hanh vi nao bat duoc lan sua do truoc khi no xay ra. Mot bai doc ma nguon thi
 * co: ngay khi mot tep tinh tien nhac den tang ung vien, bai nay do.
 */
describe('DOC-16 — khong duong tinh tien nao doc ung vien', () => {
  const CANDIDATE_SYMBOLS = [
    'FuelCandidate',
    'transportFuelCandidate',
    'TransportFuelCandidate',
    'FuelDocumentService',
    'FuelDocumentRepository',
  ] as const;

  const moneyPaths = (): string[] => {
    const costingDir = resolve(HERE, '../costing');
    const costing = readdirSync(costingDir)
      .filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
      .map((name) => join(costingDir, name));
    return [
      join(HERE, 'fuel-settlement.ts'),
      join(HERE, 'fuel-reconciliation.service.ts'),
      join(HERE, 'fuel-matching.ts'),
      join(HERE, 'fuel.service.ts'),
      join(HERE, 'fuel.ports.ts'),
      join(HERE, 'fuel.repository.ts'),
      join(HERE, 'prisma-fuel.repository.ts'),
      ...costing,
    ];
  };

  it.each(moneyPaths())('%s khong nhac mot ten nao cua tang ung vien', (path) => {
    const source = readFileSync(path, 'utf8');
    expect(CANDIDATE_SYMBOLS.filter((symbol) => source.includes(symbol))).toEqual([]);
  });

  /**
   * Va chieu nguoc lai: service cua C2 khong duoc TIEM mot cong tinh tien nao.
   *
   * Do tren MA DA BO CHU THICH, khong tren van ban tho: chinh khoi chu thich dau tep giai thich
   * rang no khong dung `FuelCostingPort` va `CostingService`, nen mot phep so chuoi tho se do vi
   * dung cai cau noi rang no dung. Cai can do la MA — mot lenh `import`, mot tham so `constructor`.
   */
  it('service nhap chung tu khong TIEM mot cong tinh tien nao', () => {
    const code = readFileSync(join(HERE, 'fuel-document.service.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    expect(code).not.toContain('FuelCostingPort');
    expect(code).not.toContain('CostingService');
    expect(code).not.toMatch(/from '\.\.\/costing\//);
  });
});
