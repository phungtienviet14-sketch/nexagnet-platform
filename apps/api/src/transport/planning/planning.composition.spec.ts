import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';

const controllerNames = (capabilities: Parameters<typeof buildAppComposition>[0]): string[] =>
  buildAppComposition(capabilities).controllers.map((controller) => controller.name);

/**
 * COMPOSITION cua lop lap ke hoach vong chay (#276 Lane L).
 *
 * Khang dinh PHU DINH quan trong ngang khang dinh khang dinh: lane nay KHONG duoc them mot
 * capability moi. Neu no them, moi khach van tai dang chay se phai sua `capabilities` trong goi
 * khach chi de giu nguyen kha nang gan don vao xe — mot lan doi hinh dang goi khach ma khong ai
 * duoc gi.
 */
describe('composition cua lop lap ke hoach vong chay', () => {
  it('den cung `transport-core` -- khong them capability moi', () => {
    expect(controllerNames(['transport-core'])).toContain('TransportPlanningController');
  });

  it('bien mat cung `transport-core`', () => {
    expect(controllerNames(['knowledge'])).not.toContain('TransportPlanningController');
  });

  it('di cung bo ba cua mo hinh van chuyen v2, khong tach ra mot nhom rieng', () => {
    const names = controllerNames(['transport-core']);
    for (const controller of [
      'TransportOrdersController',
      'RunsController',
      'TransportPlanningController',
    ]) {
      expect(names).toContain(controller);
    }
  });
});
