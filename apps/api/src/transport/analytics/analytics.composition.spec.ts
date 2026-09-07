import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';

const controllerNames = (capabilities: Parameters<typeof buildAppComposition>[0]): string[] =>
  buildAppComposition(capabilities).controllers.map((controller) => controller.name);

const here = dirname(fileURLToPath(import.meta.url));

describe('composition cua chi so van hanh `R8`', () => {
  it('den cung `transport-costing` — khong them capability moi', () => {
    expect(controllerNames(['transport-core', 'transport-costing'])).toContain(
      'TransportAnalyticsController',
    );
  });

  /**
   * Mot khach chi theo doi doi xe va chuyen, khong ghi mot khoan chi nao, KHONG duoc thay mot man
   * hinh "bien truc tiep" — vi bien do se luon bang doanh thu. Mot bao cao dung ve mat so hoc ma
   * sai ve mat nghiep vu la kieu sai te nhat: no khong bao loi.
   */
  it('khong co mat o khach chi bat `transport-core`', () => {
    expect(controllerNames(['transport-core'])).not.toContain('TransportAnalyticsController');
  });

  it('khong co mat o khach khong dung van tai', () => {
    expect(controllerNames(['knowledge'])).not.toContain('TransportAnalyticsController');
  });
});

/**
 * ===========================================================================
 * BAO CAO KHONG BAO GIO GHI — giu o CA HAI tang, va ca hai deu duoc kiem.
 *
 * #237: *"AI only summarizes/ranks. AI does not rewrite facts."* He kieu khong noi duoc "khong co
 * route POST nao", nen cho do can mot phep do o tang ma nguon.
 */
describe('be mat `R8` khong co duong ghi nao', () => {
  const sourceOf = (file: string): string =>
    readFileSync(resolve(here, file), 'utf8')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('/*'))
      .join('\n');

  it('controller chi co `@Get`', () => {
    const source = sourceOf('analytics.controller.ts');
    for (const verb of ['@Post', '@Put', '@Patch', '@Delete']) {
      expect(source, verb).not.toContain(verb);
    }
    expect(source).toContain('@Get(');
  });

  /**
   * HAI CONG RA NGOAI khong duoc mang mot ham ghi nao. Day la hinh dang cau truc cua
   * `NO_CROSS_CONTEXT_REPOSITORY_WRITE`: neu mot ngay co nguoi them `create`/`update` vao cong,
   * bai nay do truoc khi mot ham ten `report...()` kip ghi vao so cua mien khac.
   */
  it('hai cong ra ngoai chi co ham doc', () => {
    const source = sourceOf('analytics.ports.ts');
    const methods = source.match(/abstract (\w+)\(/g) ?? [];
    expect(methods.length).toBeGreaterThan(0);
    for (const method of methods) {
      expect(method).toMatch(/abstract (find|list)/);
    }
  });
});
