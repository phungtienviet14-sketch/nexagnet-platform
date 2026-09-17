import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CONFIDENCE_SCALE,
  FUEL_CANDIDATE_FINDINGS,
  FUEL_CONSUMPTION_INSIGHTS,
  FUEL_CONSUMPTION_LINK_STATES,
  FUEL_DOCUMENT_KINDS,
  FUEL_DOCUMENT_REJECT_REASONS,
  FUEL_DOCUMENT_STATUSES,
  FUEL_RECEIPT_MEDIA_TYPES,
  FUEL_REVIEW_REASONS,
  FUEL_STATION_MATCHES,
} from '../fuel-review-types';

/**
 * BAN SAO KIEU soat chung tu + drill-down (`#313`) khong duoc lech voi may chu.
 *
 * Cung khuon `field-contract.spec.ts`: doc CHINH tep nguon cua may chu. Khac mot cho — cac mang ben
 * may chu co CHU THICH nam giua cac phan tu (va chu thich co the chua dau nhay), nen chu thich bi
 * bo truoc khi rut chuoi. Khong bo thi mot dau nhay trong chu thich se lam lech cap nhay va bai kiem
 * doc ra mot tu vung sai ma van tuong la dung.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const API_FUEL = resolve(HERE, '../../../../api/src/transport/fuel');

const apiSource = (file: string): string => readFileSync(resolve(API_FUEL, file), 'utf8');

/** Bo `/* ... *\/` va `// ...`. Mang tu vung chi chua chuoi ma, khong co URL nao de lam hong. */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const literalsOf = (file: string, name: string): readonly string[] => {
  const source = withoutComments(apiSource(file));
  const declared = source.indexOf(`export const ${name} = [`);
  if (declared < 0) throw new Error(`Khong tim thay ${name} trong ${file}`);
  const start = source.indexOf('[', declared);
  const end = source.indexOf(']', start);
  return source
    .slice(start + 1, end)
    .split("'")
    .filter((_, index) => index % 2 === 1);
};

const VOCABULARIES = [
  ['fuel-document.types.ts', 'FUEL_DOCUMENT_KINDS', FUEL_DOCUMENT_KINDS],
  ['fuel-document.types.ts', 'FUEL_DOCUMENT_STATUSES', FUEL_DOCUMENT_STATUSES],
  ['fuel-document.types.ts', 'FUEL_DOCUMENT_REJECT_REASONS', FUEL_DOCUMENT_REJECT_REASONS],
  ['fuel-document.types.ts', 'FUEL_STATION_MATCHES', FUEL_STATION_MATCHES],
  ['fuel-candidate-validation.ts', 'FUEL_CANDIDATE_FINDINGS', FUEL_CANDIDATE_FINDINGS],
  ['fuel-receipt-image.ts', 'FUEL_RECEIPT_MEDIA_TYPES', FUEL_RECEIPT_MEDIA_TYPES],
  ['fuel-lifecycle.ts', 'FUEL_REVIEW_REASONS', FUEL_REVIEW_REASONS],
  ['fuel-consumption-drilldown.ts', 'FUEL_CONSUMPTION_LINK_STATES', FUEL_CONSUMPTION_LINK_STATES],
  ['fuel-consumption-drilldown.ts', 'FUEL_CONSUMPTION_INSIGHTS', FUEL_CONSUMPTION_INSIGHTS],
] as const;

describe('ban sao tu vung soat chung tu + tieu hao khop voi may chu — #313', () => {
  /** NEO: neu phep rut tra mang rong o ca hai phia, `toEqual` van xanh. Bai nay dong cua do. */
  it('phep rut that su doc duoc tu vung o may chu', () => {
    expect(literalsOf('fuel-candidate-validation.ts', 'FUEL_CANDIDATE_FINDINGS')).toContain(
      'FIELD_CONFIDENCE_BELOW_FLOOR',
    );
    expect(literalsOf('fuel-document.types.ts', 'FUEL_DOCUMENT_REJECT_REASONS')).toContain(
      'EXTRACTION_UNAVAILABLE',
    );
  });

  it.each(VOCABULARIES)('%s %s khop tung ma va dung thu tu', (file, name, web) => {
    expect([...web]).toEqual(literalsOf(file, name));
  });

  it('thang muc tin khop voi bo doc anh', () => {
    const source = apiSource('fuel-receipt-extraction.ts');
    expect(source).toContain(`export const CONFIDENCE_SCALE = ${CONFIDENCE_SCALE};`);
  });

  /**
   * Mat xich tieu hao KHONG mang tien, KHONG mang lai xe — ca o may chu lan o ban sao. Mot truong
   * `amount` hay `driverId` xuat hien o day la buoc dau tien de mot canh bao thanh mot khoan tru.
   */
  it('kieu mat xich tieu hao khong mang tien hay lai xe', () => {
    const web = readFileSync(resolve(HERE, '../fuel-review-types.ts'), 'utf8');
    const start = web.indexOf('export interface FuelConsumptionLink {');
    expect(start).toBeGreaterThan(0);
    const block = web.slice(start, web.indexOf('\n}', start));
    for (const forbidden of ['amount', 'Amount', 'driverId', 'payroll', 'deduction']) {
      expect(block, forbidden).not.toContain(forbidden);
    }
  });
});
