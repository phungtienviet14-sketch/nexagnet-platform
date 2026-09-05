import { createHash } from 'node:crypto';

/**
 * BANG CHUNG CO DANH TINH — cai gi cho phep mot cau cua NGUON duoc CHON vao loi nhan (Issue #205).
 *
 * ---------------------------------------------------------------------------------------------
 * TEP NAY TRA LOI REVIEW DOC LAP 05/09/2026, VA NO KHONG PHAI MOT CONG THU BAY.
 *
 * #200 dong duoc cong NGHIA: phan su kien cua loi nhan la MENH DE NGUYEN VEN cua nguon, phat ra
 * bang ky tu cua nguon. Model khong con bia duoc mot menh de moi. Nhung no van chon duoc MENH DE
 * NAO — va do la mot quyen khac han.
 *
 *     MOT CAU CO THAT TRONG TAI LIEU DA DUYET
 *             ≠
 *     CAU DO DUOC PHEP NOI TRONG LUOT NAY, VOI KHACH NAY, VE SAN PHAM NAY
 *
 * Do tren `main` (`443a2cc`) TRUOC khi viet mot dong nao, dung `composeOutbound` that, voi chinh
 * van ban tai lieu da duyet cua khach:
 *
 *     nguon: "Giá niêm yết: 12.000.000 VNĐ. Giá bán lẻ: 8.500.000 VNĐ."  (faq:cr022:skj-cr022:021)
 *     model: "Dạ giá bán lẻ 8.500.000 VNĐ ạ."
 *     -> admitted, sendable=true, KHONG MOT GRANT NAO
 *
 * Va nang hon — cung mot luot ma bang gia tat dinh dang noi 1.150.000:
 *
 *     grant tien: 1.150.000        nguon FAQ: 8.500.000
 *     -> cau cua FAQ VAN ra kenh, tuc tai lieu da duyet DE BEP bang gia dang chay
 *
 * Cung hinh dang do voi bao hanh/1 doi 1 (`faq:bb:bb-grey:017`) va voi cong no 45 ngay: mot cau
 * mang QUYEN LOI cua khach ra duoc kenh chi vi no co that o dau do trong kho tai lieu.
 *
 * ---------------------------------------------------------------------------------------------
 * VI SAO KHONG PHAI MOT BO NHAN DANG NUA.
 *
 * Muc 3 hop dong #205 loai tru han: khong duoc lay `van ban cau nguon -> regex/POLICY_SURFACES/
 * bo do so/classifier/LLM -> ket luan co he qua hay khong` lam RANH GIOI DUNG SAI. Ly do giong
 * het #189 va #200: moi bo nhan dang huu han tren mot ngon ngu vo han deu co lop bo sot, va mot
 * lop bo sot tren duong CHO PHEP la mot duong di vong hoan chinh.
 *
 * Nen thu quyet dinh khong phai NOI DUNG cau, ma DANH TINH cua ban ghi da sinh ra no — mot tinh
 * chat HE THONG SO HUU, dat luc xuat ban/nap/cau hinh, khong bao gio doc ra tu van xuoi luc chay.
 *
 * ---------------------------------------------------------------------------------------------
 * TINH CHAT, MOT CAU:
 *
 *   Model chi chon duoc trong nhung menh de thuoc ve ban ghi ma HE THONG DA TUYEN BO la ke duoc,
 *   va khong phep chon nao bao lanh duoc mot khang dinh tien/chinh sach/cam ket — nhung lop do
 *   chi den tu grant tat dinh.
 *
 * `string[]` bien mat khoi duong nguon vi mot chuoi khong tra loi duoc bon cau hoi ma muc 3 hop
 * dong bat ban soan phai tra loi duoc: ban ghi nao, pham vi nao, duoc ke hay thuoc tham quyen, va
 * ban nao da duoc ghim.
 */

/**
 * BAN GHI NAY DUOC PHEP LAM GI TRONG MOT LOI NHAN.
 *
 * Ba muc, va `unclassified` KHONG phai mot khe ho — no la ma cua "chua ai tuyen bo", va no dong
 * y het `business_authority` o cho quan trong nhat: khong bao gio thanh mot menh de chon duoc.
 * Tach rieng vi hai thu doi hai hanh dong khac nhau tu nguoi van hanh (mot cai la thiet ke, mot
 * cai la viec con phai lam), va vi bao cao mat mat nang luc phai dem duoc chung rieng ra.
 */
export const EVIDENCE_CLASSES = ['narrative', 'business_authority', 'unclassified'] as const;
export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

/**
 * PHAM VI NGHIEP VU cua mot ban ghi.
 *
 * `productSku: null` = pham vi TOAN KHACH (ten thuong hieu, chinh sach chung), khong phai "khong
 * biet". Mot ban ghi khong biet pham vi thi khong duoc dung — no khong den day.
 */
export interface EvidenceScope {
  readonly tenant: string;
  readonly productSku: string | null;
}

/**
 * MOT MANH BANG CHUNG HE THONG SO HUU.
 *
 * Doc ky vi sao ca nam truong deu can, khong truong nao thua:
 *
 *  · `sourceId`      — ban ghi NAO. Thieu no thi khong tra loi duoc "cau nay o dau ra".
 *  · `version`       — dau cua CHINH doan van nay. Thieu no thi mot ban soan cu van "hop le" sau
 *                      khi ban ghi goc da bi sua — tuc mot phep tu cap phep lai am tham.
 *  · `scope`         — khach nao / san pham nao. Thieu no thi cau cua SKU A tra loi cho SKU B.
 *  · `evidenceClass` — duoc ke hay thuoc tham quyen. Day la RANH GIOI, va no do he thong dat.
 *  · `text`          — ky tu cua nguon, thu duy nhat duoc phat ra.
 */
export interface SourceEvidence {
  readonly sourceId: string;
  readonly version: string;
  readonly scope: EvidenceScope;
  readonly evidenceClass: EvidenceClass;
  readonly text: string;
}

/**
 * DAU CUA MOT DOAN VAN NGUON.
 *
 * Bo qua khoang trang giong `outboundFingerprint()` va vi cung mot ly do: mot lan nap lai lam doi
 * cach xuong dong khong duoc bien moi ban soan dang cho thanh het han. Doi CO NGHIA thi doi dau.
 */
export function evidenceVersion(text: string): string {
  return createHash('sha256').update(text.replace(/\s+/gu, ' ').trim()).digest('hex').slice(0, 16);
}

/**
 * BANG CHUNG KE DUOC — danh muc san pham.
 *
 * Lop `narrative` o day KHONG den tu viec doc cau chu. No den tu viec biet DA DOC COT NAO: ten,
 * don vi, mo ta, viet tat la cot DANH TINH san pham trong danh muc. Gia nam o bang `Price`, chinh
 * sach nam o cap dai ly — theo chinh mo hinh du lieu cua nen tang, khong theo mot phep doan.
 *
 * Do la mot lap luan CAU TRUC, va no la thu duy nhat duoc phep cap lop `narrative` ma khong can
 * mot tuyen bo tren tung ban ghi.
 */
export function catalogEvidence(
  sourceId: string,
  text: string,
  scope: EvidenceScope,
): SourceEvidence {
  return { sourceId, version: evidenceVersion(text), scope, evidenceClass: 'narrative', text };
}

/**
 * BANG CHUNG THUOC THAM QUYEN — chuoi do chinh may dinh gia/chinh sach/trang thai don sinh ra.
 *
 * Chung KHONG BAO GIO thanh menh de chon duoc. Nghe nguoc doi — day la nhung con so DUNG nhat cua
 * luot — nhung do dung la muc 2 hop dong: mot khang dinh co he qua phai di qua KHOI co kieu, noi
 * bo soan viet cau chu quanh no. "đơn giá 990.000đ" va "giá tham khảo tối thiểu 990.000đ" mang
 * cung con so va hai muc cam ket khac han; cau qualifier do thuoc bo soan, khong thuoc model.
 */
export function businessAuthorityEvidence(
  sourceId: string,
  text: string,
  scope: EvidenceScope,
): SourceEvidence {
  return {
    sourceId,
    version: evidenceVersion(text),
    scope,
    evidenceClass: 'business_authority',
    text,
  };
}

/**
 * BANG CHUNG TU MOT TAI LIEU DA DUYET — lop LAY TU BAN GHI, mac dinh la TU CHOI.
 *
 * `narrativeEligible !== true` => `unclassified`. Doc ky ba he qua, vi day la cho de bi noi long
 * nhat trong ca tep:
 *
 *  1. `undefined` (ban ghi co truoc ban nay, hoac chua ai xet) -> KHONG ke duoc. Vang mat la TU
 *     CHOI, khong bao gio la cho phep. Do la yeu cau muc 9 hop dong.
 *  2. `false` -> KHONG ke duoc, va do la mot tuyen bo co chu dich cua nguoi van hanh.
 *  3. `true` -> ke duoc, va do la mot HANH VI XUAT BAN cua nguoi that tren tung ban ghi — thu ma
 *     muc 3 huong 2 hop dong goi ten ("source-management metadata that marks which propositions
 *     are narrative-eligible").
 *
 * KHONG doc `question`/`answer` de doan lop. Mot phep quet van xuoi luc NAP van la dung bo nhan
 * dang muc 3 cam, chi chay som hon; va muc 9 cam han "auto-labelled by guessed semantics".
 */
export function documentEvidence(
  sourceId: string,
  text: string,
  scope: EvidenceScope,
  narrativeEligible: boolean | undefined,
): SourceEvidence {
  return {
    sourceId,
    version: evidenceVersion(text),
    scope,
    evidenceClass: narrativeEligible === true ? 'narrative' : 'unclassified',
    text,
  };
}

/**
 * BANG CHUNG KE DUOC cua mot luot, DA LOC THEO KHACH.
 *
 * Loc khach o day chu khong o cho goi: mot manh bang chung cua khach khac lot vao la su co nghiem
 * trong nhat co the xay ra tren duong nay, nen phep loc phai nam o CHO DUY NHAT ma moi duong deu
 * di qua, khong phai o tung cho goi.
 */
export function narrativeEvidence(
  evidence: readonly SourceEvidence[],
  tenant: string,
): SourceEvidence[] {
  return evidence.filter(
    (item) => item.evidenceClass === 'narrative' && item.scope.tenant === tenant,
  );
}

/** Van ban cua cac manh bang chung — cho cac lop doi chieu chi can ky tu. */
export function evidenceTexts(evidence: readonly SourceEvidence[]): string[] {
  return evidence.map((item) => item.text);
}

/**
 * GHIM MOT MANH BANG CHUNG — danh tinh + ban + pham vi + ky tu, trong MOT chuoi.
 *
 * Hinh dang: `x:<sourceId>@<version>#<sku|*>:<text>`.
 *
 * `sourceId` va `version` deu la ma he thong sinh (khong chua `@`/`#`/`:`), nen cat theo dau phan
 * cach DAU TIEN la du va khong nhap nhang: phan `text` duoc lay TRON phan con lai, ke ca khi
 * chinh no chua dau hai cham.
 *
 * Vi sao phai ghim ca `version`: diem nghen gui doc lai ban soan da luu, co the nhieu gio sau.
 * Neu chi ghim van ban thi mot ban ghi da bi sua/rut quyen ke van cho qua mot ban soan cu — tuc
 * he thong tu cap phep lai ma khong ai quyet dinh gi. Muc 8 ca 10 hop dong doi dung dieu nay.
 */
export function evidencePin(evidence: SourceEvidence, excerpt: string): string {
  return `x:${evidence.sourceId}@${evidence.version}#${evidence.scope.productSku ?? '*'}:${excerpt}`;
}

/** Mot manh bang chung DA GHIM, doc nguoc tu `OutboundComposition.grounded`. */
export interface PinnedEvidence {
  readonly sourceId: string;
  readonly version: string;
  readonly productSku: string | null;
  readonly excerpt: string;
}

/**
 * DOC NGUOC `evidencePin()` — diem nghen gui dung de kiem lai doc lap.
 *
 * Chuoi khong dung hinh dang bi BO, khong duoc doan lai: mot ghim hong la mot ban soan khong
 * chung minh duoc nguon goc, va cho no di tiep bang mot phep doc "de tinh" la mo lai dung cai
 * cong vua dong.
 */
export function parsePinnedEvidence(tokens: readonly string[]): PinnedEvidence[] {
  const pinned: PinnedEvidence[] = [];
  for (const token of tokens) {
    if (!token.startsWith('x:')) continue;
    const body = token.slice(2);
    const at = body.indexOf('@');
    const hash = body.indexOf('#', at + 1);
    const colon = body.indexOf(':', hash + 1);
    if (at < 1 || hash < at + 2 || colon < hash + 2) continue;
    const sku = body.slice(hash + 1, colon);
    pinned.push({
      sourceId: body.slice(0, at),
      version: body.slice(at + 1, hash),
      productSku: sku === '*' ? null : sku,
      excerpt: body.slice(colon + 1),
    });
  }
  return pinned;
}

/**
 * PHAM VI SAN PHAM CUA MOT BO GHIM CO NHAT QUAN KHONG?
 *
 * `true` khi moi ghim co pham vi san pham deu tro ve CUNG mot SKU (ghim toan khach thi luon hoa
 * hop). Mot loi nhan tron menh de cua SKU A voi menh de cua SKU B trong cung mot cau tra loi la
 * cai muc 4 hop dong goi ten: "A source record for SKU A must not become narrative evidence for
 * SKU B merely because both were returned in the same model turn."
 *
 * Phep kiem nay KHONG doc van xuoi — no chi nhin pham vi ma he thong da gan cho tung ban ghi.
 */
export function singleProductScope(scopes: readonly (string | null)[]): boolean {
  return new Set(scopes.filter((sku): sku is string => sku !== null)).size <= 1;
}

/**
 * PHAM VI NOI BO cho bang chung do CHINH HE THONG dung ra luc kiem lai.
 *
 * Khong thuoc khach nao vi no khong den tu mot ban ghi cua khach: no la dong do bo soan vua viet,
 * hay chinh menh de da duoc ghim. Phep loc khach (`narrativeEvidence`) khong chay o duong nay —
 * duong nay chi tai dung don vi de doi chieu, khong mo them cua nao.
 */
const INTERNAL_SCOPE: EvidenceScope = { tenant: '', productSku: null };

/**
 * DONG DO BO SOAN VUA RENDER, duoi dang bang chung.
 *
 * Chung la ky tu cua HE THONG (`ComposedBlock.lines` do bo soan viet tu `TurnBusinessFacts`), da
 * qua chang doi chieu grant, nen o chang kiem lai chung duoc dung lam don vi hop le. Khong co
 * duong nao tu day nguoc ve model.
 */
export function composedBlockEvidence(lines: readonly string[]): SourceEvidence[] {
  return lines.map((line, index) => ({
    sourceId: `composed:block:${index}`,
    version: evidenceVersion(line),
    scope: INTERNAL_SCOPE,
    evidenceClass: 'narrative' as const,
    text: line,
  }));
}

/**
 * MENH DE DA GHIM, dung lai thanh bang chung de chang 3c doi chieu.
 *
 * GIU NGUYEN `sourceId`, `version` va pham vi san pham cua ghim — do la ca diem cua viec ghim:
 * chang kiem lai phai doi chieu voi DUNG ban ghi va DUNG ban da duoc cap phep, khong phai voi mot
 * tap chuoi bat ky.
 */
export function pinnedEvidence(pinned: readonly PinnedEvidence[]): SourceEvidence[] {
  return pinned.map((pin) => ({
    sourceId: pin.sourceId,
    version: pin.version,
    scope: { tenant: '', productSku: pin.productSku },
    evidenceClass: 'narrative' as const,
    text: pin.excerpt,
  }));
}

/**
 * DANH TINH CUA MOT MANH TAI LIEU — dung CHUNG cho ben sinh va ben kiem.
 *
 * Hai ben tu ghep chuoi rieng thi mot ngay nao do chung lech nhau, va phep kiem het han se im
 * lang bo qua moi ghim thay vi bao dong. Nen chi co MOT cho dung ra hinh dang nay.
 */
export function documentSourceId(
  kind: 'faq' | 'advice',
  externalId: string,
  field: string,
): string {
  return `${kind}:${externalId}:${field}`;
}

/** Ghim co nguon goc la mot TAI LIEU — thu duy nhat co the bi rut quyen ke sau khi da soan. */
function isDocumentPin(sourceId: string): boolean {
  return sourceId.startsWith('faq:') || sourceId.startsWith('advice:');
}

/**
 * GHIM DA HET HIEU LUC — `[]` nghia la moi menh de van con duoc phep noi.
 *
 * Ba duong hong deu quy ve mot ket cuc, va do la co y: ban ghi BIEN MAT, ban ghi BI RUT QUYEN ke
 * (khong con trong so), hay ban ghi DA DOI NOI DUNG (`version` lech). Ca ba deu co nghia la cau
 * dang cho gui khong con duoc mot ban ghi hien hanh nao bao lanh.
 *
 * CHI xet ghim tai lieu. Bang chung danh muc mang lop `narrative` do CAU TRUC (doc cot ten/don
 * vi/mo ta cua danh muc), nen khong ai rut duoc quyen do — khong co gi de het han.
 */
export function stalePins(
  pinned: readonly PinnedEvidence[],
  index: ReadonlyMap<string, string>,
): PinnedEvidence[] {
  return pinned.filter(
    (pin) => isDocumentPin(pin.sourceId) && index.get(pin.sourceId) !== pin.version,
  );
}
