import { describe, expect, it } from 'vitest';
import { PermissionDomainRegistry } from '../../auth/access/permission-domain.registry.js';
import { actionsForRole } from '../transport-actions.js';
import {
  TransportPermissionDomainRegistrar,
  transportPermissionDomain,
} from './transport-permission-domain.js';
import { transportPermissionCatalog } from './transport-permission-catalog.js';

describe('mien phan quyen `transport` (#395)', () => {
  it('tu dang ky vao so cua nen tang trong ham dung', () => {
    const registry = new PermissionDomainRegistry();
    new TransportPermissionDomainRegistrar(registry);
    expect(registry.get('transport')?.id).toBe('transport');
    expect(registry.owning('transport.vehicle.read')?.id).toBe('transport');
    // Mot TransportModule thu hai (loi composition) lo ngay, khong am tham ghi de.
    expect(() => new TransportPermissionDomainRegistrar(registry)).toThrow(/da duoc dang ky/);
  });

  it('noi dung quy tac thuan va danh muc', () => {
    const domain = transportPermissionDomain();
    expect(domain.catalog()).toBe(transportPermissionCatalog());
    expect(domain.effective({ role: 'ACCOUNTING' })).toEqual(actionsForRole('ACCOUNTING'));
    expect(
      domain
        .validate({
          role: 'ADMIN',
          grants: [{ permission: 'transport.trip.read', effect: 'DENY' }],
          confirmEscalation: false,
        })
        .map((violation) => violation.code),
    ).toEqual(['ADMIN_PRESET_IS_FULL']);
    expect(
      domain.escalated('MANAGER', [{ permission: 'transport.trip.cancel', effect: 'ALLOW' }]),
    ).toEqual(['transport.trip.cancel']);
  });
});
