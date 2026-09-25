import { describe, expect, it, vi } from 'vitest';
import {
  CounterpartySitePlaceGuardHub,
  type CounterpartySitePlaceGuard,
  type LegacySiteChange,
} from './counterparty-site-place-guard.js';

const change = (patch: Partial<LegacySiteChange>): LegacySiteChange => ({
  siteId: 'site-1',
  changesName: false,
  changesStatus: false,
  ...patch,
});

const blocking = (): CounterpartySitePlaceGuard & { calls: LegacySiteChange[] } => {
  const calls: LegacySiteChange[] = [];
  return {
    calls,
    checkLegacySiteChange: vi.fn(async (input: LegacySiteChange) => {
      calls.push(input);
      return { allowed: false as const, reason: 'COUNTERPARTY_SITE_MANAGED_AS_PLACE' as const };
    }),
  };
};

describe('cong chan sua dia diem qua duong cu (#395)', () => {
  it('chua ai dang ky: khong chan gi — dung nhu truoc #395', async () => {
    const hub = new CounterpartySitePlaceGuardHub();
    expect(await hub.checkLegacySiteChange(change({ changesName: true }))).toEqual({
      allowed: true,
    });
  });

  it('da dang ky: doi ten hoac trang thai thi hoi cong that', async () => {
    const hub = new CounterpartySitePlaceGuardHub();
    const guard = blocking();
    hub.register(guard);
    expect(await hub.checkLegacySiteChange(change({ changesStatus: true }))).toEqual({
      allowed: false,
      reason: 'COUNTERPARTY_SITE_MANAGED_AS_PLACE',
    });
    expect(guard.calls).toEqual([change({ changesStatus: true })]);
  });

  it('sua dia chi / ghi chu khong phai danh tinh — khong hoi cong', async () => {
    const hub = new CounterpartySitePlaceGuardHub();
    const guard = blocking();
    hub.register(guard);
    expect(await hub.checkLegacySiteChange(change({}))).toEqual({ allowed: true });
    expect(guard.calls).toEqual([]);
  });

  it('dang ky hai cong thi NEM', () => {
    const hub = new CounterpartySitePlaceGuardHub();
    hub.register(blocking());
    expect(() => hub.register(blocking())).toThrow(/Da co mot cong dia diem/);
  });
});
