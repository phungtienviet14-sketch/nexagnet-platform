import type { CapabilityId } from '@netviet/tenant';
import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';

/**
 * `TX-07b` KHONG co capability rieng — no den cung `transport-workforce` va bien mat cung no.
 *
 * Bo bai nay khoa dung lua chon do (xem chu thich dau `transport-driver-settlement.module.ts`):
 * mot khach chi bat `transport-core` + `transport-costing` KHONG duoc nap mot manh nao cua tang
 * chi tien. Neu mot ngay nao do co nguoi tach no thanh capability rieng, bai nay do ngay — va do
 * la muc dich, vi tach ra doi sua `packages/tenant` va goi khach cua moi khach van tai dang chay.
 */

const SETTLEMENT_ARTEFACTS = [
  'DriverSettlementController',
  'DriverSettlementSelfController',
  'TransportDriverSettlementModule',
];

function compositionNames(capabilities: readonly CapabilityId[]): string[] {
  const built = buildAppComposition(capabilities);
  return [
    ...built.controllers.map((controller) => controller.name),
    ...built.imports.map((entry) =>
      typeof entry === 'function' ? entry.name : String((entry as { name?: string }).name ?? ''),
    ),
  ];
}

describe('composition cua TX-07b', () => {
  it('bat cung core + costing + workforce thi be mat quyet toan co mat', () => {
    const names = compositionNames(['transport-core', 'transport-costing', 'transport-workforce']);
    for (const artefact of SETTLEMENT_ARTEFACTS) expect(names, artefact).toContain(artefact);
  });

  it('bat core + costing ma KHONG bat workforce thi khong nap manh nao cua TX-07b', () => {
    const names = compositionNames(['transport-core', 'transport-costing']);
    for (const artefact of SETTLEMENT_ARTEFACTS) expect(names, artefact).not.toContain(artefact);
    // Nhung so quy VAN o do — `TX-07b` bien mat khong keo theo `TX-03`.
    expect(names).toContain('DriverFundController');
  });

  it('khach ban hang day du KHONG nap mot manh nao cua TX-07b', () => {
    const names = compositionNames([
      'knowledge',
      'messaging',
      'turn-processing',
      'sales-order',
      'campaign',
      'operations',
      'notifications',
    ]);
    for (const artefact of SETTLEMENT_ARTEFACTS) expect(names, artefact).not.toContain(artefact);
  });
});
