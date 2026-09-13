import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * WF-020 — ban sao kieu HIEN TRUONG o web khong duoc lech voi may chu.
 *
 * ============================================================================================
 * VI SAO CO BAN SAO, VA VI SAO NO CAN MOT BAI KIEM
 * ============================================================================================
 *
 * `apps/web` va `apps/api` KHONG chia se kieu qua mot goi thu ba — do la quy uoc da co cua tep
 * `transport-types.ts`. Ban sao chay nhanh hon va khong buoc web vao vong doi build cua api, nhung
 * no khong duoc phep lech TRONG IM LANG: neu may chu them mot loai viec ma web khong biet, man hinh
 * se ve mot nut khong bam duoc — hoac te hon, KHONG ve mot nut ma lai xe dang can.
 *
 * Bo test nay doc CHINH tep nguon cua may chu, cung khuon `__tests__/transport-actions.spec.ts` da
 * lam cho bang phan quyen.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const API_FIELD_TYPES = resolve(HERE, '../../../../api/src/transport/field/field.types.ts');
const API_DOCUMENT_TYPES = resolve(
  HERE,
  '../../../../api/src/transport/document/document.types.ts',
);
const API_HANDOVER_TYPES = resolve(
  HERE,
  '../../../../api/src/transport/document/handover.types.ts',
);
const WEB_TYPES = resolve(HERE, '../transport-types.ts');

/**
 * Rut cac chuoi literal trong mot mang co ten o mot tep nguon.
 *
 * Dung `indexOf` chu khong `RegExp`, va do khong phai mot so thich: mot mau regex o day phai mang
 * `\s`/`\n`, va mot lop gach cheo nguoc bi mat khi tep duoc sinh ra se lam mau IM LANG khop
 * sai — bai kiem van chay, chi khong con kiem dung thu no dinh kiem.
 */
const literalsInArray = (source: string, name: string): readonly string[] => {
  const declared = source.indexOf(`${name} = [`);
  const alsoDeclared = declared >= 0 ? declared : source.indexOf(`${name}: readonly`);
  if (alsoDeclared < 0) throw new Error(`Khong tim thay mang ${name}`);
  const start = source.indexOf('[', alsoDeclared);
  // Mang literal cua ba tu vung nay chi chua chuoi, nen dau `]` DAU TIEN sau `[` la dau dong.
  const end = source.indexOf(']', start);
  if (start < 0 || end < 0) throw new Error(`Mang ${name} khong dong duoc`);
  return quotedIn(source.slice(start, end));
};

/** Rut cac nhanh cua mot union `type X = 'a' | 'b'` o tep web. */
const unionMembers = (source: string, name: string): readonly string[] => {
  const start = source.indexOf(`export type ${name} =`);
  if (start < 0) throw new Error(`Khong tim thay union ${name} o web`);
  const end = source.indexOf(';', start);
  if (end < 0) throw new Error(`Union ${name} khong dong bang mot ';'`);
  return quotedIn(source.slice(start, end));
};

/** Moi chuoi trong dau nhay don. Mau nay khong co gach cheo nguoc nao de mat. */
const quotedIn = (block: string): readonly string[] =>
  block.split("'").filter((_, index) => index % 2 === 1);

describe('ban sao kieu hien truong khop voi may chu — WF-020', () => {
  const web = readFileSync(WEB_TYPES, 'utf8');

  /**
   * NEO NGUOC LAI — ba bai duoi day chi co gia tri neu phep rut that su thay duoc gi.
   *
   * Neu ca hai phia deu rut ra mot mang RONG, `toEqual([])` van xanh — dung hinh dang "xanh vi
   * khong do gi ca". Bai nay dong cua do lai.
   */
  it('phep rut that su doc duoc tu vung o ca hai phia', () => {
    const api = readFileSync(API_FIELD_TYPES, 'utf8');
    expect(literalsInArray(api, 'DRIVER_FIELD_ACTION_KINDS').length).toBeGreaterThanOrEqual(4);
    expect(unionMembers(web, 'DriverFieldActionKind').length).toBeGreaterThanOrEqual(4);
    expect(unionMembers(web, 'OperationalDocumentType')).toContain('DELIVERY_RECEIPT');
    expect(unionMembers(web, 'ReceiptHandoverState')).toContain('RETURNED_TO_OFFICE');
  });

  it('loai viec ke tiep khop tung ma va dung thu tu', () => {
    const api = readFileSync(API_FIELD_TYPES, 'utf8');
    expect(unionMembers(web, 'DriverFieldActionKind')).toEqual(
      literalsInArray(api, 'DRIVER_FIELD_ACTION_KINDS'),
    );
  });

  it('nam loai chung tu van hanh khop tung ma', () => {
    const api = readFileSync(API_DOCUMENT_TYPES, 'utf8');
    expect(unionMembers(web, 'OperationalDocumentType')).toEqual(
      literalsInArray(api, 'OPERATIONAL_DOCUMENT_TYPES'),
    );
  });

  it('ba buoc ban giao bien nhan khop tung ma', () => {
    const api = readFileSync(API_HANDOVER_TYPES, 'utf8');
    expect(unionMembers(web, 'ReceiptHandoverState')).toEqual(
      literalsInArray(api, 'RECEIPT_HANDOVER_STATES'),
    );
  });

  /**
   * `#279` O9 + `INV-09` — lieu do cua lai xe khong mang doanh thu.
   *
   * Do tren CHINH kieu ma web khai: mot truong tien them vao `DriverFieldLeg` o may chu se phai
   * duoc chep sang day de man hinh doc duoc no, va luc do bai nay do.
   */
  it('khong mot kieu hien truong nao mang truong tien', () => {
    const start = web.indexOf('export interface DriverFieldLeg {');
    expect(start).toBeGreaterThan(0);
    const block = web.slice(start, web.indexOf('\n}', start));
    for (const money of ['Amount', 'freight', 'revenue', 'margin', 'currency', 'price']) {
      expect(block, money).not.toContain(money);
    }
  });
});
