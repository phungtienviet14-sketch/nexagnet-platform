import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';
import { CheckpointLegFieldTruthSource } from '../checkpoint/checkpoint-leg-field-truth.source.js';
import { LegFieldTruthSource, NoLegFieldTruthSource } from './leg-field-truth.port.js';

const controllerNames = (capabilities: Parameters<typeof buildAppComposition>[0]): string[] =>
  buildAppComposition(capabilities).controllers.map((controller) => controller.name);

/**
 * CAC BAN GHI cua `LegFieldTruthSource`, theo THU TU trong mang provider.
 *
 * Nest lay provider CUOI CUNG cho mot token — cung hop dong voi `RunClosureBlockerSource` o
 * `planning.composition.spec.ts`: ban mac dinh RONG phai dung TRUOC ban ghi de cua
 * `transport-checkpoint`, neu khong moi khach bat moc hien truong se lang le mat cong chan `#332`.
 */
const fieldTruthBindings = (capabilities: Parameters<typeof buildAppComposition>[0]): string[] =>
  buildAppComposition(capabilities)
    .providers.filter(
      (provider) =>
        typeof provider === 'object' &&
        provider !== null &&
        (provider as { provide?: unknown }).provide === LegFieldTruthSource,
    )
    .map((provider) => (provider as { useClass?: { name?: string } }).useClass?.name ?? '(?)');

describe('nguon su that hien truong cua chang (#332)', () => {
  it('khach chi bat `transport-core` duoc nguon RONG — khong co so ghi hien truong de doi chieu', () => {
    expect(fieldTruthBindings(['transport-core'])).toEqual([NoLegFieldTruthSource.name]);
  });

  it('bat `transport-checkpoint` thi so ghi moc GHI DE nguon rong — va nam SAU no', () => {
    expect(fieldTruthBindings(['transport-core', 'transport-checkpoint'])).toEqual([
      NoLegFieldTruthSource.name,
      CheckpointLegFieldTruthSource.name,
    ]);
  });
});

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
