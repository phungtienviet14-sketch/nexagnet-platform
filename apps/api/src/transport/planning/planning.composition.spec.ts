import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';
import { CheckpointRunClosureBlockerSource } from '../checkpoint/checkpoint-run-closure-blocker.source.js';
import {
  NoRunClosureBlockerSource,
  RunClosureBlockerSource,
} from './run-closure-blocker.source.js';
import { RunClosureSweepScheduler } from './run-closure-sweep.scheduler.js';
import { RunClosureService } from './run-closure.service.js';

const controllerNames = (capabilities: Parameters<typeof buildAppComposition>[0]): string[] =>
  buildAppComposition(capabilities).controllers.map((controller) => controller.name);

const providerNames = (capabilities: Parameters<typeof buildAppComposition>[0]): string[] =>
  buildAppComposition(capabilities).providers.map((provider) => {
    if (typeof provider === 'function') return provider.name;
    const token = (provider as { provide?: unknown }).provide;
    return typeof token === 'function' ? token.name : String(token);
  });

/**
 * CAC BAN GHI CUA `RunClosureBlockerSource`, theo THU TU trong mang provider.
 *
 * Nest lay provider CUOI CUNG cho mot token, nen thu tu nay la mot phan cua hop dong chu khong mot
 * chi tiet sap xep: ban mac dinh phai dung TRUOC ban ghi de, neu khong no se de len chinh ban ghi
 * de va moi khach bat `transport-checkpoint` se lang le mat nguon su that "hang tren thung".
 */
const blockerSourceBindings = (
  capabilities: Parameters<typeof buildAppComposition>[0],
): string[] =>
  buildAppComposition(capabilities)
    .providers.filter(
      (provider) =>
        typeof provider === 'object' &&
        provider !== null &&
        (provider as { provide?: unknown }).provide === RunClosureBlockerSource,
    )
    .map((provider) => {
      const binding = provider as { useClass?: { name?: string } };
      // Ten lop, khong phai ca doi tuong provider: khang dinh phai doc ra duoc thanh mot cau.
      return binding.useClass?.name ?? '(khong ro)';
    });

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

/**
 * COMPOSITION cua lane dong vong chay do he thong quan (#293 Lane R).
 *
 * Hai dieu duoc khang dinh o day, va ca hai deu la khang dinh ve CAU TRUC chu khong ve hanh vi —
 * hanh vi da co bai kiem rieng. Cai chi lo ra o tang nay la: mot token khong duoc dang ky, hoac mot
 * ban ghi de nam sai cho trong mang provider.
 */
describe('composition cua lane dong vong chay (#293)', () => {
  it('den cung `transport-core` — khong them capability moi', () => {
    const names = providerNames(['transport-core']);

    expect(names).toContain(RunClosureService.name);
    expect(names).toContain(RunClosureSweepScheduler.name);
    expect(names).toContain(RunClosureBlockerSource.name);
  });

  it('bien mat cung `transport-core`', () => {
    expect(providerNames(['knowledge'])).not.toContain(RunClosureService.name);
  });

  it('khach chi bat `transport-core` duoc mot nguon RONG, khong phai mot cong thieu', () => {
    /*
     * `transport-core` phai boot duoc mot minh. Khong co `transport-checkpoint` thi khong co nguon
     * su that ben ngoai nao de hoi — va do la mot cau hinh HOP LE chu khong mot loi boot. Cai phai
     * kiem la token van duoc dang ky, chu khong phai no tro toi mot lop cu the nao.
     */
    expect(blockerSourceBindings(['transport-core'])).toEqual([NoRunClosureBlockerSource.name]);
  });

  it('bat `transport-checkpoint` thi moc van hanh GHI DE nguon rong — va nam SAU no', () => {
    /*
     * THU TU LA CA HOP DONG. Nest lay provider cuoi cung cho mot token: ban ghi de phai dung SAU
     * ban mac dinh. Mot lan sap xep lai mang provider se lang le tra moi khach ve nguon rong, va
     * `CARGO_STILL_CARRIED` se khong bao gio xuat hien tren bang dieu hanh nua.
     */
    expect(blockerSourceBindings(['transport-core', 'transport-checkpoint'])).toEqual([
      NoRunClosureBlockerSource.name,
      CheckpointRunClosureBlockerSource.name,
    ]);
  });
});
