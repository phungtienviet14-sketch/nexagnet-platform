import type {
  AgentTrace,
  OrderStatus,
  OutboundAuthority,
  OutboundAuthorityDenyReason,
  OutboundAuthorityGrant,
  OutboundAuthorityVerdict,
  OutboundClaimClass,
  OutboundProvenance,
  PolicyType,
  PricedOrder,
} from '@netviet/shared';
import {
  ORDER_COMMITMENT_CLAIM,
  authorizedMoneyForms,
  claimsOrderCommitment,
  monetaryClaims,
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
 * TRUOC BAN NAY co sendable cua mot ban tu van duoc dat bang `ready: !reply.handoff` — tuc LLM tu
 * quyet dinh ban soan cua chinh no co gui duoc khong. Mot luot `intent=khac`, `priced=null`,
 * `sales=skipped`, `policy_finance=skipped` van ra `ready=true` trong khi ban nhap co don gia,
 * tong tien, chinh sach cong no va cau "da ghi nhan don". Thu duy nhat da chan lai la heuristic
 * do tin cay cua vai Giam sat — mot bo loc, khong phai mot ranh gioi tham quyen.
 *
 * ---------------------------------------------------------------------------------------------
 * MO HINH, doc theo dung chieu nay:
 *
 *   NGUON TAT DINH  --cap-->   GRANT (lop + gia tri duoc uy quyen)
 *   BAN NHAP        --mang-->  KHANG DINH CO HE QUA
 *   CONG NAY        --cho phep khi--> moi khang dinh nam trong grant
 *
 * CAP PHEP chi di mot chieu: tu `priceOrder()`, bang gia hien hanh, cap dai ly da map, trang thai
 * don da ben vung. `outbound-claims.ts` KHONG cap phep duoc gi — no chi doc ra be mat khang dinh,
 * va mot ma bi sot o do chi lam mat mot lop phong thu, khong bien mot khang dinh thanh hop le:
 * mot LOP khong co grant thi mac dinh la KHONG GUI DUOC.
 *
 * VI SAO KHONG DI LOI "CAM HET MOI CON SO": muc 6 hop dong cam giai bai toan bang cach chan sach.
 * Don da tinh gia van phai gui duoc dung tung dong, chinh sach cua dai ly da map van phai noi
 * duoc — chi khac la con so va cau chinh sach do phai den TU KET QUA TAT DINH, khong tu tri nho
 * cua model.
 */

/* ------------------------------------------------------------------ *
 * CAP THAM QUYEN — chi tu nguon tat dinh
 * ------------------------------------------------------------------ */

/**
 * Trang thai don CHO PHEP noi "da ghi nhan/chot don" — hop dong TUONG MINH, dong lai.
 *
 * `draft` khong co: mot ban nhap dang thu thap chua phai mot don. `rejected` khong co: noi da ghi
 * nhan mot don vua bi huy la cau sai nguy hiem nhat trong ca nhom nay.
 */
export const ORDER_COMMITMENT_STATES: readonly OrderStatus[] = [
  'pending_review',
  'needs_edit',
  'approved',
  'sent',
  'synced',
];

/**
 * CHINH SACH CUA RULES ENGINE -> nhung ma khang dinh chinh sach ma no uy quyen.
 *
 * BANG TUONG MINH, khong suy tu ten enum. Hai ly do: (a) `cong_no_30` -> 30 la mot phep doc ten
 * bien, va doi ten enum se lam doi tham quyen ma khong ai thay; (b) mot khach moi them mot loai
 * chinh sach se buoc phai quyet dinh o day no uy quyen gi — trinh bien dich hoi, khong phai review.
 *
 * MA CO GIA TRI (`payment_terms:30`) la thu chan mot ban nhap DOI CON SO: mot dai ly o ky han 45
 * ngay khong lam cho cau "cong no 30 ngay" tro thanh hop le, du ca hai deu la "dieu khoan cong no".
 */
const POLICY_GRANT_TOKENS: Readonly<Record<PolicyType, readonly string[]>> = {
  cong_no_30: ['payment_terms', 'payment_terms:30'],
  cong_no_45: ['payment_terms', 'payment_terms:45'],
  ky_gui: ['payment_terms'],
  thanh_toan_ngay: ['payment_terms'],
  cod: ['payment_terms', 'cod'],
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
    ...grant('financial', 'rules.pricing', authorizedMoneyForms(amounts)),
    ...grant('policy', 'rules.pricing', policies),
  ];
}

/** THAM QUYEN TU MOT LAN BAO GIA (bang gia hien hanh, tra qua rules) — chi la tien, khong la don. */
export function grantsFromQuote(unitPrices: readonly number[]): OutboundAuthorityGrant[] {
  return grant('financial', 'rules.quote', authorizedMoneyForms(unitPrices));
}

/** THAM QUYEN TU CAP DAI LY DA MAP — chinh sach mac dinh cua ho, khong phai bien the model viet. */
export function grantsFromDealerPolicy(policy: PolicyType | null): OutboundAuthorityGrant[] {
  return policy ? grant('policy', 'rules.policy', policyClaimsOf(policy)) : [];
}

/**
 * THAM QUYEN TU MOT DON DA BEN VUNG.
 *
 * Hai thu cung luc: quyen NOI rang don da duoc ghi nhan, va quyen NHAC LAI cac con so cua chinh
 * don do (chung da di qua rules engine roi moi duoc luu).
 */
export function grantsFromPersistedOrder(order: {
  readonly status: OrderStatus;
  readonly priced: PricedOrder | null;
}): OutboundAuthorityGrant[] {
  if (!ORDER_COMMITMENT_STATES.includes(order.status)) return [];
  return [
    ...grant('order_commitment', 'order.state', [ORDER_COMMITMENT_CLAIM]),
    ...(order.priced
      ? grant(
          'financial',
          'order.state',
          authorizedMoneyForms([
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
 * la kiem chinh minh. `llm_draft` phai chung minh tung khang dinh he qua.
 */
export function decideOutboundAuthority(
  candidate: OutboundCandidate,
  authority: OutboundAuthority,
): OutboundAuthorityVerdict {
  const surfaced = surfacedClaimClasses(candidate.text);
  if (candidate.provenance === 'deterministic') {
    return { sendable: true, reason: 'DETERMINISTIC_AUTHORITY', claims: surfaced };
  }

  const denials = new Map<OutboundClaimClass, OutboundAuthorityDenyReason>();

  const money = monetaryClaims(candidate.text);
  if (money.length) {
    const allowed = authorizedValues(authority, 'financial');
    if (!allowed) denials.set('financial', 'FINANCIAL_AUTHORITY_MISSING');
    else if (money.some((claim) => !claim.forms.some((form) => allowed.has(form)))) {
      denials.set('financial', 'FINANCIAL_VALUE_NOT_AUTHORIZED');
    }
  }

  const policies = policyClaimTokens(candidate.text);
  if (policies.length) {
    const allowed = authorizedValues(authority, 'policy');
    if (!allowed) denials.set('policy', 'POLICY_AUTHORITY_MISSING');
    else if (policies.some((code) => !allowed.has(code))) {
      denials.set('policy', 'POLICY_STATEMENT_NOT_AUTHORIZED');
    }
  }

  if (claimsOrderCommitment(candidate.text)) {
    const allowed = authorizedValues(authority, 'order_commitment');
    if (!allowed?.has(ORDER_COMMITMENT_CLAIM)) {
      denials.set('order_commitment', 'ORDER_COMMITMENT_NOT_AUTHORIZED');
    }
  }

  if (denials.size) {
    const missing = DENIAL_ORDER.filter((claim) => denials.has(claim));
    return { sendable: false, reason: denials.get(missing[0]!)!, missing };
  }
  return surfaced.length
    ? { sendable: true, reason: 'AUTHORITY_SATISFIED', claims: surfaced }
    : { sendable: true, reason: 'NO_CONSEQUENTIAL_CLAIM', claims: [] };
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
  if (monetaryClaims(text).length) classes.push('financial');
  if (policyClaimTokens(text).length) classes.push('policy');
  if (claimsOrderCommitment(text)) classes.push('order_commitment');
  return classes;
}

/* ------------------------------------------------------------------ *
 * CUONG CHE O DIEM NGHEN GUI
 * ------------------------------------------------------------------ */

/**
 * VERDICT DA GHIM tren mot ban ghi luot — thu ma duong GUI doc.
 *
 * VANG MAT = CHUA QUA CONG, va cau tra loi la KHONG GUI. Day la nua thu hai cua hop dong: nua
 * thu nhat (`decideOutboundAuthority`) noi cai gi duoc phep; nua nay bao dam khong con duong nao
 * di vong qua no. Ban ghi cu (soan truoc ban nay), mot duong soan moi quen goi cong, hay mot ban
 * `trace.outbound` duoc dung bang tay deu roi vao `AUTHORITY_DECISION_ABSENT`.
 *
 * Vi sao doc verdict DA GHIM chu khong tinh lai: luc gui, ngu canh tat dinh cua luot (ket qua
 * `priceOrder`, ket qua cong cu, cap dai ly luc do) khong con nua. Tinh lai voi mot bao tham quyen
 * rong se lam MOI ban tu van hop le bi tu choi; tinh lai voi mot bao dung lai duoc thi da phai
 * ghim no tu dau. Nen thu duoc ghim la CHINH QUYET DINH.
 */
export function pinnedOutboundVerdict(trace: AgentTrace | undefined): OutboundAuthorityVerdict {
  return (
    trace?.outboundAuthority ?? {
      sendable: false,
      reason: 'AUTHORITY_DECISION_ABSENT',
      missing: [],
    }
  );
}
