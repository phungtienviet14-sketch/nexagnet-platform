import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { InMemoryFleetRepository } from '../fleet/fleet.repository.js';
import { TransportDomainError } from '../transport.errors.js';
import { CounterpartySubjectPort } from './counterparty-subject.port.js';
import { InMemoryCounterpartyRepository } from './counterparty.repository.js';
import { CounterpartyService } from './counterparty.service.js';
import { FleetCounterpartySubjectAdapter } from './fleet-counterparty-subject.adapter.js';
import type { CounterpartySubjectKind } from './counterparty.types.js';

/**
 * HAT GIONG NGHIEM THU `CP-001`..`CP-005` — `docs/kien-truc/transport-domain-v2.md` §10.3.
 *
 * Bo test nay do dung mot cau: mot to chuc trong doi that co the vua thue van chuyen vua chay ho,
 * va he thong doc ra MOT danh tinh chu khong hai ban ghi roi.
 */

const ACTOR = 'nguoi-van-hanh';

/** Cong gia cho `CP-004`: mot loai chu the khong co adapter. */
class KindlessSubjectPort extends CounterpartySubjectPort {
  supports(): boolean {
    return false;
  }
  async exists(): Promise<boolean> {
    throw new Error('khong duoc hoi kho khi loai chu the chua co adapter');
  }
}

describe('CounterpartyService — xuong song danh tinh doi tac', () => {
  let fleet: InMemoryFleetRepository;
  let repository: InMemoryCounterpartyRepository;
  let service: CounterpartyService;

  beforeEach(() => {
    fleet = new InMemoryFleetRepository();
    repository = new InMemoryCounterpartyRepository();
    service = new CounterpartyService(
      repository,
      new FleetCounterpartySubjectAdapter(fleet),
      new AuditLogService(new InMemoryAuditLogRepository()),
    );
  });

  const link = (id: string, kind: CounterpartySubjectKind, subjectId: string) =>
    service.link(id, kind, subjectId, ACTOR);

  it('CP-001 — mot phap nhan mang hai mat doc ra MOT danh tinh', async () => {
    const customer = await fleet.createCustomer({ name: 'Cong ty A' });
    const partner = await fleet.createPartner({ name: 'Cong ty A', roles: ['CARRIER'] });
    const party = await service.create({ name: 'Cong ty A', taxCode: '0101234567' }, ACTOR);

    await link(party.id, 'CUSTOMER', customer.id);
    await link(party.id, 'PARTNER', partner.id);

    const identity = await service.get(party.id);
    expect(identity.counterparty.id).toBe(party.id);
    expect(identity.links.map((entry) => entry.kind)).toEqual(['CUSTOMER', 'PARTNER']);
    expect(identity.links.map((entry) => entry.subjectId)).toEqual([customer.id, partner.id]);
  });

  it('CP-002 — ban ghi da thuoc phap nhan khac thi TU CHOI, khong ghi de', async () => {
    const customer = await fleet.createCustomer({ name: 'Cong ty B' });
    const first = await service.create({ name: 'Phap nhan mot' }, ACTOR);
    const second = await service.create({ name: 'Phap nhan hai' }, ACTOR);
    await link(first.id, 'CUSTOMER', customer.id);

    await expect(link(second.id, 'CUSTOMER', customer.id)).rejects.toMatchObject({
      reason: 'SUBJECT_ALREADY_LINKED',
      kind: 'CONFLICT',
    });

    // Ban cu VAN nguyen: tu choi khong duoc phep de lai mot trang thai nua voi.
    const held = await repository.findLinkBySubject('CUSTOMER', customer.id);
    expect(held?.counterpartyId).toBe(first.id);
    expect(await service.get(second.id)).toMatchObject({ links: [] });
  });

  it('CP-003 — `subjectId` khong co that thi tu choi voi ma rieng', async () => {
    const party = await service.create({ name: 'Phap nhan' }, ACTOR);
    await expect(link(party.id, 'CUSTOMER', 'khong-ton-tai')).rejects.toMatchObject({
      reason: 'SUBJECT_NOT_FOUND',
      kind: 'NOT_FOUND',
    });
  });

  it('CP-004 — loai chu the chua co adapter thi tu choi CO TEN, va khong hoi kho', async () => {
    const port = new KindlessSubjectPort();
    const existsSpy = vi.spyOn(port, 'exists');
    const scoped = new CounterpartyService(
      repository,
      port,
      new AuditLogService(new InMemoryAuditLogRepository()),
    );
    const party = await scoped.create({ name: 'Phap nhan' }, ACTOR);

    await expect(scoped.link(party.id, 'PARTNER', 'bat-ky', ACTOR)).rejects.toMatchObject({
      reason: 'SUBJECT_KIND_UNAVAILABLE',
    });
    expect(existsSpy).not.toHaveBeenCalled();
  });

  it('noi lai dung cai da noi la KHONG DOI, khong sinh ban ghi thu hai', async () => {
    const customer = await fleet.createCustomer({ name: 'Cong ty C' });
    const party = await service.create({ name: 'Phap nhan' }, ACTOR);

    const first = await link(party.id, 'CUSTOMER', customer.id);
    const again = await link(party.id, 'CUSTOMER', customer.id);

    expect(again.createdAt).toBe(first.createdAt);
    expect(await service.get(party.id)).toMatchObject({
      links: [expect.objectContaining({ subjectId: customer.id })],
    });
  });

  it('ma so thue da co chu thi tu choi thay vi tao ban sao thu hai', async () => {
    await service.create({ name: 'Phap nhan mot', taxCode: '0101234567' }, ACTOR);
    await expect(
      service.create({ name: 'Phap nhan hai', taxCode: '0101234567' }, ACTOR),
    ).rejects.toMatchObject({ reason: 'COUNTERPARTY_TAX_CODE_TAKEN' });
  });

  it('go lien ket la idempotent — go mot thu khong co khong nem', async () => {
    const customer = await fleet.createCustomer({ name: 'Cong ty D' });
    const party = await service.create({ name: 'Phap nhan' }, ACTOR);
    await link(party.id, 'CUSTOMER', customer.id);

    await service.unlink('CUSTOMER', customer.id, ACTOR);
    await expect(service.unlink('CUSTOMER', customer.id, ACTOR)).resolves.toBeUndefined();
    expect(await service.get(party.id)).toMatchObject({ links: [] });
  });

  it('CP-005 — danh muc khach hang/doi tac cu KHONG doi khi chua co phap nhan nao', async () => {
    const customer = await fleet.createCustomer({ name: 'Cong ty E' });
    const partner = await fleet.createPartner({ name: 'Nha xe E', roles: ['CARRIER'] });

    expect(await fleet.findCustomer(customer.id)).toMatchObject({ name: 'Cong ty E' });
    expect(await fleet.findPartner(partner.id)).toMatchObject({ roles: ['CARRIER'] });
    expect(await service.list()).toEqual([]);
    await expect(service.get('bat-ky')).rejects.toBeInstanceOf(TransportDomainError);
  });
});
