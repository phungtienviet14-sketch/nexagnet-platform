import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';

const controllerNames = (capabilities: Parameters<typeof buildAppComposition>[0]): string[] =>
  buildAppComposition(capabilities).controllers.map((controller) => controller.name);

/**
 * XUONG SONG DANH TINH THUOC `transport-core`, khong phai mot capability moi.
 *
 * R0 §2 `F-12` do lai va thay `CAPABILITY_IDS` la mot enum DONG trong `packages/tenant`: them mot
 * capability moi buoc phai sua goi nen tang, build lai `@netviet/tenant`, roi sua gois khach — tuc
 * cham vao dung vung ma #223/#224 dang lam viec. Tranche dau tien co y tranh dieu do.
 */
describe('composition cua xuong song danh tinh', () => {
  it('den cung `transport-core`', () => {
    expect(controllerNames(['transport-core'])).toContain('CounterpartyController');
  });

  it('khong co mat o mot khach khong bat `transport-core`', () => {
    expect(controllerNames(['knowledge'])).not.toContain('CounterpartyController');
  });
});
