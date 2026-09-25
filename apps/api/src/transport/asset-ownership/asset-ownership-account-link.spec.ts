import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import type { UserRole } from '../../auth/auth.types.js';
import { InMemoryUserRepository, type AuthUserRecord } from '../../auth/user.repository.js';
import type { TelemetryService } from '../../observability/telemetry.service.js';
import { InMemoryFleetRepository } from '../fleet/fleet.repository.js';
import { TransportDomainError } from '../transport.errors.js';
import { InMemoryAssetOwnershipRepository } from './asset-ownership.repository.js';
import { AssetOwnershipService } from './asset-ownership.service.js';
import { FleetVehicleOwnershipAdapter } from './fleet-vehicle-ownership.adapter.js';

/**
 * `#395` — noi tai khoan voi ho so BEN GOP VON: tai khoan phai CO THAT va DANG HOAT DONG.
 *
 * Truoc `#395` duong nay ghi bat ky chuoi nao vao `TransportAssetStakeholder.authUserId`: mot ma
 * go nham thanh mot lien ket treo, va mot tai khoan da khoa van "co" xe.
 */

const NOW = new Date('2026-09-25T02:00:00.000Z');
const ACTOR = 'giam-doc';

function account(id: string, role: UserRole, disabled = false): AuthUserRecord {
  return {
    id,
    username: id,
    name: id,
    email: null,
    phone: null,
    passwordHash: 'x',
    role,
    disabledAt: disabled ? NOW : null,
    credentialVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    lastLoginAt: null,
    passwordChangedAt: NOW,
  };
}

describe('AssetOwnershipService.setStakeholderAccount — kiem tai khoan (#395)', () => {
  let audit: InMemoryAuditLogRepository;
  let decisions: string[];
  let service: AssetOwnershipService;

  beforeEach(() => {
    audit = new InMemoryAuditLogRepository();
    decisions = [];
    const telemetry = {
      step: async <T>(_name: string, run: () => Promise<T>) => run(),
      decision: (input: { point: string; outcome: string; reason: string }) => {
        decisions.push(`${input.point}:${input.outcome}:${input.reason}`);
      },
    } as unknown as TelemetryService;
    service = new AssetOwnershipService(
      new InMemoryAssetOwnershipRepository(),
      new FleetVehicleOwnershipAdapter(new InMemoryFleetRepository()),
      new AuditLogService(audit),
      telemetry,
      new InMemoryUserRepository([
        account('chu-xe', 'MANAGER'),
        account('ke-toan-gop-von', 'ACCOUNTING'),
        account('da-khoa', 'MANAGER', true),
      ]),
    );
  });

  const holder = () => service.createStakeholder({ kind: 'PERSON', displayName: 'Chủ xe' }, ACTOR);

  it('noi tai khoan dang hoat dong (moi vai), go noi duoc; moi lan deu co dau vet', async () => {
    const one = await holder();
    expect((await service.setStakeholderAccount(one.id, 'chu-xe', ACTOR)).hasAccount).toBe(true);
    expect((await service.setStakeholderAccount(one.id, null, ACTOR)).hasAccount).toBe(false);
    const two = await holder();
    await service.setStakeholderAccount(two.id, 'ke-toan-gop-von', ACTOR);

    // Thu tu cua kho dau vet khong on dinh trong cung mot mili-giay — dem, khong xep.
    const actions = (await audit.list({})).map((entry) => entry.action);
    expect(actions.filter((action) => action.includes('account_')).sort()).toEqual([
      'transport.asset_stakeholder.account_link',
      'transport.asset_stakeholder.account_link',
      'transport.asset_stakeholder.account_unlink',
    ]);
    expect(decisions).toEqual([
      'stakeholder.account_link:allowed:ACCOUNT_LINKED',
      'stakeholder.account_link:allowed:ACCOUNT_UNLINKED',
      'stakeholder.account_link:allowed:ACCOUNT_LINKED',
    ]);
  });

  it('ma tai khoan khong ton tai: 404 `ACCOUNT_LINK_USER_NOT_FOUND`, khong ghi', async () => {
    const one = await holder();
    const error = await service.setStakeholderAccount(one.id, 'go-nham', ACTOR).catch((e) => e);
    expect(error).toBeInstanceOf(TransportDomainError);
    expect(error).toMatchObject({ kind: 'NOT_FOUND', reason: 'ACCOUNT_LINK_USER_NOT_FOUND' });
    expect((error as Error).message).toBe('Không tìm thấy tài khoản cần nối.');
    expect((await service.getStakeholder(one.id)).hasAccount).toBe(false);
    expect(decisions).toEqual(['stakeholder.account_link:denied:ACCOUNT_LINK_USER_NOT_FOUND']);
  });

  it('tai khoan da khoa: 409 `ACCOUNT_LINK_USER_DISABLED`', async () => {
    const one = await holder();
    await expect(service.setStakeholderAccount(one.id, 'da-khoa', ACTOR)).rejects.toMatchObject({
      kind: 'CONFLICT',
      reason: 'ACCOUNT_LINK_USER_DISABLED',
    });
  });

  it('tai khoan da noi ho so khac van la `ASSET_STAKEHOLDER_ACCOUNT_TAKEN`, cau co dau', async () => {
    const one = await holder();
    const two = await holder();
    await service.setStakeholderAccount(one.id, 'chu-xe', ACTOR);
    const error = await service.setStakeholderAccount(two.id, 'chu-xe', ACTOR).catch((e) => e);
    expect(error).toMatchObject({ kind: 'CONFLICT', reason: 'ASSET_STAKEHOLDER_ACCOUNT_TAKEN' });
    expect((error as Error).message).toContain('bên góp vốn khác');
  });
});
