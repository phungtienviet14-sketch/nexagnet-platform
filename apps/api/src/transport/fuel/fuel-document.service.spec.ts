import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { InMemoryFuelDocumentRepository } from './fuel-document.repository.js';
import { FuelDocumentService } from './fuel-document.service.js';
import { XmlFuelInvoiceSource, type FuelInvoiceFile } from './fuel-invoice-source.js';
import { StubFuelReceiptExtractor } from './fuel-receipt-extraction.stub.js';
import { InMemoryFuelStationRepository } from './fuel-station.repository.js';
import { FuelStationService } from './fuel-station.service.js';
import { TransportFuelCoreFacts, type FuelVehicleFacts } from './fuel.ports.js';
import { InMemoryFuelRepository } from './in-memory-fuel.repository.js';
import type { TransportCorePolicy } from '../transport-policy.js';

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

/**
 * Cong DOC sang `transport-core`, dung du cho duong ra soat.
 *
 * Chi `listVehicles()` co than: duong ra soat cua C4 doc danh muc xe de doi chieu GOI Y bien so.
 * Nam ham con lai nem — neu mot lan sua sau nay goi chung tu day, bai test se noi ngay thay vi tra
 * ve mot mang rong va lam phep kiem im lang.
 */
class FleetOnlyCoreFacts extends TransportFuelCoreFacts {
  constructor(private readonly plates: readonly string[]) {
    super();
  }
  async listVehicles(): Promise<FuelVehicleFacts[]> {
    return this.plates.map((registrationPlate, index) => ({
      id: `xe-${index}`,
      registrationPlate,
      vehicleClass: 'DAU_KEO',
    }));
  }
  async findTrip(): Promise<never> {
    throw new Error('duong ra soat khong duoc doc chuyen');
  }
  async findTripByCode(): Promise<never> {
    throw new Error('duong ra soat khong duoc doc chuyen');
  }
  async listDrivers(): Promise<never> {
    throw new Error('duong ra soat khong duoc doc lai xe');
  }
  async findVehicle(): Promise<never> {
    throw new Error('duong ra soat chi doc CA danh sach xe');
  }
  async findDriver(): Promise<never> {
    throw new Error('duong ra soat khong duoc doc lai xe');
  }
  async findDriverByAuthUserId(): Promise<never> {
    throw new Error('duong ra soat khong duoc doc lai xe');
  }
  async wasDriverEverAssignedToTrip(): Promise<never> {
    throw new Error('duong ra soat khong duoc doc phan cong');
  }
  async wasVehicleEverAssignedToTrip(): Promise<never> {
    throw new Error('duong ra soat khong duoc doc phan cong');
  }
}

const CORE_POLICY: TransportCorePolicy = { timeZone: 'Asia/Ho_Chi_Minh' };

const buildService = (
  fuel: InMemoryFuelRepository,
  documents = new InMemoryFuelDocumentRepository(),
): FuelDocumentService =>
  new FuelDocumentService(
    documents,
    new XmlFuelInvoiceSource(),
    new StubFuelReceiptExtractor(),
    new FuelStationService(
      new InMemoryFuelStationRepository(),
      fuel,
      new AuditLogService(new InMemoryAuditLogRepository()),
    ),
    fuel,
    new FleetOnlyCoreFacts(['29C-123.45']),
    CORE_POLICY,
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

describe('FuelDocumentService — duong RA SOAT (C4)', () => {
  let service: FuelDocumentService;

  beforeEach(() => {
    service = buildService(new InMemoryFuelRepository());
  });

  /**
   * Hoa don mau co bien so `29C-123.45` (khop doi xe gia lap), nhung KHONG noi duoc nha cung cap
   * (kho rong) va KHONG nhan ra tram. Nen mot ung vien sach ve so hoc van co phat hien — va do la
   * cau tra loi TRUNG THUC, khong phai mot loi.
   */
  it('DOC-17 — moi ung vien di kem ket qua kiem tat dinh cua chinh no', async () => {
    const ingested = await service.ingest(fileOf(FIXTURE), ACTOR);
    const review = await service.documentReview(ingested.document.id);

    expect(review.candidates).toHaveLength(3);
    for (const row of review.candidates) {
      expect(row.candidate.id).toBeDefined();
      expect(['NO_FINDINGS', 'HAS_FINDINGS']).toContain(row.assessment.outcome);
    }
  });

  it('DOC-18 — chua noi duoc nha cung cap va chua nhan ra tram deu noi ra thanh phat hien', async () => {
    const ingested = await service.ingest(fileOf(FIXTURE), ACTOR);
    const review = await service.documentReview(ingested.document.id);
    const findings = review.candidates[0]?.assessment.findings.map((entry) => entry.finding) ?? [];

    expect(findings).toContain('SUPPLIER_UNLINKED');
    expect(findings).toContain('STATION_UNRESOLVED');
    // Bien so tren hoa don mau KHOP doi xe gia lap, nen hai ma bien so deu khong duoc keu.
    expect(findings).not.toContain('PLATE_HINT_ABSENT');
    expect(findings).not.toContain('PLATE_HINT_UNKNOWN_VEHICLE');
  });

  it('DOC-19 — dong khong phai nhien lieu duoc danh dau, khong bi loc khoi ket qua', async () => {
    const ingested = await service.ingest(fileOf(FIXTURE), ACTOR);
    const review = await service.documentReview(ingested.document.id);
    const water = review.candidates[2];

    expect(water?.candidate.unitRaw).toBe('Chai');
    expect(water?.assessment.findings.map((entry) => entry.finding)).toContain('UNIT_NOT_LITRES');
  });

  /** Phat hien duoc TINH LUC DOC, nen doc lai hai lan phai cho ra dung mot ket qua. */
  it('DOC-20 — doc lai lan hai cho ra dung ket qua do', async () => {
    const ingested = await service.ingest(fileOf(FIXTURE), ACTOR);
    const first = await service.documentReview(ingested.document.id);
    const second = await service.documentReview(ingested.document.id);

    expect(JSON.stringify(second.candidates.map((row) => row.assessment))).toBe(
      JSON.stringify(first.candidates.map((row) => row.assessment)),
    );
  });
});

/**
 * CUA VAO THU HAI — MOT BUC ANH (C3).
 *
 * Bo nay do dieu quan trong nhat cua ca tranche: duong anh dung LAI toan bo phan sau cua duong
 * XML. Cung bang, cung phep chong nhap trung, cung man hinh ra soat. Neu mot ngay nao do co nguoi
 * tach hai duong ra, nhung bai nay se do chu khong lang le troi.
 */
describe('FuelDocumentService — nhap mot BUC ANH (C3)', () => {
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const photo = (content = JPEG, sourceRef = 'phieu-01.jpg') => ({
    sourceRef,
    mediaType: 'image/jpeg',
    content,
  });

  let documents: InMemoryFuelDocumentRepository;
  let service: FuelDocumentService;

  beforeEach(() => {
    documents = new InMemoryFuelDocumentRepository();
    service = buildService(new InMemoryFuelRepository(), documents);
  });

  it('DOC-21 — mot buc anh doc duoc ra `PARSED`, va `kind` noi ro no den tu dau', async () => {
    const detail = await service.ingestReceiptImage(photo(), ACTOR);

    expect(detail.document.status).toBe('PARSED');
    expect(detail.document.kind).toBe('RECEIPT_IMAGE');
    expect(detail.candidates).toHaveLength(1);
  });

  /**
   * MUC TIN LA THU DUY NHAT PHAN BIET HAI DUONG.
   *
   * Doi xung nay la ca thiet ke: `null` khong phai "chua do duoc" ma la "cau hoi nay khong ap dung".
   * Neu duong XML mot ngay nao do bat dau mang `confidence`, mot nguoi doc man hinh ra soat se
   * khong con phan biet duoc con so nao MAY DOAN voi con so nao NGUOI BAN DA KY.
   */
  it('DOC-22 — ung vien tu ANH mang bang muc tin; ung vien tu XML mang `null`', async () => {
    const fromImage = await service.ingestReceiptImage(photo(), ACTOR);
    const fromXml = await service.ingest(fileOf(FIXTURE), ACTOR);

    expect(fromImage.candidates[0]?.confidence).not.toBeNull();
    expect(fromXml.candidates[0]?.confidence).toBeNull();
  });

  it('DOC-23 — muc tin duoc CAT theo tung dong, khong de nguyen bang cua ca hoa don', async () => {
    const detail = await service.ingestReceiptImage(photo(), ACTOR);
    const keys = Object.keys(detail.candidates[0]?.confidence ?? {});

    expect(keys).toContain('line.1.unitPriceMilli');
    expect(keys.filter((key) => key.startsWith('line.') && !key.startsWith('line.1.'))).toEqual([]);
  });

  /**
   * LOP MOT cua `INV-C2-DUP` tren duong anh — va o day no dat gia hon han.
   *
   * Tren duong XML, mot lan gui lai chi ton mot lan phan tich trong bo nho. Tren duong anh, no ton
   * MOT LAN GOI MO HINH: tien that, thoi gian that. Phep kiem bam byte chay TRUOC khi goi, nen
   * cung mot buc anh gui lai khong tra them mot dong nao.
   */
  it('DOC-24 — dung buc anh do gui lai lan hai tra lai ban cu, khong ghi them', async () => {
    const first = await service.ingestReceiptImage(photo(), ACTOR);
    const again = await service.ingestReceiptImage(photo(JPEG, 'ten-khac.jpg'), ACTOR);

    expect(again.document.id).toBe(first.document.id);
    expect(again.document.sourceRef).toBe('phieu-01.jpg');
    expect(await documents.listDocuments({ supplierId: null, status: null, limit: 50, offset: 0 })).toHaveLength(1);
  });

  it('DOC-25 — mot tep KHONG PHAI ANH van duoc GHI LAI, kem ly do co ten', async () => {
    const html = Buffer.from('<!doctype html><html><body>khong phai anh</body></html>');
    const detail = await service.ingestReceiptImage(photo(html), ACTOR);

    expect(detail.document.status).toBe('REJECTED');
    expect(detail.document.rejectReason).toBe('UNSUPPORTED_MEDIA_TYPE');
    // Van co MOT hang: mot tep hong bien mat khong dau vet lam nguoi doi soat thay mot thang thieu
    // chung tu ma khong biet thieu bao nhieu.
    expect(detail.document.id).toBeTruthy();
    expect(detail.candidates).toEqual([]);
  });

  it('DOC-26 — duong ra soat noi ro o nao mo, chu khong mot con so trung binh', async () => {
    const ingested = await service.ingestReceiptImage(photo(), ACTOR);
    const review = await service.documentReview(ingested.document.id);
    const finding = review.candidates[0]?.assessment.findings.find(
      (entry) => entry.finding === 'FIELD_CONFIDENCE_BELOW_FLOOR',
    );

    expect(finding).toBeDefined();
    expect(finding?.detail?.fields).toBe('line.1.unitPriceMilli');
  });

  it('DOC-27 — ung vien tu XML KHONG bao gio mang phat hien muc tin thap', async () => {
    const ingested = await service.ingest(fileOf(FIXTURE), ACTOR);
    const review = await service.documentReview(ingested.document.id);

    for (const candidate of review.candidates) {
      expect(candidate.assessment.findings.map((entry) => entry.finding)).not.toContain(
        'FIELD_CONFIDENCE_BELOW_FLOOR',
      );
    }
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
