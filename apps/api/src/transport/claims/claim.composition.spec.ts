import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';

const controllerNames = (capabilities: Parameters<typeof buildAppComposition>[0]): string[] =>
  buildAppComposition(capabilities).controllers.map((controller) => controller.name);

describe('composition cua de nghi chi', () => {
  it('den cung `transport-costing`', () => {
    const names = controllerNames(['transport-core', 'transport-costing']);
    expect(names).toContain('ExpenseClaimsController');
    expect(names).toContain('DriverExpenseClaimsController');
  });

  /**
   * Mot khach bat `transport-core` ma KHONG bat so quy lai xe thi khong co gi de duyet: khoan chi
   * cua ho khong di qua quy. Hai be mat nay phai vang mat, khong phai tra 403.
   */
  it('vang mat o khach chi bat `transport-core`', () => {
    const names = controllerNames(['transport-core']);
    expect(names).not.toContain('ExpenseClaimsController');
    expect(names).not.toContain('DriverExpenseClaimsController');
  });
});
