import { describe, expect, it } from 'vitest';
import { KnowledgeController } from './knowledge.controller.js';
import { KnowledgeService } from './knowledge.service.js';

/**
 * Cong doc kho tri thuc (read-only) cho cot "Nguon su that". Test doc tu SEED that
 * qua KnowledgeService nen phan anh dung du lieu console se hien.
 */
describe('KnowledgeController (nguon su that)', () => {
  const controller = new KnowledgeController(new KnowledgeService());

  it('lo gia si (Don gia CTV) that theo bang gia thang 7', () => {
    const products = controller.products();
    expect(products.length).toBeGreaterThanOrEqual(18);
    const felix = products.find((p) => p.sku === 'FELIX');
    expect(felix).toBeDefined();
    expect(felix?.wholesale).toBe(1_250_000);
    expect(felix?.name).toContain('Felix');
  });

  it('lo glossary viet tat (term -> nghia)', () => {
    const glossary = controller.glossary();
    expect(glossary.some((g) => g.term === 'TN' && g.meaning === 'Thái Nguyên')).toBe(true);
  });

  it('map nhom -> dai ly kem cap + chinh sach mac dinh', () => {
    const groups = controller.groups();
    const meta = groups.find((g) => g.groupName === 'Nhóm đại lý Meta HN');
    expect(meta?.dealerName).toBe('Meta HN');
    expect(meta?.dealerTier).toBe('dai_ly');
    expect(meta?.policy).toBe('cong_no_30');
    expect(meta?.branch).toBe('HN');
  });

  it('summary carry dung so luong theo cac danh sach', () => {
    const s = controller.summary();
    expect(s.productCount).toBe(s.products.length);
    expect(s.glossaryCount).toBe(s.glossary.length);
    expect(s.groupCount).toBe(s.groups.length);
    expect(s.productCount).toBeGreaterThanOrEqual(18);
  });

  it('KHONG lo du lieu ca nhan khach (PII)', () => {
    const serialized = JSON.stringify(controller.summary());
    expect(serialized).not.toMatch(/customerPhone|customerAddress|SDT|dia chi/i);
  });
});
