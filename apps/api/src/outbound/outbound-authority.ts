import { createHash } from 'node:crypto';
import type {
  AgentTrace,
  OrderStatus,
  OutboundAuthority,
  OutboundAuthorityDenyReason,
  OutboundAuthorityGrant,
  OutboundAuthorityVerdict,
  OutboundClaimClass,
  OutboundCommitmentLevel,
  OutboundProvenance,
  PolicyType,
  PricedOrder,
} from '@netviet/shared';
import {
  authorizedAmounts,
  claimedCommitmentLevel,
  commitmentToken,
  monetaryLiterals,
  policyClaimTokens,
} from './outbound-claims.js';

/**
 * CONG THAM QUYEN CUA TIN GUI RA — mot tin chi tro thanh "gui duoc cho khach" o day.
 *
 * ---------------------------------------------------------------------------------------------
 * BAT BIEN. LLM duoc phan loai, trich xuat, tom tat, soan va DE XUAT. LLM khong phai tham quyen
 * cho tien, VAT/COD/cuoc, dieu khoan cong no/thanh toan, quyen huong khuyen mai, phe duyet, hay
 * bat ky cau noi nao ham y mot trang thai nghiep vu da xay ra.
 *
 * ---------------------------------------------------------------------------------------------
 * MO HINH, doc theo dung chieu nay:
 *
 *   NGUON TAT DINH  --cap-->   GRANT (lop + gia tri duoc uy quyen)
 *   BAN NHAP        --mang-->  VAT MANG KHANG DINH
 *   CONG NAY        --cho phep khi--> moi vat mang deu nam trong grant
 *
 * CAP PHEP chi di mot chieu: tu `priceOrder()`, bang gia hien hanh, cap dai ly da map, trang thai
 * don da ben vung. `outbound-claims.ts` KHONG cap phep duoc gi.
 *
 * ---------------------------------------------------------------------------------------------
 * BAN SUA 04/09/2026 — REVIEW DOC LAP CHI RA BA DUONG DI VONG. Doan nay giai thich vi sao ham
 * `decideOutboundAuthority` ben duoi trong nhu bay gio.
 *
 * B1 (nghiem trong nhat) — ban dau nhanh cuoi cua ham la:
 *
 *     return surfaced.length ? AUTHORITY_SATISFIED : NO_CONSEQUENTIAL_CLAIM;   // ca hai sendable
 *
 * Tuc: ba bo trich khong nhan ra gi => CHO GUI. Bo trich van ban vi the nam TRONG ranh gioi cho
 * phep, dung dieu muc 4 hop dong cam. Mot cach dien dat ngoai tu dien la mot duong di vong, va
 * ba cau tieng Viet BINH THUONG deu di lot: "Tổng đơn là 1.150.000." (so tien khong hau to),
 * "Anh được thanh toán sau 30 ngày." (cum chinh sach ngoai tu dien), "Đơn của anh đã vào hệ thống
 * rồi." (dong tu cam ket ngoai tu dien).
 *
 * Cach sua KHONG phai them ba cum tu do vao ba tu dien. Cach sua la doi thu ma cong nay nhin:
 * `outbound-claims.ts` nay tim VAT MANG (chu so / so ngay / the hoan thanh + danh tu don) — dac
 * diem hinh dang ma mot khang dinh KHONG THE khong co. Tu dien tut xuong vai tro phu: noi ro
 * khang dinh thuoc loai nao, chu khong con quyet dinh co khang dinh hay khong.
 *
 * B2 — mot so tien tung duoc uy quyen bang TAP CHUOI chu so, trong do co ca dang rut gon: uy
 * quyen 1.150.000d them ca chuoi "1150", the la ban nhap noi "1150d" di lot. Nay moi cach viet
 * duoc quy ve DUNG MOT GIA TRI VND nguyen roi moi so khop gia tri voi gia tri.
 *
 * B3 — grant tung chi mang LOP: `payment_terms` phu cho ca "ký gửi" lan "thanh toán ngay" (hai
 * chinh sach trai nguoc), va mot the `order_recorded` duy nhat phu cho ca "đã ghi nhận" lan "đã
 * chốt". Nay chinh sach mang ma chinh xac tung loai, cam ket don mang MUC theo thang bac.
 *
 * VI SAO KHONG DI LOI "CAM HET MOI CON SO": muc 6 hop dong cam giai bai toan bang cach chan sach.
 * Don da tinh gia van phai gui duoc dung tung dong, chinh sach cua dai ly da map van phai noi
 * duoc — chi khac la con so va cau chinh sach do phai den TU KET QUA TAT DINH.
 */

/* ------------------------------------------------------------------ *
 * CAP THAM QUYEN — chi tu nguon tat dinh
 * ------------------------------------------------------------------ */

/**
 * TRANG THAI DON -> CAC MUC CAM KET ma no uy quyen. Bang DAY DU tren `OrderStatus`.
 *
 * Cong don theo thang bac: `approved` cho phep noi "da chot", va do do cung cho phep cau nhe hon
 * "da ghi nhan". Chieu nguoc lai thi khong: mot don `needs_edit` KHONG cho phep noi "da chot don"
 * — do la ca B3 cua review doc lap, va la ly do cot nay khong con la mot danh sach `OrderStatus[]`.
 *
 * `draft` khong cap gi: mot ban nhap dang thu thap chua phai mot don. `rejected` khong cap gi:
 * noi da ghi nhan mot don vua bi huy la cau sai nguy hiem nhat trong ca nhom nay.
 *
 * Kieu `Record<OrderStatus, ...>` la co y — them mot trang thai don moi se KHONG bien dich duoc
 * cho den khi ai do quyet dinh no uy quyen den muc nao.
 */
const COMMITMENT_LEVELS_BY_STATE: Readonly<
  Record<OrderStatus, readonly OutboundCommitmentLevel[]>
> = {
  draft: [],
  rejected: [],
  pending_review: ['recorded'],
  needs_edit: ['recorded'],
  approved: ['recorded', 'confirmed'],
  sent: ['recorded', 'confirmed', 'fulfilled'],
  synced: ['recorded', 'confirmed', 'fulfilled'],
};

/** Trang thai co cap it nhat mot muc cam ket — tien cho ben goi muon hoi nhanh. */
export const ORDER_COMMITMENT_STATES: readonly OrderStatus[] = (
  Object.keys(COMMITMENT_LEVELS_BY_STATE) as OrderStatus[]
).filter((status) => COMMITMENT_LEVELS_BY_STATE[status].length > 0);

/**
 * CHINH SACH CUA RULES ENGINE -> nhung ma khang dinh chinh sach ma no uy quyen.
 *
 * BANG TUONG MINH, khong suy tu ten enum. Hai ly do: (a) `cong_no_30` -> 30 la mot phep doc ten
 * bien, va doi ten enum se lam doi tham quyen ma khong ai thay; (b) mot khach moi them mot loai
 * chinh sach se buoc phai quyet dinh o day no uy quyen gi — trinh bien dich hoi, khong phai review.
 *
 * MA CHINH XAC TUNG LOAI (`payment_policy:ky_gui`) la ban sua B3: truoc day ca nam loai deu chi
 * cap mot ma chung `payment_terms`, nen mot dai ly "thanh toan ngay" van cap phep cho ban nhap
 * noi ve "ky gui". Ho `payment_policy:cong_no` van duoc cap kem de cau khong neu ky han ("bên
 * mình có công nợ") noi duoc, con `terms_days:<N>` moi la thu khoa dung CON SO ngay.
 */
const POLICY_GRANT_TOKENS: Readonly<Record<PolicyType, readonly string[]>> = {
  cong_no_30: ['payment_policy:cong_no', 'payment_policy:cong_no_30', 'terms_days:30'],
  cong_no_45: ['payment_policy:cong_no', 'payment_policy:cong_no_45', 'terms_days:45'],
  ky_gui: ['payment_policy:ky_gui'],
  thanh_toan_ngay: ['payment_policy:thanh_toan_ngay'],
  cod: ['payment_policy:cod', 'cod'],
};

function policyClaimsOf(policy: PolicyType): readonly string[] {
  return POLICY_GRANT_TOKENS[policy];
}

function grant(
  claim: OutboundClaimClass,
  source: OutboundAuthorityGrant['source'],
  authorized: readonly string[],
): OutboundAuthorityGrant[] {
  // Mot grant rong la mot cai gat dau trong: no cap mot LOP ma khong cap gia tri nao, va phep
  // kiem se tro thanh so sanh voi tap rong — tuc luon dat. Khong co gia tri thi khong co grant.
  return authorized.length ? [{ claim, source, authorized: [...new Set(authorized)] }] : [];
}

/**
 * THAM QUYEN TU MOT DON DA TINH GIA (`priceOrder()`).
 *
 * Uy quyen chinh xac nhung con so rules engine da tinh, va chi nhung loai chinh sach ma CO CUA
 * chinh ket qua do bat len (`policy`, `vat`, `codCollect`, `shippingFee`). Mot don khong bat VAT
 * thi khong uy quyen mot cau nao ve VAT — du don do co tong tien.
 */
export function grantsFromPricedOrder(priced: PricedOrder): OutboundAuthorityGrant[] {
  const amounts = [
    ...priced.lines.flatMap((line) => [line.unitPrice, line.lineTotal]),
    priced.itemsSubtotal,
    priced.shippingFee,
    priced.codFee,
    priced.vatAmount,
    priced.grandTotal,
  ];
  const policies: string[] = [
    ...(priced.policy ? policyClaimsOf(priced.policy) : []),
    ...(priced.vat ? ['vat'] : []),
    ...(priced.codCollect ? ['cod'] : []),
    ...(priced.shippingFee > 0 ? ['shipping'] : []),
  ];
  return [
    ...grant('financial', 'rules.pricing', authorizedAmounts(amounts)),
    ...grant('policy', 'rules.pricing', policies),
  ];
}

/** THAM QUYEN TU MOT LAN BAO GIA (bang gia hien hanh, tra qua rules) — chi la tien, khong la don. */
export function grantsFromQuote(unitPrices: readonly number[]): OutboundAuthorityGrant[] {
  return grant('financial', 'rules.quote', authorizedAmounts(unitPrices));
}

/** THAM QUYEN TU CAP DAI LY DA MAP — chinh sach mac dinh cua ho, khong phai bien the model viet. */
export function grantsFromDealerPolicy(policy: PolicyType | null): OutboundAuthorityGrant[] {
  return policy ? grant('policy', 'rules.policy', policyClaimsOf(policy)) : [];
}

/**
 * THAM QUYEN TU MOT DON DA BEN VUNG.
 *
 * Hai thu cung luc: quyen NOI rang don dang o muc nao, va quyen NHAC LAI cac con so cua chinh don
 * do (chung da di qua rules engine roi moi duoc luu).
 */
export function grantsFromPersistedOrder(order: {
  readonly status: OrderStatus;
  readonly priced: PricedOrder | null;
}): OutboundAuthorityGrant[] {
  const levels = COMMITMENT_LEVELS_BY_STATE[order.status];
  if (!levels.length) return [];
  return [
    ...grant('order_commitment', 'order.state', levels.map(commitmentToken)),
    ...(order.priced
      ? grant(
          'financial',
          'order.state',
          authorizedAmounts([
            ...order.priced.lines.flatMap((line) => [line.unitPrice, line.lineTotal]),
            order.priced.itemsSubtotal,
            order.priced.grandTotal,
          ]),
        )
      : []),
  ];
}

/** Gom nhieu nguon thanh mot bao tham quyen cua LUOT. */
export function mergeAuthority(
  ...parts: readonly (readonly OutboundAuthorityGrant[])[]
): OutboundAuthority {
  return { grants: parts.flat() };
}

export const NO_AUTHORITY: OutboundAuthority = { grants: [] };

/* ------------------------------------------------------------------ *
 * DAU CUA DOAN VAN DA XET
 * ------------------------------------------------------------------ */

/**
 * DAU cua DUNG doan van ma mot phan quyet duoc cap cho.
 *
 * Khuyen nghi cua review doc lap: mot verdict PASS khong duoc phep song sot neu van ban bi thay
 * sau luc soan. Khong co dau nay thi "soan mot cau vo hai -> duoc duyet -> sua noi dung -> bam
 * gui" la mot duong di vong hoan chinh, va no khong de lai dau vet nao.
 *
 * BO QUA KHOANG TRANG: duong gui con noi them nhan tu dong va dong link anh vao cuoi. Neu dau doi
 * theo tung khoang trang thi cong se bao dong gia moi lan gui, va mot cong bao dong gia lien tuc
 * la mot cong sap bi tat. Thay doi CO NGHIA thi luon lam doi dau.
 */
export function outboundFingerprint(text: string): string {
  return createHash('sha256').update(text.replace(/\s+/gu, ' ').trim()).digest('hex').slice(0, 32);
}

/* ------------------------------------------------------------------ *
 * XET THAM QUYEN
 * ------------------------------------------------------------------ */

export interface OutboundCandidate {
  /** Van ban se den tay khach. */
  readonly text: string;
  readonly provenance: OutboundProvenance;
}

/**
 * THU TU XET co dinh: tien -> chinh sach -> cam ket don.
 *
 * Co dinh de mot ban nhap hong o nhieu lop luon bao cung mot ma dau — hai lan chay cung mot ca
 * ra hai ma khac nhau la thu lam hong ca viec doi soat lan ca bo test.
 */
const DENIAL_ORDER: readonly OutboundClaimClass[] = ['financial', 'policy', 'order_commitment'];

/**
 * Ban nhap nay co tro thanh mot tin GUI DUOC CHO KHACH khong?
 *
 * `deterministic` di thang: van ban do chinh tang tat dinh dung tu ket qua cua no, nen kiem lai
 * la kiem chinh minh. `llm_draft` phai chung minh TUNG VAT MANG.
 */
export function decideOutboundAuthority(
  candidate: OutboundCandidate,
  authority: OutboundAuthority,
): OutboundAuthorityVerdict {
  const fingerprint = outboundFingerprint(candidate.text);
  const surfaced = surfacedClaimClasses(candidate.text);
  if (candidate.provenance === 'deterministic') {
    return { sendable: true, reason: 'DETERMINISTIC_AUTHORITY', claims: surfaced, fingerprint };
  }

  const denials = new Map<OutboundClaimClass, OutboundAuthorityDenyReason>();

  // TIEN — moi con so mang nghia tien phai la MOT GIA TRI da duoc uy quyen. Con so khong quy duoc
  // ve mot gia tri duy nhat (`value === null`) bi coi la chua duoc uy quyen: mot cach viet nhap
  // nhang khong duoc tu chon nghia co loi cho no.
  const money = monetaryLiterals(candidate.text);
  if (money.length) {
    const allowed = authorizedValues(authority, 'financial');
    if (!allowed) denials.set('financial', 'FINANCIAL_AUTHORITY_MISSING');
    else if (money.some((literal) => !allowed.has(String(literal.value)))) {
      denials.set('financial', 'FINANCIAL_VALUE_NOT_AUTHORIZED');
    }
  }

  // CHINH SACH — ma chinh xac tung loai, cong voi moi so ngay xuat hien trong bai.
  const policies = policyClaimTokens(candidate.text);
  if (policies.length) {
    const allowed = authorizedValues(authority, 'policy');
    if (!allowed) denials.set('policy', 'POLICY_AUTHORITY_MISSING');
    else if (policies.some((code) => !allowed.has(code))) {
      denials.set('policy', 'POLICY_STATEMENT_NOT_AUTHORIZED');
    }
  }

  // CAM KET DON — dung MUC ma cau noi tuyen bo, khong phai "co noi ve don hay khong".
  const level = claimedCommitmentLevel(candidate.text);
  if (level) {
    const allowed = authorizedValues(authority, 'order_commitment');
    if (!allowed) denials.set('order_commitment', 'ORDER_COMMITMENT_NOT_AUTHORIZED');
    else if (!allowed.has(commitmentToken(level))) {
      denials.set('order_commitment', 'ORDER_COMMITMENT_LEVEL_NOT_AUTHORIZED');
    }
  }

  if (denials.size) {
    const missing = DENIAL_ORDER.filter((claim) => denials.has(claim));
    return { sendable: false, reason: denials.get(missing[0]!)!, missing, fingerprint };
  }
  return surfaced.length
    ? { sendable: true, reason: 'AUTHORITY_SATISFIED', claims: surfaced, fingerprint }
    : { sendable: true, reason: 'NO_CONSEQUENTIAL_CLAIM', claims: [], fingerprint };
}

/** `null` = KHONG co grant nao cho lop nay (khac han "co grant nhung tap gia tri khong khop"). */
function authorizedValues(
  authority: OutboundAuthority,
  claim: OutboundClaimClass,
): Set<string> | null {
  const values = authority.grants
    .filter((entry) => entry.claim === claim)
    .flatMap((entry) => entry.authorized);
  return values.length ? new Set(values) : null;
}

/** Lop khang dinh he qua CO MAT trong van ban — dung de bao cao, khong dung de cap phep. */
export function surfacedClaimClasses(text: string): OutboundClaimClass[] {
  const classes: OutboundClaimClass[] = [];
  if (monetaryLiterals(text).length) classes.push('financial');
  if (policyClaimTokens(text).length) classes.push('policy');
  if (claimedCommitmentLevel(text)) classes.push('order_commitment');
  return classes;
}

/* ------------------------------------------------------------------ *
 * CUONG CHE O DIEM NGHEN GUI
 * ------------------------------------------------------------------ */

/**
 * VERDICT DA GHIM tren mot ban ghi luot — thu ma duong GUI doc, VA doan van no duoc cap cho.
 *
 * Hai cach hong duoc chan o day, va chung khac nhau:
 *
 *   · VANG MAT PHAN QUYET (`AUTHORITY_DECISION_ABSENT`) — ban ghi soan truoc ban nay, mot duong
 *     soan moi quen goi cong, hay mot `trace.outbound` dung bang tay.
 *   · PHAN QUYET CUA DOAN VAN KHAC (`AUTHORITY_PAYLOAD_MISMATCH`) — co phan quyet, nhung noi dung
 *     da doi ke tu luc no duoc cap. Ban ghi cu (chua co dau) cung roi vao day: khong chung minh
 *     duoc phan quyet thuoc ve chinh doan van nay thi khong gui.
 *
 * Vi sao doc verdict DA GHIM chu khong tinh lai: luc gui, ngu canh tat dinh cua luot (ket qua
 * `priceOrder`, ket qua cong cu, cap dai ly luc do) khong con nua. Tinh lai voi mot bao tham quyen
 * rong se lam MOI ban tu van hop le bi tu choi.
 *
 * `text` la van ban DA SOAN (`trace.outbound.text`), khong phai chuoi cuoi cung ra kenh: duong
 * gui con noi them nhan tu dong va link anh, va do la thu nen tang tu them chu khong phai model
 * viet. Neu doi dau tren chuoi cuoi cung thi moi tin deu lech dau.
 */
export function pinnedOutboundVerdict(
  trace: AgentTrace | undefined,
  text: string,
): OutboundAuthorityVerdict {
  const verdict = trace?.outboundAuthority;
  if (!verdict) {
    return { sendable: false, reason: 'AUTHORITY_DECISION_ABSENT', missing: [] };
  }
  const fingerprint = outboundFingerprint(text);
  if (verdict.fingerprint !== fingerprint) {
    return {
      sendable: false,
      reason: 'AUTHORITY_PAYLOAD_MISMATCH',
      missing: verdict.sendable ? [] : verdict.missing,
      fingerprint,
    };
  }
  return verdict;
}
