import { Injectable, Optional } from '@nestjs/common';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { TransportDomainError } from '../transport.errors.js';
import { CounterpartyRepository } from './counterparty.repository.js';
import { CounterpartySiteRepository, type UpdateCounterpartySiteInput } from './site.repository.js';
import type { CounterpartySite, CounterpartySiteView } from './site.types.js';

export interface CreateCounterpartySiteCommand {
  readonly name: string;
  readonly address?: string | null;
  readonly note?: string | null;
  readonly status?: 'ACTIVE' | 'INACTIVE';
}

/**
 * DIA DIEM VAN HANH — `#267` H1.
 *
 * ============================================================================================
 * DANH TINH DO MAY CHU DAT, LUON LUON
 * ============================================================================================
 *
 * Khong mot lenh nao o day nhan `id` cua dia diem tu nguoi goi luc TAO. `#267` H1 doi
 * *"server-managed identity; no caller-provided arbitrary tenant identity"*, va cach chac chan
 * nhat de tuan thu la khong co cho de truyen vao: `cuid` do DB sinh.
 *
 * ============================================================================================
 * KHONG CO DUONG XOA, VA KHONG CO DUONG TAO TU OCR
 * ============================================================================================
 *
 * Nghi mot dia diem la `status = INACTIVE` (`GD-02`, huy thay xoa) — mot kho da tung nhan hang
 * phai con doc lai duoc tu lich su chuyen.
 *
 * Va khong ham nao o day nhan mot chuoi trich xuat: `#267` H1 viet *"no automatic counterparty
 * creation from OCR text"*. Mot ten cong ty doc tu anh chup phieu la mot GOI Y; bien no thanh mot
 * hang master data la viec cua nguoi, qua chinh duong HTTP nay.
 */
@Injectable()
export class CounterpartySiteService {
  constructor(
    private readonly sites: CounterpartySiteRepository,
    private readonly counterparties: CounterpartyRepository,
    @Optional() private readonly audit?: AuditLogService,
  ) {}

  async list(counterpartyId: string): Promise<readonly CounterpartySite[]> {
    await this.requireCounterparty(counterpartyId);
    return this.sites.listForCounterparty(counterpartyId);
  }

  async get(id: string): Promise<CounterpartySiteView> {
    const site = await this.requireSite(id);
    const counterparty = await this.requireCounterparty(site.counterpartyId);
    return { site, counterpartyId: counterparty.id, counterpartyName: counterparty.name };
  }

  /**
   * KHUNG NHIN cua MOT dia diem CON HIEU LUC — `null` khi khong co that, da nghi, hoac phap nhan
   * chu khong doc duoc.
   *
   * MOT gia tri `null` cho ca ba, va do la co y: `#267` H7 doi *"Unknown versus foreign IDs do not
   * create useful enumeration"*. Ba cau tra loi rieng se cho mot nguoi go bua mot `siteId` biet
   * cai nao CO TON TAI.
   */
  async activeView(id: string): Promise<CounterpartySiteView | null> {
    const site = await this.sites.find(id);
    if (!site || site.status !== 'ACTIVE') return null;
    const counterparty = await this.counterparties.find(site.counterpartyId);
    if (!counterparty) return null;
    return { site, counterpartyId: counterparty.id, counterpartyName: counterparty.name };
  }

  /**
   * KHUNG NHIN theo LO — mot truy van cho danh sach dia diem, roi mot lan doc phap nhan cho moi
   * phap nhan RIENG BIET.
   *
   * Vong lap doc phap nhan bi CHAN TREN boi so ung vien ma tang goi da cat (`maxCandidates`), nen
   * no khong phai mot truy van N+1 mo. Mot dia diem tro toi mot phap nhan khong doc duoc thi BI BO
   * QUA — mot the "Ban dang o ???" te hon mot the khong hien ra.
   */
  async activeViews(ids: readonly string[]): Promise<readonly CounterpartySiteView[]> {
    const sites = await this.sites.findManyActive(ids);
    const parties = new Map<string, Awaited<ReturnType<CounterpartyRepository['find']>>>();
    for (const partyId of new Set(sites.map((site) => site.counterpartyId))) {
      parties.set(partyId, await this.counterparties.find(partyId));
    }
    return sites.flatMap((site) => {
      const counterparty = parties.get(site.counterpartyId);
      if (!counterparty) return [];
      return [{ site, counterpartyId: counterparty.id, counterpartyName: counterparty.name }];
    });
  }

  async create(
    counterpartyId: string,
    command: CreateCounterpartySiteCommand,
    actor: string,
  ): Promise<CounterpartySite> {
    await this.requireCounterparty(counterpartyId);
    if (await this.sites.findByName(counterpartyId, command.name)) {
      throw TransportDomainError.conflict(
        'COUNTERPARTY_SITE_NAME_TAKEN',
        `Phap nhan nay da co dia diem ten "${command.name}"`,
      );
    }

    const site = await this.sites.create({
      counterpartyId,
      name: command.name,
      address: command.address ?? null,
      note: command.note ?? null,
      status: command.status ?? 'ACTIVE',
      recordedBy: actor,
    });

    await this.audit?.append({
      actor,
      action: 'transport.counterparty_site.create',
      entityType: 'TransportCounterpartySite',
      entityId: site.id,
      before: null,
      after: site,
    });
    return site;
  }

  async update(
    id: string,
    patch: UpdateCounterpartySiteInput,
    actor: string,
  ): Promise<CounterpartySite> {
    const before = await this.requireSite(id);
    if (patch.name !== undefined && patch.name !== before.name) {
      const clash = await this.sites.findByName(before.counterpartyId, patch.name);
      if (clash && clash.id !== id) {
        throw TransportDomainError.conflict(
          'COUNTERPARTY_SITE_NAME_TAKEN',
          `Phap nhan nay da co dia diem ten "${patch.name}"`,
        );
      }
    }

    const after = await this.sites.update(id, patch);
    if (!after) {
      throw TransportDomainError.notFound(
        'COUNTERPARTY_SITE_NOT_FOUND',
        'Khong tim thay dia diem van hanh',
      );
    }

    await this.audit?.append({
      actor,
      action: 'transport.counterparty_site.update',
      entityType: 'TransportCounterpartySite',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  private async requireSite(id: string): Promise<CounterpartySite> {
    const site = await this.sites.find(id);
    if (!site) {
      throw TransportDomainError.notFound(
        'COUNTERPARTY_SITE_NOT_FOUND',
        'Khong tim thay dia diem van hanh',
      );
    }
    return site;
  }

  private async requireCounterparty(id: string) {
    const counterparty = await this.counterparties.find(id);
    if (!counterparty) {
      throw TransportDomainError.notFound(
        'COUNTERPARTY_NOT_FOUND',
        'Khong tim thay phap nhan nao mang ma do',
      );
    }
    return counterparty;
  }
}
