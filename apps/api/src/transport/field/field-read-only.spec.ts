import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * HAI DIEU KHONG DUOC TON TAI TREN MAN HINH HIEN TRUONG — `#279` O9.
 *
 * ============================================================================================
 *     1. KHONG mot loi goi GHI nao.
 *     2. KHONG mot truong TIEN nao.
 * ============================================================================================
 *
 * Ca hai la yeu cau ve thu KHONG DUOC CO, nen khong bai hanh vi nao chung minh duoc — cung khuon
 * `no-auto-profit-distribution.spec.ts` cua `TX-08`.
 *
 * Dieu thu nhat quan trong hon ve mat cau truc: `DriverFieldReadService` duoc tiem BON kho, va bon
 * kho do DEU CO ham ghi (`create`, `close`, `withdraw`, `decide`). Mot man hinh "xem viec" ma goi
 * duoc mot trong so do la mot man hinh se co luc ghi nham — va no se ghi duoi danh nghia mot lan
 * DOC, tuc khong ai di tim no o duong ghi.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const sourceFiles = readdirSync(HERE)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
  .sort();

const codeOf = (name: string): string => stripComments(readFileSync(join(HERE, name), 'utf8'));

describe('Man hinh hien truong CHI DOC — FD-020', () => {
  it('co du tep de quet', () => {
    expect(sourceFiles.length).toBeGreaterThan(4);
  });

  /**
   * Ten cua tung ham GHI tren bon kho ma dich vu nay cam. Chung la ten THAT — mot lan goi nham se
   * dung dung mot trong so do.
   */
  const WRITE_CALLS = [
    '.create(',
    '.close(',
    '.withdraw(',
    '.decide(',
    '.record(',
    '.recordAsDriver(',
    '.recordAsOperator(',
    '.recordAsOffice(',
    '.start(',
    '.propose(',
  ];

  for (const call of WRITE_CALLS) {
    it(`khong mot tep nao goi \`${call}\``, () => {
      const offenders = sourceFiles.filter((name) => codeOf(name).includes(call));
      expect(offenders, `\`${call}\` xuat hien o: ${offenders.join(', ')}`).toEqual([]);
    });
  }

  /**
   * `#279` O9: *"driver payload still excludes freight/revenue"*, va `INV-09` da dat quy tac do tu
   * truoc. Moi ten duoi day la mot cot THAT o mot mien khac (`TransportOrder.freightAmount`,
   * `TransportPayslip.netAmount`), nen su xuat hien cua chung o day co nghia la mot con so tien da
   * lan vao be mat lai xe.
   */
  const MONEY_TOKENS = [
    'freightAmount',
    'revenueAmount',
    'marginAmount',
    'netAmount',
    'grossEarnings',
    'candidateAmount',
    'approvedAmount',
    'currencyCode',
  ];

  for (const token of MONEY_TOKENS) {
    it(`khong mot tep nao nhac \`${token}\``, () => {
      const offenders = sourceFiles.filter((name) => codeOf(name).includes(token));
      expect(offenders, `\`${token}\` xuat hien o: ${offenders.join(', ')}`).toEqual([]);
    });
  }

  /**
   * VA MOT PHEP DO NGUOC LAI: cac tep nay PHAI thuc su doc bon nguon.
   *
   * Khong co bai nay, moi khang dinh o tren van xanh tren mot thu muc chi co kieu — dung hinh dang
   * "xanh vi khong do gi ca".
   */
  it('that su doc ca bon nguon: moc, phien cho, chung tu, ban giao', () => {
    const service = codeOf('field-read.service.ts');
    expect(service).toContain('CheckpointRepository');
    expect(service).toContain('WaitingSessionRepository');
    expect(service).toContain('OperationalDocumentRepository');
    expect(service).toContain('PhysicalReceiptHandoverRepository');
    // Va no doc bang nhung ham DOC co ten.
    expect(service).toContain('listForRun');
    expect(service).toContain('findOpenForLeg');
    expect(service).toContain('listForOrder');
  });

  /**
   * `#279` O9 doi *"the next useful action, not internal state-machine jargon"*.
   *
   * Nhan hien len man hinh phai la tieng Viet co dau. Mot nhan trung ten enum
   * (`PICKUP_DEPARTURE`) nghia la ai do da phoi thang tu vung noi bo ra cho lai xe doc.
   */
  it('nhan tren nut la tieng Viet, khong phai ten enum', () => {
    const actions = codeOf('field-actions.ts');
    for (const jargon of [
      "label: 'PICKUP_ARRIVAL'",
      "label: 'DELIVERY_ARRIVAL'",
      "label: 'DELIVERY_ACCEPTED'",
    ]) {
      expect(actions).not.toContain(jargon);
    }
    expect(actions).toContain("'Đã tới điểm lấy hàng'");
    expect(actions).toContain("'Khách đã nhận hàng'");
  });
});
