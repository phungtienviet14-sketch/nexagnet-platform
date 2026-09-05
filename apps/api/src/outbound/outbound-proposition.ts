import { evidencePin, type SourceEvidence } from './source-evidence.js';

/**
 * RANG BUOC MENH DE — cai gi quyet dinh NGHIA cua phan van xuoi den tay khach.
 *
 * ---------------------------------------------------------------------------------------------
 * TEP NAY TRA LOI REVIEW DOC LAP 05/09/2026 (Issue #200), VA NO KHONG PHAI MOT CONG THU SAU.
 *
 * G5 (`outbound-envelope.ts`) hoi: "co TU NGU nao ma khong nguon nao noi khong?". Cau do dong
 * duoc cong tu vung — mot cach dien dat MOI bi chan vi no moi. Nhung no khong dong duoc cong
 * NGHIA: model van ghep lai duoc chinh nhung tu ma nguon so huu thanh mot menh de khac han.
 *
 * Do tren `main` (`582ded3`) TRUOC khi viet mot dong nao, dung `composeOutbound` that:
 *
 *     nguon: "Khách hàng thanh toán ngay khi nhận hàng. Hàng bán xong không được đổi trả."
 *     model: "Khách hàng thanh toán khi bán xong."
 *     -> admitted, mode=narrative_only, sendable=true, NARRATIVE_ONLY_COMPOSITION
 *
 * Ky han thanh toan doi tu TRA NGAY KHI NHAN HANG thanh TRA SAU KHI BAN XONG. Khong mot con so
 * nao (G2 im), khong trung `POLICY_SURFACES` (G3 im), khong grant nao (G4 im), moi tu ngu deu co
 * trong nguon (G5 im). Va truong hop nang hon: `không / có / được / khi` DEU nam trong vo hoi
 * thoai cua G5, nen model dao nguoc duoc mot cau nguon bang dung nhung tu ma G5 tang khong:
 *
 *     nguon: "Hàng bán xong không được đổi trả."
 *     model: "Hàng bán xong được đổi trả ạ."        -> cung sendable=true tren main
 *
 * ---------------------------------------------------------------------------------------------
 * VI SAO KHONG THEM MOT CONG NHAN DANG THU SAU.
 *
 * Muc 3 hop dong #200 loai tru han: "a set of words, embeddings similarity, a classifier, regex,
 * or another parser over model prose is NOT sufficient as the correctness boundary". G1..G5 deu
 * la bo nhan dang hoac bo doi chieu TREN CHUOI CUA MODEL, va chuoi cua model van la thu den tay
 * khach. Them cong thu sau khong doi dieu do. Thu phai doi la: KY TU NAO den tay khach.
 *
 * ---------------------------------------------------------------------------------------------
 * TINH CHAT, MOT CAU:
 *
 *   Phan SU KIEN cua mot loi nhan la NHUNG MENH DE NGUYEN VEN CUA HE THONG, phat ra tu BAN SAO
 *   CUA CHINH HE THONG, boc quanh boi mot tap dong tu xung ho/le phep. Model chon MENH DE NAO va
 *   THU TU NAO. Model khong bao gio chon MOT MENH DE NOI GI.
 *
 * Do la huong 1 cua muc 3 hop dong ("model may select/request a source reference or approved
 * fragment, but renderer owns the exact customer-visible factual/policy statement"), voi phep
 * CHON duoc dien dat bang trich dan nguyen van thay vi bang mot ma so.
 *
 * ---------------------------------------------------------------------------------------------
 * DO LUONG TREN 98 TAI LIEU DA DUYET CUA KHACH, TRUOC KHI VIET (muc 6 hop dong):
 *
 *     cau tra loi lay tu chinh tai lieu                     95/98
 *     cau do boc vo le phep ("Dạ ... ạ.")                   95/98
 *     15 cau he qua BIA x 98 tai lieu                       0/1470 duoc nhan
 *     tra loi cua tai lieu A doi chieu nguon cua tai lieu B  44/9506 (0.46%)
 *     nua menh de A + nua menh de B trong CUNG mot luot      0/98 duoc nhan
 *
 * 3 tai lieu khong qua la `faq:v08:008/009/010`, cau tra loi cua chung dung mot chu "Có" — cong
 * `POLARITY` duoi day tu choi cho mot tieng "vang" tran ra kenh. Do la chieu fail-closed dung.
 * 44 lan nhan cheo la cac cap FAQ TRUNG NOI DUNG `bb-grey`/`bb-rose` — nhan DUNG, khong phai oan.
 */

/**
 * TU BOC — thu duy nhat model duoc tu viet ngoai menh de da rang buoc.
 *
 * CHI xung ho, le phep, va hai lien tu noi. KHONG co tu cuc/tinh thai, KHONG co lien tu quan he
 * (`nếu`, `vì`, `nên`, `thì`) — mot lien tu quan he dat giua hai menh de dung se khang dinh mot
 * quan he ma khong nguon nao noi, nen no phai nam TRONG mot menh de da rang buoc.
 *
 * DOI CHIEU CO DAU, KHAC HAN vo hoi thoai cua G5. Do khong phai mot chi tiet: bo dau thi `da`
 * phu ca `Dạ` (le phep) lan `da` (lan da), `anh` phu ca `anh` lan `ảnh`, `chi` phu ca `chị`,
 * `chỉ` lan `chi`. Mot tap CAT HAI DAU ma nham lan nhu vay se cat mat chu that cua nguon. Day la
 * cung mot quyet dinh #197 da chon cho tu ngu noi dung.
 */
const FILLER: ReadonlySet<string> = new Set(
  `
  dạ vâng ạ à ừ ơi nhé nhá nhỉ ok oke
  thưa kính xin cảm ơn mong
  em mình anh chị bạn tôi
  và với
  `
    .trim()
    .split(/\s+/u),
);

/**
 * TU CUC / TINH THAI — duoc phep o TRONG mot menh de, khong bao gio DU de thanh mot menh de.
 *
 * Mot menh de nguon chi gom nhung tu nay ("Có.") khong duoc bao lanh cho bat cu gi: neu no bao
 * lanh duoc thi mot cau "Dạ được ạ." — mot loi cap phep tron ven — se ra duoc kenh chi vi dau do
 * trong tai lieu co mot tieng "được".
 *
 * Chung KHONG nam trong `FILLER`, nen chung khong bao gio bi cat o hai dau: `không` cua nguon
 * phai co mat trong loi nhan, va do la cach mot phep dao nguoc bi bat.
 */
const POLARITY: ReadonlySet<string> = new Set(
  `có không được chưa phải sẽ đã bị rồi cũng vẫn đang cần nên chỉ`.trim().split(/\s+/u),
);

/** De bo test doi chieu hai tap voi tu vung vat mang — xem `outbound-proposition.spec.ts`. */
export const FILLER_WORDS: readonly string[] = [...FILLER];
export const POLARITY_WORDS: readonly string[] = [...POLARITY];

/**
 * RANH GIOI CAU — dung CHUNG cho nguon va cho loi nhan.
 *
 * Dung chung la bat buoc: hai ben cat khac nhau thi mot cau trich nguyen van cung truot.
 *
 * ---------------------------------------------------------------------------------------------
 * DAU PHAY, HAI CHAM, CHAM PHAY VA GACH NGANG KHONG PHAI RANH GIOI. Doan nay giai thich vi sao,
 * va no la ban sua mot lo hong THAT trong chinh ban dau cua tep nay.
 *
 * Ban dau cat ca o dau phay. He qua: mot ve DIEU KIEN duoc ngan bang dau phay tro thanh mot don
 * vi RIENG, va model chi viec khong trich no:
 *
 *     nguon: "Bảo hành 3 năm, 1 đổi 1 trong 7 ngày đầu tiên, nếu có lỗi từ nhà sản xuất."
 *     model: "Dạ bảo hành 3 năm, 1 đổi 1 trong 7 ngày đầu tiên ạ."
 *     -> qua duoc, va khach nhan mot loi hua doi 1-1 VO DIEU KIEN
 *
 * Cung mot hinh dang do voi "Giá áp dụng cho tất cả đại lý, trừ đại lý cấp 1." va "Đơn được miễn
 * phí ship, trừ khu vực miền núi.". Phep chan "khong cat duoi" chi dung khi ve bi cat nam TRONG
 * cung mot don vi — nen don vi phai la CA CAU.
 *
 * KHONG di loi "liet ke tu dan dat" (`nếu`, `trừ`, `nhưng`, ...): do lai la mot bo nhan dang huu
 * han tren mot ngon ngu vo han, dung thu ma muc 3 hop dong #200 loai tru.
 *
 * ---------------------------------------------------------------------------------------------
 * DAU CHAM CHI DUOC MIEN KHI CO CHU SO O CA HAI BEN.
 *
 * Mien theo kieu "khong co chu so o mot ben" lam mot dau cham KET CAU dung sau ma san pham bi
 * nuot: "Máy dùng khí Gas R290. Đây là loại khí gas cao cấp nhất." gop thanh MOT don vi, va mot
 * cau tra loi trich dung mot trong hai ve tro thanh khong the. Do la huong fail-restrictive, do
 * duoc tren chinh kho tai lieu cua khach.
 */
const SENTENCE_BOUNDARY = /((?:(?<!\p{N})\.|\.(?!\p{N})|[!?…\n\r])+)/u;

/**
 * MOT CAU HE THONG SO HUU.
 *
 * `text` la CA CAU, nguyen ky tu cua nguon — khong cat gi. `keys` la tu ngu con lai sau khi bo tu
 * boc o hai dau, va no CHI dung de doi chieu.
 *
 * HAI TRUONG NAY KHONG DOI XUNG, va do la co y. Cat tu boc de doi chieu thi mot loi nhan bo hay
 * them tieng xung ho o hai dau van khop. Nhung PHAT LAI ban da cat thi mot tu boc dong am voi tu
 * noi dung se cat mat chu that cua nguon: `kính` trong "hiện tượng nhà kính" la mot tieng le phep
 * trong `FILLER`, va mot don vi cat theo no ra "...hiện tượng nhà" — mot manh vo nghia co the den
 * tay khach. Nen doi chieu thi cat, phat lai thi khong.
 */
export interface SourceUnit {
  readonly text: string;
  /** Tu ngu da chuan hoa (chu thuong, GIU DAU) — khoa doi chieu, KHONG phai thu duoc phat ra. */
  readonly keys: readonly string[];
  /**
   * BAN GHI DA SINH RA CAU NAY (Issue #205).
   *
   * Thieu truong nay thi mot don vi chi con la mot chuoi, va mot chuoi khong tra loi duoc "ban
   * ghi nao, pham vi nao, duoc ke hay thuoc tham quyen" - dung cai muc 3 hop dong #205 goi la
   * fake provenance. Ca phep loc lop lan phep ghim ban deu doc tu day.
   */
  readonly evidence: SourceEvidence;
}

interface TokenSpan {
  readonly raw: string;
  readonly key: string;
  readonly start: number;
  readonly end: number;
}

function tokenSpans(text: string): TokenSpan[] {
  return [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((match) => ({
    raw: match[0],
    key: match[0].toLowerCase(),
    start: match.index,
    end: match.index + match[0].length,
  }));
}

/** Cat tu boc o HAI DAU. Tra ve chi so token dau/cuoi cua phan loi; `null` = toan tu boc. */
function coreRange(spans: readonly TokenSpan[]): { first: number; last: number } | null {
  let first = 0;
  let last = spans.length - 1;
  while (first <= last && FILLER.has(spans[first]!.key)) first += 1;
  while (last >= first && FILLER.has(spans[last]!.key)) last -= 1;
  return first > last ? null : { first, last };
}

function sentencesOf(text: string): string[] {
  return text
    .split(SENTENCE_BOUNDARY)
    .filter((_, index) => index % 2 === 0)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/**
 * CAU HE THONG SO HUU cua mot luot.
 *
 * Mot don vi KHONG BAO GIO trai qua hai chuoi nguon, nen phep ghep CHEO NGUON ma muc 2 hop dong
 * #200 goi ten la khong con duong nao de xay ra: mot phan trich phai nam gon trong mot cau, va
 * mot cau nam gon trong mot chuoi.
 */
export function sourceUnits(evidence: readonly SourceEvidence[]): SourceUnit[] {
  const units: SourceUnit[] = [];
  for (const source of evidence) {
    for (const sentence of sentencesOf(source.text)) {
      const range = coreRange(tokenSpans(sentence));
      if (!range) continue;
      const keys = tokenSpans(sentence)
        .slice(range.first, range.last + 1)
        .map((span) => span.key);
      // Mot cau chi gom tu cuc khong bao lanh duoc gi — xem chu thich `POLARITY`.
      if (!keys.some((key) => !POLARITY.has(key))) continue;
      units.push({ text: sentence, keys, evidence: source });
    }
  }
  return units;
}

export type PropositionBinding =
  | { readonly bound: true; readonly text: string; readonly units: readonly SourceUnit[] }
  | { readonly bound: false };

const NOT_BOUND: PropositionBinding = { bound: false };

/**
 * RANG BUOC LOI NHAN VAO CAU CUA NGUON — va PHAT LAI bang ky tu cua nguon.
 *
 * Tung doan cua loi nhan, sau khi cat tu boc o hai dau, phai TRUNG TRON VEN tu ngu cua MOT CAU
 * nguon — dung thu tu, dung dau, khong thieu mot tu nao. Bon he qua truc tiep, va ca bon deu la
 * yeu cau bat buoc cua muc 4 hop dong:
 *
 *  · GHEP LAI TRONG CUNG MOT NGUON: "Khách hàng thanh toán khi bán xong" khong la cau nao.
 *  · GHEP CHEO NGUON: mot cau khong trai qua hai nguon.
 *  · DAO NGUOC: bo chu `không` di thi phan con lai khong con trung cau nao.
 *  · CAT DUOI: giu ve dau roi bo ve sau cung la doi nghia — ke ca khi ve bi bo duoc ngan bang
 *    mot dau phay ("..., nếu có lỗi từ nhà sản xuất", "..., trừ đại lý cấp 1"). Do la ly do don
 *    vi la CA CAU chu khong phai menh de; xem `SENTENCE_BOUNDARY`.
 *
 * `text` tra ve duoc dung lai tu `unit.text` (CA CAU, ky tu cua NGUON) cong voi cac tu boc model
 * da chon (deu thuoc `FILLER`). Khong mot ky tu su kien nao la ky tu model tu viet.
 */
export function bindProposition(
  narrative: string,
  units: readonly SourceUnit[],
): PropositionBinding {
  const parts = narrative.split(SENTENCE_BOUNDARY);
  const bound: SourceUnit[] = [];
  const pieces: string[] = [];
  for (const [index, part] of parts.entries()) {
    // Chi so le la DAU NGAT do `SENTENCE_BOUNDARY` bat lai — quy ve mot tap ba ky tu, xem duoi.
    if (index % 2 === 1) {
      pieces.push(separatorOf(part));
      continue;
    }
    const spans = tokenSpans(part);
    if (!spans.length) continue;
    const range = coreRange(spans);
    // Toan tu boc ("Dạ em cảm ơn anh") — khong mang su kien nao, di qua nguyen van.
    if (!range) {
      pieces.push(spans.map((span) => span.raw).join(' '));
      continue;
    }
    const keys = spans.slice(range.first, range.last + 1).map((span) => span.key);
    const unit = units.find(
      (candidate) =>
        candidate.keys.length === keys.length &&
        candidate.keys.every((key, position) => key === keys[position]),
    );
    // MOT DOAN KHONG RANG BUOC DUOC LAM HONG CA LOI NHAN. Bo rieng doan do se de lai mot cau con
    // lai ma khong ai chon — va phan bi bo chinh la phan doi nghia.
    if (!unit) return NOT_BOUND;
    bound.push(unit);
    pieces.push(
      [
        ...spans.slice(0, range.first).map((span) => span.raw),
        unit.text,
        ...spans.slice(range.last + 1).map((span) => span.raw),
      ].join(' '),
    );
  }
  // Khong menh de nao duoc trich = khong co gi de noi. Mot loi nhan toan tu boc khong phai mot
  // cau tra loi, va cho no di tiep se lam `mode` thanh `narrative_only` voi noi dung rong.
  if (!bound.length) return NOT_BOUND;
  return { bound: true, text: assemble(pieces), units: bound };
}

/**
 * DAU NGAT PHAT RA — quy ve MOT TAP BA KY TU, khong phai dau ngat model tu chon.
 *
 * Hai cau dung dat canh nhau van la hai cau dung; do la phan du da noi ro. Nhung mot dau noi thi
 * khac: `A: B` doc len la "A, cu the la B" — mot QUAN HE ma khong nguon nao khang dinh, du ca hai
 * ve deu that. Dau hai cham, cham phay va gach ngang khong con la ranh gioi cau nua nen chung
 * khong ra duoc kenh theo duong nay; xuong dong va dau ba cham thi ve dau cham.
 *
 * Dau KET CAU thi giu, vi khong dau nao trong ba tao ra mot cam ket: mot cau hoi khong phai mot
 * loi hua, va mot dau cham than khong doi nghia cua cau dung truoc no.
 *
 * Ky tu ben trong MOT cau khong di qua day — chung la ky tu cua `unit.text`, tuc cua nguon.
 */
function separatorOf(raw: string): string {
  if (raw.includes('?')) return '?';
  return raw.includes('!') ? '!' : '.';
}

/** Noi lai: dau ngat dinh vao ve truoc, moi doan cach nhau dung mot khoang trang. */
function assemble(pieces: readonly string[]): string {
  let text = '';
  for (const piece of pieces) {
    if (!piece) continue;
    const punctuation = !/[\p{L}\p{N}]/u.test(piece);
    text += punctuation || !text ? piece : ` ${piece}`;
  }
  return text.trim();
}

/**
 * GHIM MENH DE DA RANG BUOC - kem DANH TINH, BAN va PHAM VI cua ban ghi (Issue #205).
 *
 * Truoc #205 cho nay ghim `x:<van ban>`: chi mot chuoi. Diem nghen gui doc lai chuoi do roi coi
 * chinh no la bang chung nguon goc - dung cai muc 3 hop dong goi la fake provenance. Mot ban ghi
 * da bi sua hay da bi rut quyen ke van cho qua mot ban soan cu, vi van ban thi khong doi.
 *
 * Doc nguoc bang `parsePinnedEvidence()` trong `source-evidence.ts`.
 */
export function boundExcerptTokens(units: readonly SourceUnit[]): string[] {
  return [...new Set(units.map((unit) => evidencePin(unit.evidence, unit.text)))];
}
