import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MAX_UNIT_PRICE_UNITS,
  parseEInvoiceXml,
  parseInvoiceAmount,
  parseInvoiceIssuedAt,
  parseXsdScaled,
  type ParsedInvoice,
} from './fuel-einvoice-parse.js';
import { LITERS_SCALE, MAX_LITERS_UNITS, litersToUnits } from './fuel-quantity.js';

/**
 * `E-INV-01`..`E-INV-22` — doc mot hoa don dien tu xang dau (Lane C / C2, Issue #236).
 *
 * Bo test nay do dung mot cau: he thong doc so lieu tren chung tu ma KHONG doan mot ky tu nao, va
 * khi mot o khong doc duoc thi no noi ro o nao — thay vi lam tron, bo qua, hay danh roi ca chung tu.
 */

const FIXTURE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '__fixtures__/hoa-don-dien-tu-mau.xml'),
  'utf8',
);

/** Mot hoa don toi thieu — dung de doi DUNG MOT manh trong tung bai. */
const invoiceWith = (options: {
  identity?: string;
  items?: string;
  general?: string;
}): string => `<?xml version="1.0" encoding="UTF-8"?>
<HDon><DLHDon><TTChung>${
  options.identity ?? '<KHHDon>C26TAA</KHHDon><SHDon>00001234</SHDon>'
}${options.general ?? ''}</TTChung>
<NDHDon><NBan><MST>0101234567</MST></NBan>
<DSHHDVu>${
  options.items ??
  '<HHDVu><THHDVu>Dau DO</THHDVu><DVTinh>Lit</DVTinh><SLuong>10</SLuong><DGia>23000</DGia><ThTien>230000</ThTien></HHDVu>'
}</DSHHDVu></NDHDon></DLHDon></HDon>`;

const parsedOk = (xml: string): ParsedInvoice => {
  const result = parseEInvoiceXml(xml);
  if (!result.ok) throw new Error(`dang le phai doc duoc, nhan: ${result.reason}`);
  return result.invoice;
};

const rejectedWith = (xml: string): string => {
  const result = parseEInvoiceXml(xml);
  if (result.ok) throw new Error('dang le phai bi tu choi');
  return result.reason;
};

describe('parseEInvoiceXml — chung tu mau day du', () => {
  it('E-INV-01 — doc ra danh tinh hoa don va ba dong hang', () => {
    const invoice = parsedOk(FIXTURE);

    expect(invoice.symbol).toBe('C26TAA');
    expect(invoice.number).toBe('00001234');
    expect(invoice.template).toBe('1');
    expect(invoice.sellerTaxCode).toBe('0101234567');
    expect(invoice.issuedDate).toBe('2026-09-05');
    expect(invoice.currencyCode).toBe('VND');
    expect(invoice.lines).toHaveLength(3);
  });

  /**
   * `62.5` la 62,5 lit. Day la cho quy uoc doc NGUOC HAN bang ke CSV, va bai nay khoa no lai: neu
   * ai do "thong nhat" hai duong doc lam mot, con so nay se thanh 62.500 lit.
   */
  it('E-INV-02 — dau CHAM trong XML la dau thap phan', () => {
    const [first] = parsedOk(FIXTURE).lines;
    expect(first?.litersUnits).toBe(62_500);
    expect(first?.unitPriceUnits).toBe(23_000_000);
    expect(first?.amount).toBe(1_437_500);
  });

  it('E-INV-03 — dong khong phai nhien lieu VAN duoc nhap, don vi giu nguyen', () => {
    const line = parsedOk(FIXTURE).lines[2];
    expect(line?.itemName).toBe('Nước uống đóng chai');
    expect(line?.unit).toBe('Chai');
    expect(line?.litersUnits).toBe(2_000);
  });

  /** Ten hang chua dau phay (`Dau DO 0,05S-II`) khong duoc ro ri vao mot con so nao. */
  it('E-INV-04 — so trong TEN HANG khong di ra thanh so lieu', () => {
    const [first] = parsedOk(FIXTURE).lines;
    expect(first?.itemName).toBe('Dầu DO 0,05S-II');
    expect(first?.litersUnits).toBe(62_500);
  });

  it('E-INV-05 — `TTKhac` doc ra bang ten-gia tri, gom ca goi y bien so', () => {
    expect(parsedOk(FIXTURE).extensions).toEqual({
      BienSoXe: '29C-123.45',
      MaCuaHang: 'CH-05',
      SoCongTo: '07',
    });
  });

  it('E-INV-06 — vet xuat xu chi ra dung duong dan XML va chuoi nguyen ban', () => {
    const invoice = parsedOk(FIXTURE);
    expect(invoice.provenance.sellerTaxCode).toEqual({
      path: 'HDon/DLHDon/NDHDon/NBan/MST',
      raw: '0101234567',
    });
    expect(invoice.lines[0]?.provenance.litersUnits).toEqual({
      path: 'HDon/DLHDon/NDHDon/DSHHDVu/HHDVu[1]/SLuong',
      raw: '62.5',
    });
  });
});

describe('parseEInvoiceXml — mot o khong doc duoc khong lam hong ca chung tu', () => {
  /**
   * `62,5` (dau PHAY) khong dung dang `xs:decimal`. Doan tiep se cho ra 625 hoac 0,625 — sai muoi
   * hoac mot tram lan, va con so sai do di thang vao phep kiem `so lit x don gia ~ thanh tien`.
   */
  it('E-INV-07 — dau PHAY o `SLuong` bi tu choi CO TEN, dong van duoc giu', () => {
    const [line] = parsedOk(
      invoiceWith({
        items:
          '<HHDVu><THHDVu>Dau DO</THHDVu><SLuong>62,5</SLuong><DGia>23000</DGia><ThTien>1437500</ThTien></HHDVu>',
      }),
    ).lines;

    expect(line?.litersUnits).toBeNull();
    expect(line?.provenance.litersUnits).toEqual({
      path: 'HDon/DLHDon/NDHDon/DSHHDVu/HHDVu[1]/SLuong',
      raw: '62,5',
      unreadable: true,
    });
    // ...va cac o KHAC cua chinh dong do van doc duoc binh thuong.
    expect(line?.amount).toBe(1_437_500);
  });

  it('E-INV-08 — `1.500` la mot nghin ruoi mililit, khong phai mot nghin nam tram lit', () => {
    const [line] = parsedOk(
      invoiceWith({ items: '<HHDVu><SLuong>1.500</SLuong><ThTien>34500</ThTien></HHDVu>' }),
    ).lines;
    expect(line?.litersUnits).toBe(1_500);
  });

  it('E-INV-09 — qua ba chu so thap phan thi TU CHOI, khong lam tron', () => {
    const [line] = parsedOk(
      invoiceWith({ items: '<HHDVu><SLuong>62.5001</SLuong><ThTien>1437500</ThTien></HHDVu>' }),
    ).lines;
    expect(line?.litersUnits).toBeNull();
  });

  it('E-INV-10 — so tien co phan thap phan khac khong bi tu choi (`GD-03`)', () => {
    const [line] = parsedOk(
      invoiceWith({ items: '<HHDVu><SLuong>10</SLuong><ThTien>1437500.50</ThTien></HHDVu>' }),
    ).lines;
    expect(line?.amount).toBeNull();

    // `1437500.00` thi doc duoc — phan thap phan toan so khong khong lam doi con so nao.
    const [zeroed] = parsedOk(
      invoiceWith({ items: '<HHDVu><SLuong>10</SLuong><ThTien>1437500.00</ThTien></HHDVu>' }),
    ).lines;
    expect(zeroed?.amount).toBe(1_437_500);
  });

  it('E-INV-11 — ngay dung khuon nhung khong co that ra `null` kem vet `unreadable`', () => {
    const invoice = parsedOk(invoiceWith({ general: '<NLap>2026-02-30</NLap>' }));
    expect(invoice.issuedDate).toBeNull();
    expect(invoice.provenance.issuedDate?.unreadable).toBe(true);
  });

  it('E-INV-12 — `NLap` co gio thi giu phan gio NGUYEN BAN, khong doi thanh khoanh khac', () => {
    const invoice = parsedOk(invoiceWith({ general: '<NLap>2026-09-05T14:30:00</NLap>' }));
    expect(invoice.issuedDate).toBe('2026-09-05');
    expect(invoice.issuedTimeRaw).toBe('14:30:00');
  });

  /** `00001234` la mot CHUOI. Doi no thanh so se lam so hoa don doi gia tri. */
  it('E-INV-13 — so hoa don giu nguyen so khong dau dong', () => {
    expect(parsedOk(invoiceWith({})).number).toBe('00001234');
  });

  it('E-INV-14 — mot dong hang duy nhat van ra mot mang mot phan tu', () => {
    expect(parsedOk(invoiceWith({})).lines).toHaveLength(1);
  });
});

describe('parseEInvoiceXml — nam duong tu choi CA chung tu', () => {
  it('E-INV-15 — the dong thieu ra `MALFORMED_XML`, khong ra mot cay mot phan', () => {
    expect(rejectedWith('<HDon><DLHDon><TTChung></HDon>')).toBe('MALFORMED_XML');
  });

  it('E-INV-16 — tep khac goc ra `NOT_AN_INVOICE`', () => {
    expect(rejectedWith('<BangKe><Dong>1</Dong></BangKe>')).toBe('NOT_AN_INVOICE');
  });

  it.each([
    ['thieu ky hieu', '<SHDon>00001234</SHDon>'],
    ['thieu so hoa don', '<KHHDon>C26TAA</KHHDon>'],
  ])('E-INV-17 — %s ra `MISSING_INVOICE_IDENTITY`', (_label, identity) => {
    expect(rejectedWith(invoiceWith({ identity }))).toBe('MISSING_INVOICE_IDENTITY');
  });

  it('E-INV-18 — thieu MST nguoi ban cung ra `MISSING_INVOICE_IDENTITY`', () => {
    expect(rejectedWith(invoiceWith({}).replace('<MST>0101234567</MST>', ''))).toBe(
      'MISSING_INVOICE_IDENTITY',
    );
  });

  it('E-INV-19 — hoa don khong dong hang ra `NO_LINE_ITEMS`', () => {
    expect(rejectedWith(invoiceWith({ items: '' }))).toBe('NO_LINE_ITEMS');
  });
});

/**
 * AN TOAN KHI DOC XML — hai bai duoi day do HANH VI THAT cua bo doc, khong do mot loi hua.
 *
 * Ca hai deu la duong tan cong kinh dien cua moi bo phan tich XML, va ca hai deu den tu mot tep ma
 * NGUOI KHAC gui vao he thong.
 */
describe('parseEInvoiceXml — chung tu doc hai', () => {
  it('E-INV-20 — tham chieu thuc the NGOAI bi tu choi, khong doc tep nao cua may chu', () => {
    const xxe = `<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]>
<HDon><DLHDon><TTChung><KHHDon>&x;</KHHDon><SHDon>1</SHDon></TTChung>
<NDHDon><NBan><MST>0101234567</MST></NBan><DSHHDVu><HHDVu><SLuong>1</SLuong></HHDVu></DSHHDVu></NDHDon>
</DLHDon></HDon>`;
    expect(rejectedWith(xxe)).toBe('EXTERNAL_ENTITY_REJECTED');
  });

  it('E-INV-21 — thuc the long nhau ("billion laughs") khong no ra', () => {
    const laughs = `<?xml version="1.0"?><!DOCTYPE l [
<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">
<!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">]>
<HDon><DLHDon><TTChung><KHHDon>&c;</KHHDon><SHDon>1</SHDon></TTChung>
<NDHDon><NBan><MST>0101234567</MST></NBan><DSHHDVu><HHDVu><SLuong>1</SLuong></HHDVu></DSHHDVu></NDHDon>
</DLHDon></HDon>`;
    // Khong no ra nghia la: hoac tu choi, hoac doc duoc voi mot chuoi NGAN. Ca hai deu chap nhan
    // duoc; cai KHONG chap nhan duoc la mot ket qua hang trieu ky tu.
    expect(JSON.stringify(parseEInvoiceXml(laughs)).length).toBeLessThan(2_000);
  });
});

/**
 * SOI DAY giua `parseXsdScaled` va `litersToUnits`.
 *
 * Hai ban song o hai tep vi chung so huu hai thu khac nhau — mot ben la SO LUONG NHIEN LIEU cua
 * mien, mot ben la DANG TU VUNG cua XML. Nhung tren nhung dau vao ma CA HAI deu nhan, chung phai
 * cho ra cung mot con so; neu khong, mot phieu nhap tay va mot hoa don dien tu cua CUNG mot lan do
 * dau se mang hai so lit khac nhau.
 */
describe('E-INV-22 — hai phep doc so lit dong y voi nhau', () => {
  it.each(['1', '10', '62.5', '0.001', '1.500', '999.999'])('%s', (raw) => {
    expect(parseXsdScaled(raw, LITERS_SCALE, MAX_LITERS_UNITS)).toBe(litersToUnits(raw));
  });

  it('va ca hai deu tu choi qua ba chu so thap phan', () => {
    expect(parseXsdScaled('1.2345', LITERS_SCALE, MAX_LITERS_UNITS)).toBeNull();
    expect(() => litersToUnits('1.2345')).toThrow();
  });
});

describe('E-INV-23 — bien cua cac ham doc so', () => {
  it('so khong va so am deu bi tu choi', () => {
    expect(parseXsdScaled('0', LITERS_SCALE, MAX_LITERS_UNITS)).toBeNull();
    expect(parseXsdScaled('-1', LITERS_SCALE, MAX_LITERS_UNITS)).toBeNull();
    expect(parseInvoiceAmount('0')).toBeNull();
    expect(parseInvoiceAmount('-100')).toBeNull();
  });

  it('vuot tran thi tu choi thay vi tran ngam', () => {
    expect(parseXsdScaled('9999999999999', LITERS_SCALE, MAX_UNIT_PRICE_UNITS)).toBeNull();
  });

  it('chuoi rong va chuoi khong phai so deu ra `null`', () => {
    expect(parseInvoiceAmount('')).toBeNull();
    expect(parseInvoiceAmount('1,9tr')).toBeNull();
    expect(parseInvoiceIssuedAt('khong phai ngay')).toEqual({ date: null, time: null });
  });
});
