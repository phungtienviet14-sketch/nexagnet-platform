import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';

const controllerNames = (capabilities: Parameters<typeof buildAppComposition>[0]): string[] =>
  buildAppComposition(capabilities).controllers.map((controller) => controller.name);

describe('composition cua mo hinh van chuyen v2', () => {
  it('den cung `transport-core` -- khong them capability moi', () => {
    const names = controllerNames(['transport-core']);
    expect(names).toContain('TransportOrdersController');
    expect(names).toContain('RunsController');
  });

  it('khong co mat o mot khach khong bat `transport-core`', () => {
    const names = controllerNames(['knowledge']);
    expect(names).not.toContain('TransportOrdersController');
    expect(names).not.toContain('RunsController');
  });

  it('khong lan voi `OrdersController` cua mien ban hang', () => {
    const sales = controllerNames(['sales-order']);
    expect(sales).toContain('OrdersController');
    expect(sales).not.toContain('TransportOrdersController');
  });
});
