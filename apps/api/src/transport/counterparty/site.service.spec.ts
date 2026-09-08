import { beforeEach, describe, expect, it } from 'vitest';
import {
  CounterpartyRepository,
  InMemoryCounterpartyRepository,
} from './counterparty.repository.js';
import {
  CounterpartySiteRepository,
  InMemoryCounterpartySiteRepository,
} from './site.repository.js';
import { CounterpartySiteService } from './site.service.js';

/**
 * DIA DIEM VAN HANH — `#267` H1.
 *
 * Bo bai nay khoa BON dieu ma `#267` H1 doi, va ba trong so do la nhung dieu KHONG duoc lam:
 *
 *   · danh tinh do may chu dat (khong co duong truyen `id` vao);
 *   · khong duong xoa (nghi viec la `status`);
 *   · khong truong tien nao di qua duong ghi;
 *   · hai kho cua mot phap nhan khong trung ten.
 */
describe('CounterpartySiteService — `#267` H1', () => {
  let sites: CounterpartySiteRepository;
  let counterparties: CounterpartyRepository;
  let service: CounterpartySiteService;
  let counterpartyId: string;

  beforeEach(async () => {
    sites = new InMemoryCounterpartySiteRepository();
    counterparties = new InMemoryCounterpartyRepository();
    service = new CounterpartySiteService(sites, counterparties);
    const party = await counterparties.create({ name: 'Cong ty ABC' });
    counterpartyId = party.id;
  });

  it('mot phap nhan mang NHIEU dia diem — day la ca ly do bang nay ton tai', async () => {
    await service.create(counterpartyId, { name: 'Kho Hai Phong' }, 'operator');
    await service.create(counterpartyId, { name: 'Nha may Que Vo 2' }, 'operator');

    const all = await service.list(counterpartyId);
    expect(all.map((site) => site.name)).toEqual(['Kho Hai Phong', 'Nha may Que Vo 2']);
    expect(new Set(all.map((site) => site.counterpartyId))).toEqual(new Set([counterpartyId]));
  });

  /**
   * `#267` H1: *"server-managed identity; no caller-provided arbitrary tenant identity"*. Cach
   * chac chan nhat de tuan thu la khong co cho de truyen vao — nen bai nay khang dinh mot dieu ve
   * HINH DANG cua lenh, khong ve mot nhanh `if`.
   */
  it('danh tinh do may chu dat — hai lan tao cung ten cho ra hai id khac nhau o hai phap nhan', async () => {
    const other = await counterparties.create({ name: 'Cong ty XYZ' });
    const first = await service.create(counterpartyId, { name: 'Kho Hai Phong' }, 'operator');
    const second = await service.create(other.id, { name: 'Kho Hai Phong' }, 'operator');

    expect(first.id).not.toBe(second.id);
    expect(first.id).toMatch(/.+/);
  });

  it('hai kho CUNG mot phap nhan khong duoc trung ten', async () => {
    await service.create(counterpartyId, { name: 'Kho Hai Phong' }, 'operator');
    await expect(
      service.create(counterpartyId, { name: 'Kho Hai Phong' }, 'operator'),
    ).rejects.toMatchObject({ reason: 'COUNTERPARTY_SITE_NAME_TAKEN' });
  });

  it('doi ten sang mot ten da co trong CUNG phap nhan bi chan', async () => {
    const a = await service.create(counterpartyId, { name: 'Kho A' }, 'operator');
    await service.create(counterpartyId, { name: 'Kho B' }, 'operator');
    await expect(service.update(a.id, { name: 'Kho B' }, 'operator')).rejects.toMatchObject({
      reason: 'COUNTERPARTY_SITE_NAME_TAKEN',
    });
  });

  it('doi ten thanh CHINH ten cu khong bi coi la trung', async () => {
    const site = await service.create(counterpartyId, { name: 'Kho A' }, 'operator');
    const after = await service.update(site.id, { name: 'Kho A', address: 'So 1' }, 'operator');
    expect(after.address).toBe('So 1');
  });

  /** `GD-02` — nghi viec la mot trang thai, khong phai mot lenh xoa. */
  it('nghi mot dia diem la doi `status`, va hang van doc lai duoc', async () => {
    const site = await service.create(counterpartyId, { name: 'Kho cu' }, 'operator');
    const after = await service.update(site.id, { status: 'INACTIVE' }, 'operator');

    expect(after.status).toBe('INACTIVE');
    expect(await sites.find(site.id)).not.toBeNull();
    expect(await sites.listActive()).toEqual([]);
  });

  it('dia chi NULL nghia la CHUA NHAP, va no khac chuoi rong', async () => {
    const site = await service.create(counterpartyId, { name: 'Kho moi' }, 'operator');
    expect(site.address).toBeNull();
  });

  it('khong tao duoc dia diem cho mot phap nhan khong co that', async () => {
    await expect(
      service.create('khong-co-that', { name: 'Kho ma' }, 'operator'),
    ).rejects.toMatchObject({ reason: 'COUNTERPARTY_NOT_FOUND' });
  });

  it('doc mot dia diem khong co that tra ve ma RIENG, khong phai ma cua phap nhan', async () => {
    await expect(service.get('khong-co-that')).rejects.toMatchObject({
      reason: 'COUNTERPARTY_SITE_NOT_FOUND',
    });
  });

  it('khung nhin doc mang theo TEN phap nhan — man hinh lai xe in ra hai dong', async () => {
    const site = await service.create(counterpartyId, { name: 'Kho Hai Phong' }, 'operator');
    const view = await service.get(site.id);

    expect(view.counterpartyName).toBe('Cong ty ABC');
    expect(view.site.name).toBe('Kho Hai Phong');
  });

  /**
   * `#267` H1: *"no money semantics"*. Bai nay quet chinh doi tuong tra ve, nen mot cot tien them
   * vao bang se lam no do — ke ca khi khong ai sua bai nay.
   */
  it('khong mot truong tien nao di qua duong ghi', async () => {
    const site = await service.create(
      counterpartyId,
      { name: 'Kho Hai Phong', address: 'KCN Dinh Vu' },
      'operator',
    );
    const keys = Object.keys(site).join(' ').toLowerCase();
    for (const money of ['amount', 'price', 'currency', 'freight', 'fee', 'cost', 'rate']) {
      expect(keys).not.toContain(money);
    }
  });
});
