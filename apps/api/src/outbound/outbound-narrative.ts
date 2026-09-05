import type { NarrativeDecision, OutboundAuthority, OutboundClaimClass } from '@netviet/shared';
import {
  claimedCommitmentLevel,
  commitmentToken,
  monetaryLiterals,
  numeralLiterals,
  policyClaimTokens,
} from './outbound-claims.js';
import { unattestedWords } from './outbound-envelope.js';
import { bindProposition, type SourceUnit } from './outbound-proposition.js';

/**
 * HOP DONG NEO NGUON CHO LOI NHAN — cai gi cho phep mot cau van xuoi cua model den tay khach.
 *
 * ---------------------------------------------------------------------------------------------
 * DO LUONG DA QUYET DINH THIET KE NAY (Issue #189, muc 6 hop dong doi "measure ... before
 * implementation"). Chay chinh ba bo trich cua PR #187 tren TOAN BO kho tai lieu DA DUYET cua
 * khach (95 FAQ + 3 bai tu van):
 *
 *     mang "tien"      14/98 (14.3%)   <- "9700 lít/phút" la LUU LUONG GIO, khong phai tien
 *     mang "chinh sach" 11/98 (11.2%)  <- "bảo hành ... 7 ngày" thanh `terms_days:7`
 *     mang "cam ket"     2/98 ( 2.0%)  <- "tích hợp 6 tính năng ... đã ..." thanh `recorded`
 *     KHONG mang gi     72/98 (73.5%)
 *
 * Tuc bo trich sai CA HAI CHIEU: bo sot cach dien dat la (tien de cua #189), VA bao dong gia tren
 * ~26% van ban DA DUOC NGUOI DUYET. Neu dung no lam cong CHAN cho loi nhan thi mot phan tu cau
 * hoi FAQ binh thuong se bi tu choi — dung thu muc 8 ca 16 hop dong cam.
 *
 * ---------------------------------------------------------------------------------------------
 * NEN CACH GIAI KHONG PHAI "tu dien to hon", CUNG KHONG PHAI "cam het van xuoi". Ma la NEO NGUON:
 *
 *   G1 PHAI CO NGUON     — luot khong tra cuu duoc nguon he thong nao thi khong co gi de ke.
 *   G2 SO PHAI TRUY NGUYEN — moi con so trong loi nhan phai co mat trong nguon he thong, trong
 *                            grant, hoac trong chinh tin khach vua gui.
 *   G3 VAT MANG PHAI TRUY NGUYEN — ma chinh sach / muc cam ket bo trich nhan ra phai duoc CAP hoac
 *                            co mat trong nguon.
 *   G4 DA CO THAM QUYEN THI PHAI DI QUA KHOI — con so/chinh sach/cam ket ma luot NAY duoc uy quyen
 *                            KHONG duoc nam trong van xuoi; chung thuoc ve khoi nghiep vu.
 *   G5 TUNG TU NGU PHAI CO NGUON — moi tu ngu noi dung cua loi nhan phai co mat trong nguon he
 *                            thong cua luot, hoac la mot tu chuc nang. Xem `outbound-envelope.ts`.
 *   G6 TUNG MENH DE PHAI TRUNG TRON VEN MOT MENH DE NGUON — va van ban phat ra la ky tu cua
 *                            NGUON. Xem `outbound-proposition.ts`.
 *
 * G6 la lop DUY NHAT khong phai mot cong CHAN. Nam lop tren deu tra loi "co cho di khong"; G6 tra
 * loi "cai gi duoc di". Do la ly do no ton tai: review doc lap 05/09/2026 (#200) chung minh G5
 * dong duoc cong TU VUNG ma khong dong duoc cong NGHIA — model ghep lai chinh chu cua nguon thanh
 * mot ky han thanh toan khac ("thanh toán ngay khi nhận hàng" -> "thanh toán khi bán xong"), va
 * dao nguoc duoc mot cau nguon bang dung nhung tu ma vo hoi thoai tang khong (`không`, `được`).
 *

 * G5 la lop DUY NHAT trong nam lop khong dua tren mot bo nhan dang. Bon lop kia hoi "loi nhan co
 * mang mot vat mang ma ta NHAN RA khong?", nen chung chi manh bang bo nhan dang — va review doc
 * lap da hai lan chung minh rang bo nhan dang nao cung co lop bo sot. G5 hoi nguoc: "co tu ngu nao
 * ma KHONG nguon nao noi khong?". Do la mot danh sach CHO, nen no hong theo chieu DONG.
 *
 * G2 la thu that su giet duoc lop bo sot ma muc 1 hop dong goi ten ("bare numeral below 1000 with
 * implied k"): `giá 990` khong quy duoc ve nguon nao -> loi nhan bi bo. No lam duoc dieu do vi no
 * KHONG dua tren hinh dang cua con so — no quet MOI con so va hoi "cai nay tu dau ra".
 *
 * G3 la bo trich cua PR #187 giu nguyen, nhung doi vai: no chi con LAM GIAM kha nang gui. Bao dong
 * gia cua no duoc NEO NGUON hap thu ("7 ngày" co trong chinh bai FAQ vua tra cuu -> qua), chu
 * khong duoc hap thu bang mot danh sach cho phep ngay cang dai.
 *
 * G4 la lop cuoi cung, va no tra loi cau chu cua muc 2 hop dong. G2/G3 chan cai model BIA RA. G4
 * chan cai model NHAC LAI: mot con so da co tham quyen thi khong sai, nhung cau van dat quanh no
 * van do model viet, va "đơn giá 990.000đ" khac "giá tham khảo tối thiểu 990.000đ" ve dung cai
 * quan trong nhat — muc cam ket. Cau qualifier do thuoc ve bo soan, nen con so phai di qua khoi.
 * Nho G4, doan van xuoi con lai KHONG the mang mot khang dinh nghiep vu CO THAM QUYEN nao.
 *
 * ---------------------------------------------------------------------------------------------
 * TAI SAO NGUON PHAI LA CHUOI HE THONG SO HUU, KHONG PHAI KET QUA CONG CU DA SERIALIZE.
 *
 * `money-guard.ts` neo vao `JSON.stringify(toolOutput)`. Ket qua cong cu co ECHO LAI THAM SO MODEL
 * TU GUI: `bao_gia(skus: ["990"])` tra ve `{ sku: "990", loi: "Khong co SKU nay trong danh muc" }`.
 * Neo vao do thi model TU TAO duoc bang chung neo nguon cho chinh con so no sap viet. Nen o day
 * nguon phai la chuoi lay tu DB/rules: ten san pham, van ban tai lieu da duyet, so tien
 * `formatVnd()` cua rules engine, nhan chinh sach cua cap dai ly.
 */

/**
 * BANG CHUNG NEO NGUON cua mot luot — tap ma/gia tri HE THONG SO HUU.
 *
 * Ba tap tach rieng vi ba lop hoi ba cau khac nhau. Gop lam mot tap chuoi se lam mot ma chinh sach
 * `cod` "neo" duoc cho mot con so, va nguoc lai.
 */
export interface NarrativeGrounding {
  readonly numerals: ReadonlySet<string>;
  readonly policy: ReadonlySet<string>;
  readonly commitment: ReadonlySet<string>;
}

export const EMPTY_GROUNDING: NarrativeGrounding = {
  numerals: new Set(),
  policy: new Set(),
  commitment: new Set(),
};

/**
 * BANG CHUNG CUA RIENG GRANT — thu ma khoi nghiep vu duoc phep noi, va loi nhan thi KHONG.
 *
 * Tach ra khoi `buildGrounding` vi hai tap nay dan den hai ket cuc NGUOC NHAU o G4: mot con so
 * neo vao TAI LIEU (9700 lít/phút) thi loi nhan viet thoai mai; mot con so neo vao GRANT
 * (990.000d cua bang gia) thi loi nhan KHONG duoc viet — no phai di qua khoi bao gia.
 */
export function grantGrounding(authority: OutboundAuthority): NarrativeGrounding {
  return {
    numerals: grantedValues(authority, 'financial'),
    policy: grantedValues(authority, 'policy'),
    commitment: grantedValues(authority, 'order_commitment'),
  };
}

/** Tap gia tri da uy quyen cho MOT lop — rong khi lop do khong co grant nao. */
function grantedValues(
  authority: OutboundAuthority,
  claim: OutboundClaimClass,
): ReadonlySet<string> {
  return new Set(
    authority.grants.filter((entry) => entry.claim === claim).flatMap((entry) => entry.authorized),
  );
}

/**
 * Dung bang chung neo nguon cua luot.
 *
 * `systemSources` = chuoi he thong so huu (van ban tai lieu da duyet, ten/mo ta san pham trong
 * danh muc, so tien rules engine da dinh dang, nhan chinh sach). `customerText` = tin khach vua
 * gui — CHI dong gop cho lop SO.
 *
 * VI SAO tin khach chi cho lop so: khach viet "lay 20 cai" thi cau xac nhan "da nhan 20 cai a"
 * phai noi duoc, neu khong moi cau xac nhan so luong deu bi tu choi. Nhung mot cau CHINH SACH hay
 * mot CAM KET DON thi khong duoc phep chi vi khach da noi truoc — khach xin cong no khong lam cho
 * he thong co quyen hua cong no. Do la ranh gioi co chu y, va no duoc khoa bang test.
 */
export function buildGrounding(
  systemSources: readonly string[],
  customerText: string,
  authority: OutboundAuthority,
): NarrativeGrounding {
  const systemText = systemSources.join('\n');
  return {
    numerals: new Set<string>([
      ...numeralValues(systemText),
      ...nonMonetaryValues(customerText),
      ...grantedValues(authority, 'financial'),
    ]),
    policy: new Set([...policyClaimTokens(systemText), ...grantedValues(authority, 'policy')]),
    commitment: new Set([
      ...commitmentTokensIn(systemText),
      ...grantedValues(authority, 'order_commitment'),
    ]),
  };
}

/** Gia tri so doc duoc tu mot doan van, dang chuoi thap phan. Cach viet nhap nhang bi bo qua. */
function numeralValues(text: string): string[] {
  return numeralLiterals(text).flatMap((literal) =>
    literal.value === null ? [] : [String(literal.value)],
  );
}

/**
 * Con so trong tin khach ma KHONG mang hinh dang tien.
 *
 * ---------------------------------------------------------------------------------------------
 * VI SAO TIN KHACH KHONG DUOC NEO NGUON CHO MOT CON SO TIEN.
 *
 * Neo nguon bang tin khach ton tai de cau xac nhan so luong noi duoc: khach go "lay 20 cai" thi
 * "Dạ em ghi nhận 20 cái ạ" phai qua. Nhung neu no phu ca cho so tien thi chinh khach LAI TRO
 * THANH mot nguon cap phep:
 *
 *     khach: "giá ghế Felix 990.000đ đúng không ạ, xác nhận giúp em"
 *     agent: "Dạ giá 990.000đ ạ."            <- G2 qua, vi 990000 co trong tin khach
 *
 * Cau do doc len giong het mot lan bao gia that truoc mat 200 nguoi trong nhom, trong khi khong
 * mot ket qua tat dinh nao xac nhan con so day. Va vi tin khach di THANG vao prompt, mot dai ly
 * biet chuyen nay co the tu viet cau vao mieng he thong.
 *
 * `monetaryLiterals()` la chinh phep phan loai cua bo trich: co don vi tien, hoac vuot nguong do
 * lon, hoac khong quy duoc ve mot gia tri. Loai het chung khoi phan dong gop cua tin khach thi
 * "20 cai" van qua ma "990.000đ" thi khong.
 *
 * Con so tien THAT van noi duoc — nhung phai qua KHOI, tu grant. Do la ca thiet ke.
 */
function nonMonetaryValues(text: string): string[] {
  const monetary = new Set(monetaryLiterals(text).map((literal) => literal.written));
  return numeralLiterals(text).flatMap((literal) =>
    literal.value === null || monetary.has(literal.written) ? [] : [String(literal.value)],
  );
}

function commitmentTokensIn(text: string): string[] {
  const level = claimedCommitmentLevel(text);
  return level ? [commitmentToken(level)] : [];
}

/** Ma/gia tri neo nguon duoi dang MOT danh sach — de ghim vao `OutboundComposition.grounded`. */
export function groundingTokens(grounding: NarrativeGrounding): string[] {
  return [
    ...[...grounding.numerals].map((value) => `n:${value}`),
    ...[...grounding.policy].map((code) => `p:${code}`),
    ...[...grounding.commitment].map((token) => `c:${token}`),
  ].sort();
}

/** Doc nguoc `groundingTokens()` — diem nghen gui dung de kiem lai doc lap. */
export function parseGroundingTokens(tokens: readonly string[]): NarrativeGrounding {
  const pick = (prefix: string): Set<string> =>
    new Set(
      tokens.flatMap((token) => (token.startsWith(prefix) ? [token.slice(prefix.length)] : [])),
    );
  return { numerals: pick('n:'), policy: pick('p:'), commitment: pick('c:') };
}

/**
 * LOI NHAN NAY CO DUOC PHEP DEN TAY KHACH KHONG?
 *
 * `hasSystemSource` tach khoi `grounding` co y: mot luot co the tra cuu duoc tai lieu ma tai lieu
 * do khong chua con so nao (`grounding.numerals` rong) — do van la mot luot CO NGUON. Suy G1 tu do
 * lon cua tap neo nguon se bien mot bai FAQ khong co so thanh mot luot "khong co nguon".
 */
export function admitNarrative(
  narrative: string,
  options: {
    readonly hasSystemSource: boolean;
    readonly grounding: NarrativeGrounding;
    /** Rieng phan tu GRANT — xem G4 duoi day. */
    readonly granted: NarrativeGrounding;
    /** G5 — tap tu ngu ma nguon he thong cua luot nay so huu. Xem `outbound-envelope.ts`. */
    readonly attested: ReadonlySet<string>;
    /** G6 — menh de he thong so huu cua luot nay. Xem `outbound-proposition.ts`. */
    readonly units: readonly SourceUnit[];
  },
): NarrativeDecision {
  const text = narrative.trim();
  if (!text) return { admitted: false, reason: 'EMPTY' };
  if (!options.hasSystemSource) return { admitted: false, reason: 'NO_SYSTEM_SOURCE' };
  /*
   * THU TU: G2/G3 TRUOC, G4 SAU — va thu tu do la mot quyet dinh ve CHAN DOAN, khong ve an toan.
   *
   * Ca hai deu chan, nen ban nao truoc cung khong lam doi ket cuc. Cai doi la MA nguoi truc doc
   * duoc khi mot loi nhan mang CA HAI loai vat mang:
   *
   *     "Giá 1.150.000đ nhưng khách quen được giảm còn 990 thôi ạ."
   *      ^ da co tham quyen (G4)              ^ hoan toan bia (G2)
   *
   * Bao `FINANCIAL_VALUE_IN_NARRATIVE` o day doc len nhu mot loi dinh tuyen ("dang le xin khoi"),
   * va nguoi truc se bo qua dieu nghiem trong hon: model vua bia ra mot muc giam gia. Bao
   * `NUMERAL_NOT_GROUNDED` truoc thi lo dung cai nang hon. G4 la lop tinh vi hon nhung nhe hon.
   *
   * G4 — DA CO THAM QUYEN THI PHAI DI QUA KHOI: G2/G3 chan cai model BIA RA, G4 chan cai model
   * NHAC LAI. Mot con so da duoc uy quyen thi khong sai, nhung cau van dat quanh no van do model
   * viet, va "đơn giá 990.000đ" voi "giá tham khảo tối thiểu 990.000đ" la hai cam ket khac nhau
   * tren cung mot con so. Cau qualifier do thuoc bo soan, nen con so phai di qua khoi.
   */
  const ungrounded = ungroundedCarrier(text, options.grounding);
  if (ungrounded) return { admitted: false, reason: ungrounded };
  const claimed = claimedCarrier(text, options.granted);
  if (claimed) return { admitted: false, reason: claimed };
  /*
   * G5 — MOI TU NGU NOI DUNG PHAI CO MAT TRONG NGUON HE THONG CUA LUOT.
   *
   * XEP CUOI, va do la mot quyet dinh ve CHAN DOAN chu khong ve an toan: ca nam lop deu chi CHAN,
   * khong lop nao cap phep, nen doi thu tu khong doi duoc ket cuc — chi doi MA ma nguoi truc doc.
   *
   * Vi sao G5 di sau G4: G4 chi no khi vat mang do luot NAY DA DUOC UY QUYEN. Luc do model khong
   * bia gi ca, no chi dat mot con so that vao sai cho, va cau dung phai la "so nay thuoc ve khoi
   * bao gia". Bao `NARRATIVE_NOT_SOURCE_BACKED` o do se noi SAI: nguon cho con so ay co that.
   *
   * VI SAO G5 LA THU DONG DUOC CONG MA G1..G4 DE MO. Bon lop kia deu hoi "loi nhan co mang mot
   * vat mang ma ta NHAN RA khong?" — nen chung chi manh bang bo nhan dang, va review doc lap da
   * chung minh hai lan rang bo nhan dang nao cung co lop bo sot. G5 hoi nguoc lai: "co tu ngu nao
   * trong loi nhan ma KHONG nguon nao noi khong?" — cau do khong can nhan ra dieu gi ca. Mot loi
   * hua thanh toan chua tung gap bi chan khong phai vi ta biet no la loi hua, ma vi cac chu
   * "khất", "tiền", "hàng", "bán", "xong" khong co trong bat ky nguon nao cua luot.
   */
  if (unattestedWords(text, options.attested).length) {
    return { admitted: false, reason: 'NARRATIVE_NOT_SOURCE_BACKED' };
  }
  /*
   * G6 — TUNG MENH DE PHAI TRUNG TRON VEN MOT MENH DE CUA NGUON, VA VAN BAN PHAT RA LA CUA NGUON.
   *
   * XEP CUOI CUNG vi no la lop CHAT NHAT: mot loi nhan hong o G2..G5 hong theo mot cach cu the
   * (bia con so, bia chinh sach, dat sai cho, dung chu la), va nhung ma do noi cho nguoi truc
   * biet phai lam gi. `NARRATIVE_NOT_SOURCE_BOUND` la ma con lai khi loi nhan KHONG bia mot chu
   * nao — no chi ghep lai chu cua nguon thanh mot y khac. Bao ma do truoc se giau mat cac lop kia.
   *
   * DAY LA CHO DUY NHAT TRONG CA HAM NAY TRA VE MOT VAN BAN KHAC VOI VAN BAN MODEL VIET. G1..G5
   * deu la cong CHAN: qua thi chuoi cua model di tiep nguyen ven. G6 khong chan, no THAY THE:
   * phan su kien duoc phat lai tu ban sao cua he thong. Do la ca khac biet ma muc 3 hop dong
   * #200 doi — "renderer owns the exact customer-visible factual/policy statement".
   */
  const bound = bindProposition(text, options.units);
  return bound.bound
    ? { admitted: true, text: bound.text }
    : { admitted: false, reason: 'NARRATIVE_NOT_SOURCE_BOUND' };
}

/** Vat mang trong loi nhan ma luot NAY co tham quyen — phai di qua khoi. `null` = sach. */
function claimedCarrier(
  text: string,
  granted: NarrativeGrounding,
):
  | 'FINANCIAL_VALUE_IN_NARRATIVE'
  | 'POLICY_STATEMENT_IN_NARRATIVE'
  | 'ORDER_COMMITMENT_IN_NARRATIVE'
  | null {
  if (
    numeralLiterals(text).some(
      (literal) => literal.value !== null && granted.numerals.has(String(literal.value)),
    )
  ) {
    return 'FINANCIAL_VALUE_IN_NARRATIVE';
  }
  if (policyClaimTokens(text).some((code) => granted.policy.has(code))) {
    return 'POLICY_STATEMENT_IN_NARRATIVE';
  }
  const level = claimedCommitmentLevel(text);
  return level && granted.commitment.has(commitmentToken(level))
    ? 'ORDER_COMMITMENT_IN_NARRATIVE'
    : null;
}

/** Ba ma tu choi ma phep quet vat mang co the tra ve — dung chung cho luc soan va luc gui. */
export type UngroundedCarrier =
  'NUMERAL_NOT_GROUNDED' | 'POLICY_CARRIER_NOT_GROUNDED' | 'COMMITMENT_CARRIER_NOT_GROUNDED';

/**
 * VAT MANG DAU TIEN trong `text` khong truy nguyen duoc — `null` = sach.
 *
 * Tach ra thanh ham rieng vi diem nghen gui dung LAI CHINH NO tren van ban CUOI (ke ca phan bo
 * soan tu render), lam lop phong thu chieu sau doc lap voi lan xet luc soan.
 *
 * THU TU co dinh: so -> chinh sach -> cam ket. Hai lan chay cung mot van ban phai ra cung mot ma.
 */
export function ungroundedCarrier(
  text: string,
  grounding: NarrativeGrounding,
): UngroundedCarrier | null {
  for (const literal of numeralLiterals(text)) {
    // `value === null` = cach viet khong quy duoc ve mot gia tri. Coi la CHUA truy nguyen duoc:
    // mot con so khong doc duoc chac chan cung khong doi chieu duoc.
    if (literal.value === null || !grounding.numerals.has(String(literal.value))) {
      return 'NUMERAL_NOT_GROUNDED';
    }
  }
  if (policyClaimTokens(text).some((code) => !grounding.policy.has(code))) {
    return 'POLICY_CARRIER_NOT_GROUNDED';
  }
  const level = claimedCommitmentLevel(text);
  if (level && !grounding.commitment.has(commitmentToken(level))) {
    return 'COMMITMENT_CARRIER_NOT_GROUNDED';
  }
  return null;
}
