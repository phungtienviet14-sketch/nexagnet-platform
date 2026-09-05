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
  OutboundComposition,
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
import { attestedWords, parseAttestedTokens, unattestedWords } from './outbound-envelope.js';
import { bindProposition, sourceUnits } from './outbound-proposition.js';
import {
  composedBlockEvidence,
  parsePinnedEvidence,
  pinnedEvidence,
  singleProductScope,
} from './source-evidence.js';
import {
  parseGroundingTokens,
  ungroundedCarrier,
  type UngroundedCarrier,
} from './outbound-narrative.js';

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
 *
 * ---------------------------------------------------------------------------------------------
 * BAN SUA 04/09/2026 (thu hai) — ISSUE #189. REVIEW DOC LAP CHAP NHAN B1-B3 LA CAI TIEN THAT,
 * NHUNG KHONG CHAP NHAN KET QUA: sau #187 nhanh cuoi cua ham van la
 *
 *     khong trich duoc vat mang nao  =>  CHO GUI
 *
 * Bo trich rong hon KHONG sua duoc dieu do. Mot bo trich huu han tren mot ngon ngu vo han se luon
 * co lop bo sot — chinh bao cao #187 liet ke bon lop con lai (so tran duoi 1000 co `k` ngam,
 * tieng Viet khong dau mat the hoan thanh, cau chinh sach khong chu so, va "ngon ngu luon dien dat
 * duoc mot su that co he qua theo mot cach bo trich khong phan loai").
 *
 * NEN THU DUOC DOI KHONG PHAI BO TRICH, MA LA DAU VAO CUA HAM NAY. Xem
 * `outbound-composer.ts`: van ban den tay khach gio do BO SOAN dung tu du kien co kieu, va ham nay
 * xet BAN SOAN chu khong xet doan van. Bo trich o `outbound-claims.ts` giu nguyen va van chay —
 * nhung o CHANG 3, tuc chi de LAM GIAM kha nang gui (muc 7 hop dong: defense-in-depth). Mot lan
 * bo sot cua no khong con bien mot khang dinh khong tham quyen thanh mot tin gui duoc, boi vi
 * duong cho phep khong di qua no nua.
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

/**
 * Ma uy quyen cua MOT loai chinh sach.
 *
 * Xuat ra (truoc #189 la `policyClaimsOf` noi bo) vi bo soan can chinh bo ma nay khi no render
 * khoi chinh sach: khoi phai khai bao DUNG nhung ma ma grant se duoc doi chieu, neu khong thi
 * phep kiem o `decideOutboundAuthority` se so hai bo tu vung khac nhau.
 */
export function policyGrantTokens(policy: PolicyType): readonly string[] {
  return POLICY_GRANT_TOKENS[policy];
}

/**
 * MUC CAM KET ma mot trang thai don uy quyen — cong don theo thang bac.
 *
 * Xuat ra de tang du kien (`outbound-facts.ts`) dung duoc chinh bang nay. Doc bang truc tiep tu
 * ben ngoai thi mot ngay nao do se co hai cach tinh "trang thai nay noi duoc gi", va chung se
 * lech nhau.
 */
export function commitmentLevelsFor(status: OrderStatus): readonly OutboundCommitmentLevel[] {
  return COMMITMENT_LEVELS_BY_STATE[status];
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
    ...(priced.policy ? policyGrantTokens(priced.policy) : []),
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
  return policy ? grant('policy', 'rules.policy', policyGrantTokens(policy)) : [];
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

/**
 * THU TU XET co dinh: tien -> chinh sach -> cam ket don.
 *
 * Co dinh de mot ban nhap hong o nhieu lop luon bao cung mot ma dau — hai lan chay cung mot ca
 * ra hai ma khac nhau la thu lam hong ca viec doi soat lan ca bo test.
 */
const DENIAL_ORDER: readonly OutboundClaimClass[] = ['financial', 'policy', 'order_commitment'];

/** Lop khong co grant nao. */
const MISSING_REASON: Readonly<Record<OutboundClaimClass, OutboundAuthorityDenyReason>> = {
  financial: 'FINANCIAL_AUTHORITY_MISSING',
  policy: 'POLICY_AUTHORITY_MISSING',
  order_commitment: 'ORDER_COMMITMENT_NOT_AUTHORIZED',
};

/** Co grant, nhung gia tri/ma khoi noi ra khong nam trong do. */
const UNAUTHORIZED_REASON: Readonly<Record<OutboundClaimClass, OutboundAuthorityDenyReason>> = {
  financial: 'FINANCIAL_VALUE_NOT_AUTHORIZED',
  policy: 'POLICY_STATEMENT_NOT_AUTHORIZED',
  order_commitment: 'ORDER_COMMITMENT_LEVEL_NOT_AUTHORIZED',
};

/** Vat mang khong truy nguyen duoc thuoc lop nao — de `missing` chi dung cho can bo sung. */
const CARRIER_CLASS: Readonly<Record<UngroundedCarrier, OutboundClaimClass>> = {
  NUMERAL_NOT_GROUNDED: 'financial',
  POLICY_CARRIER_NOT_GROUNDED: 'policy',
  COMMITMENT_CARRIER_NOT_GROUNDED: 'order_commitment',
};

/**
 * BAN SOAN NAY CO TRO THANH MOT TIN GUI DUOC CHO KHACH KHONG?
 *
 * ---------------------------------------------------------------------------------------------
 * DOI DAU VAO O #189, va do la ca ban sua: ham nay khong con nhan MOT DOAN VAN nua, no nhan mot
 * `OutboundComposition`. Truoc day chu ky la `(candidate: { text, provenance }, authority)`, nen
 * cau hoi thuc su duoc tra loi la "doc doan van nay, co thay khang dinh nao khong?" — va nhanh
 * cuoi cua no la `khong thay gi => cho gui`. Bo trich van ban vi the nam TRONG ranh gioi cho phep.
 *
 * Nay cau hoi la: "ban soan nay da dung nhung KHOI nao, va tung khoi co grant chua?". Mot cach
 * dien dat ngoai tam bo trich khong con y nghia gi o day, boi vi khong co bo trich nao tren duong
 * CHO PHEP ca: khoi ton tai vi bo soan render duoc no tu du kien tat dinh, cham het.
 *
 * ---------------------------------------------------------------------------------------------
 * BA CHANG, THEO DUNG THU TU NAY:
 *
 *  0. KHONG CO GI DE GUI          -> `COMPOSITION_EMPTY`, fail closed.
 *  1. VAN BAN TAT DINH TRON       -> qua thang; gia tri trong do chinh la ket qua co tham quyen.
 *  2. TUNG KHANG DINH CUA TUNG KHOI phai nam trong grant. Day la ranh gioi DUNG SAI.
 *  3. PHONG THU CHIEU SAU (muc 7 hop dong): quet lai vat mang tren VAN BAN CUOI. Lop nay chi
 *     LAM GIAM kha nang gui — no khong cap phep cho gi, nen mot lan bo sot cua no khong con la
 *     mot duong di vong. Do la toan bo su khac nhau giua no va ban truoc #189.
 */
export function decideOutboundAuthority(
  composition: OutboundComposition,
  authority: OutboundAuthority,
): OutboundAuthorityVerdict {
  const fingerprint = composition.fingerprint;
  if (composition.mode === 'empty') {
    return { sendable: false, reason: 'COMPOSITION_EMPTY', missing: [], fingerprint };
  }
  if (composition.mode === 'deterministic_document') {
    return {
      sendable: true,
      reason: 'DETERMINISTIC_AUTHORITY',
      claims: surfacedClaimClasses(composition.text),
      fingerprint,
    };
  }

  // CHANG 2 — cau truc. Moi khoi khai bao chinh xac nhung gia tri/ma no noi ra; grant phai phu het.
  const denials = new Map<OutboundClaimClass, OutboundAuthorityDenyReason>();
  for (const block of composition.blocks) {
    for (const entry of block.claims) {
      const allowed = authorizedValues(authority, entry.claim);
      if (!allowed) {
        denials.set(entry.claim, MISSING_REASON[entry.claim]);
      } else if (entry.authorized.some((value) => !allowed.has(value))) {
        denials.set(entry.claim, UNAUTHORIZED_REASON[entry.claim]);
      }
    }
  }
  if (denials.size) {
    const missing = DENIAL_ORDER.filter((claim) => denials.has(claim));
    return { sendable: false, reason: denials.get(missing[0]!)!, missing, fingerprint };
  }

  // CHANG 3 — phong thu chieu sau. Quet tren van ban CUOI, doi chieu voi bang chung neo nguon ma
  // chinh ban soan ghim lai. Bao dong gia cua bo trich (do duoc: ~26% tai lieu da duyet) da bi
  // neo nguon hap thu o buoc soan, nen o day no khong con lam hong cau FAQ binh thuong nua.
  const ungrounded = ungroundedCarrier(
    composition.text,
    parseGroundingTokens(composition.grounded),
  );
  if (ungrounded) {
    return {
      sendable: false,
      reason: 'NARRATIVE_CARRIER_NOT_GROUNDED',
      missing: [CARRIER_CLASS[ungrounded]],
      fingerprint,
    };
  }

  /*
   * CHANG 3b — G5 QUET LAI TREN VAN BAN CUOI (phong thu chieu sau, muc 7 hop dong).
   *
   * Doi chieu voi HAI nguon bang chung, va ca hai deu KHONG phai loi khai cua model:
   *   · `s:` ghim tren ban soan — tu ngu ma loi nhan da dung VA da truy nguyen ve nguon he thong;
   *   · dong cua cac khoi da render — do chinh bo soan viet ra tu `TurnBusinessFacts`.
   *
   * Cai bat duoc o day ma chang soan khong bat duoc: mot doan VAN XUOI xuat hien trong `text` ma
   * khong lan soan nao nhan. Chang soan chi xet `plan.narrative`; neu mot duong soan moi (hay mot
   * lan sua sau nay) ghep them chu vao `text`, chang soan khong biet — con o day thi tung chu cua
   * chuoi sap ra kenh deu phai chi ra duoc no tu dau ma co.
   */
  const unattested = unattestedWords(
    composition.text,
    new Set([
      ...parseAttestedTokens(composition.grounded),
      ...attestedWords(composition.blocks.flatMap((block) => block.lines)),
    ]),
  );
  if (unattested.length) {
    return {
      sendable: false,
      reason: 'COMPOSITION_TEXT_NOT_SOURCE_BACKED',
      missing: [],
      fingerprint,
    };
  }

  /*
   * CHANG 3c — G6 QUET LAI TREN VAN BAN CUOI, O MUC MENH DE (Issue #200).
   *
   * Chang 3b hoi "tung CHU den tu dau", va do la cau hoi ma #200 chung minh la chua du: ghep lai
   * chinh chu cua nguon van tao duoc mot ky han thanh toan khac. O day cau hoi la "tung MENH DE
   * den tu dau", va bang chung doi chieu gom dung hai thu, ca hai deu KHONG phai loi khai model:
   *
   *   · `x:` ghim tren ban soan — chinh cac menh de nguon ma loi nhan da trich;
   *   · dong cua cac khoi da render — do bo soan viet ra tu `TurnBusinessFacts`.
   *
   * Thu no bat duoc ma chang soan khong bat duoc la mot doan VAN XUOI bi ghep them vao `text` SAU
   * khi ban soan da xet: doan do se khong trung tron ven menh de nao trong hai nguon tren.
   */
  /*
   * DOI CHIEU VOI DUNG BAN GHI DA GHIM, khong voi mot tap chuoi bat ky (Issue #205).
   *
   * Truoc #205 cho nay doc `x:<van ban>` roi coi chinh chuoi do la bang chung nguon goc — muc 3
   * hop dong goi dung ten la fake provenance. Nay moi ghim mang `sourceId@version#pham-vi`, nen
   * chang kiem lai tra loi duoc ban ghi NAO da cap phep cho cau nay.
   */
  const pins = parsePinnedEvidence(composition.grounded);
  const boundText = bindProposition(composition.text, [
    ...sourceUnits(pinnedEvidence(pins)),
    ...sourceUnits(composedBlockEvidence(composition.blocks.flatMap((block) => block.lines))),
  ]);
  if (!boundText.bound) {
    return {
      sendable: false,
      reason: 'COMPOSITION_TEXT_NOT_SOURCE_BOUND',
      missing: [],
      fingerprint,
    };
  }
  /*
   * CHANG 3d - PHAM VI, doc lai tren chinh cac ghim (Issue #205, muc 4 hop dong).
   *
   * G7 da xet luc soan. Xet lai o day vi cung mot ly do voi ba chang tren: chang soan chi nhin
   * `plan.narrative`, con day nhin VAN BAN CUOI — mot doan bi ghep them sau khi soan xong se
   * khong co chang nao khac bat duoc.
   */
  if (!singleProductScope(boundText.units.map((unit) => unit.evidence.scope.productSku))) {
    return {
      sendable: false,
      reason: 'COMPOSITION_SCOPE_CONFLICT',
      missing: [],
      fingerprint,
    };
  }

  return composition.blocks.length
    ? {
        sendable: true,
        reason: 'AUTHORITY_SATISFIED',
        claims: [...new Set(composition.blocks.flatMap((b) => b.claims.map((c) => c.claim)))],
        fingerprint,
      }
    : { sendable: true, reason: 'NARRATIVE_ONLY_COMPOSITION', claims: [], fingerprint };
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
  /*
   * BAN SOAN CO KIEU PHAI CO MAT (#189).
   *
   * Mot phan quyet don doc khong con du. Truoc #189, `outboundAuthority` co the duoc cap cho mot
   * doan van XUOI ma model viet — do la ca lop lo hong. Nen tu day: khong co
   * `trace.outboundComposition` nghia la noi dung nay CHUA di qua bo soan, va no bi tu choi ke ca
   * khi mang mot phan quyet trong hop le. Ban ghi soan truoc #189 roi vao dung nhanh nay, va do
   * la yeu cau o muc 8 ca 10 hop dong.
   */
  const composition = trace?.outboundComposition;
  if (!composition) {
    return {
      sendable: false,
      reason: 'COMPOSITION_ABSENT',
      missing: verdict.sendable ? [] : verdict.missing,
    };
  }
  const fingerprint = outboundFingerprint(text);
  // MOT dau cho CA HAI: phan quyet, ban soan va doan van sap gui phai la cung mot thu. Ban soan
  // co dau rieng nen mot ban ghi bi ghep tu hai luot khac nhau cung dung lai o day.
  if (verdict.fingerprint !== fingerprint || composition.fingerprint !== fingerprint) {
    return {
      sendable: false,
      reason: 'AUTHORITY_PAYLOAD_MISMATCH',
      missing: verdict.sendable ? [] : verdict.missing,
      fingerprint,
    };
  }
  return verdict;
}
