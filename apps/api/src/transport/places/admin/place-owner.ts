import type { Counterparty, CounterpartyLink } from '../../counterparty/counterparty.types.js';
import type { CounterpartySite } from '../../counterparty/site.types.js';
import type { PlaceWriteTx } from '../../proof/place-write.store.js';
import { TransportDomainError } from '../../transport.errors.js';
import { PlaceAdminError } from './place-admin-error.js';
import type { CreatePlaceCommand, PlaceOwnerInput } from './place-admin.types.js';

/**
 * CHU cua mot dia diem MOI cua don vi khac (`#395`) — "Dia diem nay cua ai?".
 *
 *   · kho / cua hang cua mot KHACH HANG — dung phap nhan da noi voi khach do; chua co thi TAO phap
 *     nhan (ten + ma so thue cua khach) va lien ket `CUSTOMER` trong CUNG giao dich. Mot phap nhan
 *     co san mang dung ma so thue cua khach la CUNG mot doanh nghiep (ma so thue la danh tinh manh
 *     nhat — xem `TransportCounterparty` trong schema), nen khach duoc noi vao phap nhan do;
 *   · nha may / kho cua MOT DON VI co san;
 *   · mot DON VI MOI (ten, ma so thue tuy chon) tao ngay tai cho;
 *   · hoac gan vi tri vao mot DIA DIEM CO SAN chua co hang rao.
 *
 * Chay BEN TRONG giao dich cua `PlaceWriteStore`, sau khoa. Moi phep kiem dung truoc lan ghi dau
 * tien cua nhanh do.
 */

export interface PlaceOwnerOutcome {
  readonly party: Counterparty;
  readonly partyCreated: boolean;
  /** Lien ket khach hang VUA tao trong lan nay (neu co). */
  readonly linkCreated: CounterpartyLink | null;
  readonly customerId: string | null;
  readonly site: CounterpartySite;
  readonly siteBefore: CounterpartySite | null;
}

/** Khuon ma so thue cua `TransportCounterparty_taxCode_shape` — khuon khac thi bo (NULL). */
const TAX_CODE_SHAPE = /^[0-9]{10}(-[0-9]{3})?$/;

/** Chu cua dia diem (don vi / khach hang) da ngung hoat dong — dung chung cho tao va bat lai. */
export const ownerInactive = (name: string): TransportDomainError =>
  TransportDomainError.conflict(
    'PLACE_OWNER_INACTIVE',
    `"${name}" đã ngừng hoạt động — bật lại đơn vị hoặc khách hàng này trước khi thêm hoặc bật địa điểm của họ.`,
  );

export async function resolveSiteOwner(
  tx: PlaceWriteTx,
  command: CreatePlaceCommand,
  actor: string,
): Promise<PlaceOwnerOutcome> {
  if (command.siteId !== undefined) return attachToExistingSite(tx, command, command.siteId);
  if (command.owner === undefined) {
    throw TransportDomainError.invalid(
      'PLACE_OWNER_REQUIRED',
      'Hãy chọn địa điểm này của ai: một khách hàng, một đơn vị có sẵn, hoặc thêm đơn vị mới.',
    );
  }
  const owner = await partyFor(tx, command.owner, actor);
  const existing = await tx.sites.findByName(owner.party.id, command.name);
  if (existing) {
    throw new PlaceAdminError(
      'CONFLICT',
      'COUNTERPARTY_SITE_NAME_TAKEN',
      `"${owner.party.name}" đã có địa điểm "${existing.name}" — chọn địa điểm đó để gắn vị trí.`,
      { siteId: existing.id, siteName: existing.name, counterpartyName: owner.party.name },
    );
  }
  const site = await tx.sites.create({
    counterpartyId: owner.party.id,
    name: command.name,
    address: command.address ?? null,
    note: null,
    status: 'ACTIVE',
    recordedBy: actor,
  });
  return { ...owner, site, siteBefore: null };
}

async function attachToExistingSite(
  tx: PlaceWriteTx,
  command: CreatePlaceCommand,
  siteId: string,
): Promise<PlaceOwnerOutcome> {
  if (command.owner !== undefined && !('counterpartyId' in command.owner)) {
    throw TransportDomainError.invalid(
      'PLACE_OWNER_INVALID',
      'Gắn vị trí vào địa điểm có sẵn thì chủ là đơn vị của địa điểm đó — không chọn thêm chủ khác.',
    );
  }
  const site = await tx.sites.find(siteId);
  if (!site) {
    throw TransportDomainError.notFound('COUNTERPARTY_SITE_NOT_FOUND', 'Không tìm thấy địa điểm.');
  }
  if (command.owner !== undefined && command.owner.counterpartyId !== site.counterpartyId) {
    throw TransportDomainError.invalid(
      'PLACE_SITE_OWNER_MISMATCH',
      'Địa điểm được chọn không thuộc đơn vị đã chọn.',
    );
  }
  const fenced = await tx.geofences.listAll({
    subjectKinds: ['COUNTERPARTY_SITE'],
    subjectIds: [site.id],
  });
  if (fenced.length > 0) {
    throw TransportDomainError.conflict(
      'PLACE_SITE_ALREADY_FENCED',
      `"${site.name}" đã có vị trí trên bản đồ — sửa ở chính địa điểm đó.`,
    );
  }
  const party = await tx.counterparties.find(site.counterpartyId);
  if (!party) {
    throw TransportDomainError.notFound('COUNTERPARTY_NOT_FOUND', 'Không tìm thấy đơn vị.');
  }
  if (party.status !== 'ACTIVE') throw ownerInactive(party.name);

  // Ten dia diem DI THEO ten dia diem van hanh — hai ten cho mot cho la hai cach goi de lech nhau.
  const renamed = site.name !== command.name;
  if (renamed) {
    const clash = await tx.sites.findByName(site.counterpartyId, command.name);
    if (clash && clash.id !== site.id) {
      throw TransportDomainError.conflict(
        'COUNTERPARTY_SITE_NAME_TAKEN',
        `"${party.name}" đã có một địa điểm khác tên "${command.name}".`,
      );
    }
  }
  const updated = await tx.sites.update(site.id, {
    ...(renamed ? { name: command.name } : {}),
    ...(command.address === undefined ? {} : { address: command.address }),
    status: 'ACTIVE',
  });
  const links = await tx.counterparties.listLinks(party.id);
  return {
    party,
    partyCreated: false,
    linkCreated: null,
    customerId: links.find((link) => link.kind === 'CUSTOMER')?.subjectId ?? null,
    site: updated ?? site,
    siteBefore: site,
  };
}

type PartyOutcome = Omit<PlaceOwnerOutcome, 'site' | 'siteBefore'>;

async function partyFor(
  tx: PlaceWriteTx,
  owner: PlaceOwnerInput,
  actor: string,
): Promise<PartyOutcome> {
  if ('counterpartyId' in owner) {
    const party = await tx.counterparties.find(owner.counterpartyId);
    if (!party) {
      throw TransportDomainError.notFound('COUNTERPARTY_NOT_FOUND', 'Không tìm thấy đơn vị.');
    }
    if (party.status !== 'ACTIVE') throw ownerInactive(party.name);
    const links = await tx.counterparties.listLinks(party.id);
    return {
      party,
      partyCreated: false,
      linkCreated: null,
      customerId: links.find((link) => link.kind === 'CUSTOMER')?.subjectId ?? null,
    };
  }
  if ('customerId' in owner) return customerParty(tx, owner.customerId, actor);
  return newParty(tx, owner.newCounterparty);
}

async function customerParty(
  tx: PlaceWriteTx,
  customerId: string,
  actor: string,
): Promise<PartyOutcome> {
  const customer = await tx.customers.findCustomer(customerId);
  if (!customer) {
    throw TransportDomainError.notFound('CUSTOMER_NOT_FOUND', 'Không tìm thấy khách hàng.');
  }
  if (customer.status !== 'ACTIVE') throw ownerInactive(customer.name);

  const link = await tx.counterparties.findLinkBySubject('CUSTOMER', customer.id);
  if (link) {
    const party = await tx.counterparties.find(link.counterpartyId);
    if (!party) {
      throw TransportDomainError.notFound('COUNTERPARTY_NOT_FOUND', 'Không tìm thấy đơn vị.');
    }
    if (party.status !== 'ACTIVE') throw ownerInactive(party.name);
    return { party, partyCreated: false, linkCreated: null, customerId: customer.id };
  }

  const taxCode = customer.taxCode?.trim() ?? '';
  const usableTaxCode = TAX_CODE_SHAPE.test(taxCode) ? taxCode : null;
  const sameEntity = usableTaxCode ? await tx.counterparties.findByTaxCode(usableTaxCode) : null;
  if (sameEntity && sameEntity.status !== 'ACTIVE') throw ownerInactive(sameEntity.name);
  const party =
    sameEntity ??
    (await tx.counterparties.create({ name: customer.name, taxCode: usableTaxCode, note: null }));
  const created = await tx.counterparties.link({
    counterpartyId: party.id,
    kind: 'CUSTOMER',
    subjectId: customer.id,
    linkedBy: actor,
  });
  return { party, partyCreated: sameEntity === null, linkCreated: created, customerId: customer.id };
}

async function newParty(
  tx: PlaceWriteTx,
  input: { readonly name: string; readonly taxCode?: string | null },
): Promise<PartyOutcome> {
  const taxCode = input.taxCode ?? null;
  if (taxCode !== null) {
    const holder = await tx.counterparties.findByTaxCode(taxCode);
    if (holder) {
      throw new PlaceAdminError(
        'CONFLICT',
        'COUNTERPARTY_TAX_CODE_TAKEN',
        `Mã số thuế ${taxCode} đã thuộc "${holder.name}" — chọn đơn vị đó thay vì thêm mới.`,
        { counterpartyId: holder.id, counterpartyName: holder.name },
      );
    }
  }
  const party = await tx.counterparties.create({ name: input.name, taxCode, note: null });
  return { party, partyCreated: true, linkCreated: null, customerId: null };
}
