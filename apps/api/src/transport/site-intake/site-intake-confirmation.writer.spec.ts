import { describe, expect, it } from 'vitest';
import { confirmWriteVerdict, isOpenRun } from './site-intake-confirmation.writer.js';
import type { SiteIntakeOpenRun } from './site-intake-facts.port.js';
import type { RunSiteIntake } from './site-intake.types.js';

/**
 * PHAN XU TRUOC LAN GHI cua mot lan tai xe xac nhan — `#398`.
 *
 * Ham thuan nay la cai ma CA HAI ban hien thuc cua cong ghi (Postgres duoi khoa xe, bo nho duoi
 * hang doi) cung goi, nen thu tu cua no la thu tu cua san pham o moi che do luu tru.
 */

const intake = { id: 'intake-1', runId: 'run-1' } as RunSiteIntake;
const own: SiteIntakeOpenRun = { runId: 'run-rieng', code: 'RUN-A-RIENG', status: 'PLANNED' };
const office: SiteIntakeOpenRun = { runId: 'run-vp', code: 'RUN-P-VP', status: 'PLANNED' };

describe('confirmWriteVerdict — thu tu la hop dong', () => {
  it('khong gi chan -> duoc ghi', () => {
    expect(confirmWriteVerdict({ replay: null, driverOpenRuns: [], vehicleOpenRuns: [] })).toBe(
      null,
    );
  });

  it('gui lai CUNG khoa thang moi phep kiem khac — ke ca khi chinh no da lam xe "ban"', () => {
    expect(
      confirmWriteVerdict({ replay: intake, driverOpenRuns: [own], vehicleOpenRuns: [own] }),
    ).toEqual({ kind: 'REPLAYED', intake });
  });

  it('lai xe dang cam vong chay mo -> DRIVER_HAS_OPEN_RUN, truoc phep kiem xe', () => {
    expect(
      confirmWriteVerdict({ replay: null, driverOpenRuns: [own], vehicleOpenRuns: [own, office] }),
    ).toEqual({ kind: 'DRIVER_HAS_OPEN_RUN', openRuns: [own] });
  });

  it('xe co vong chay mo chua ai cam -> VEHICLE_BUSY', () => {
    expect(
      confirmWriteVerdict({ replay: null, driverOpenRuns: [], vehicleOpenRuns: [office] }),
    ).toEqual({ kind: 'VEHICLE_BUSY', openRuns: [office] });
  });
});

describe('isOpenRun', () => {
  it.each([
    ['PLANNED', true],
    ['ACTIVE', true],
    ['COMPLETED', false],
    ['CANCELLED', false],
  ] as const)('%s -> %s', (status, open) => {
    expect(isOpenRun({ status })).toBe(open);
  });
});
