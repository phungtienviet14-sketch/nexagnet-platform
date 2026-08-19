/**
 * Xep hang FAQ theo tin nhan khach — BM25 tren token, co mo rong viet tat qua glossary tenant.
 *
 * VI SAO TACH RA KHOI `content.service.ts` (Pha 5, 19/08/2026): ban cu la mot ham 12 dong dem so
 * tu >=3 ky tu cua CAU HOI FAQ xuat hien trong tin khach bang `String.includes`. Hai lo hong:
 *
 * 1. `includes` la so khop CHUOI CON, khong phai token — "gia" khop trong "giao hang".
 * 2. Khong biet gi ve viet tat, ma viet tat khong dau la dac thu dau vao (CLAUDE.md). Khach go
 *    "bn tien", "cs bn w", "ve sinh ntn" thi khong khop tu nao voi FAQ viet du, roi vao
 *    `safeHandoff(['matching_faq'])` va chuyen Sale. AI im lang KHONG phai vi thieu du lieu, ma
 *    vi khong tim ra du lieu minh dang co.
 *
 * Mo rong viet tat la CONG THEM, khong phai thay the: token goc van o lai trong tui truy van. Nen
 * mot ban dich sai (glossary co ca `c`=chi lan `k`=khong/nghin) chi them nhieu, khong lam mat tin
 * hieu that. Va no chi anh huong viec CHON FAQ nao — khong mot chu nao cua khach bi viet lai.
 */
import { normalize } from '../rules/text.js';

/** Dung shape voi `glossary[]` trong goi tenant va `GlossaryEntry` cua knowledge. */
export type GlossaryTerm = { term: string; meaning: string };

/**
 * Nhieu hon vai cau la thanh mot buc tuong chu — khach Zalo khong doc. Truoc Pha 5 tran nay la 3;
 * noi len 5 chi an toan vi da co `RELATIVE_SCORE_FLOOR` chan cau khop yeu, chu khong phai vi
 * khach doc duoc nhieu hon.
 */
export const MAX_FAQ_ANSWERS = 5;

/**
 * Chi giu FAQ dat it nhat 30% diem cua cau dan dau. Khong co san nay thi noi tran 3->5 se keo
 * theo nhung cau chi khop mot tu pho bien ("bao" trong "bao hanh" va "bao nhieu" la CUNG mot
 * token sau khi bo dau).
 */
const RELATIVE_SCORE_FLOOR = 0.3;

/** Tham so BM25 chuan (Robertson/Sparck Jones): bao hoa tan suat + chuan hoa do dai tai lieu. */
const K1 = 1.2;
const B = 0.75;

/** Duoi nguong nay thi mot token khong con phan biet duoc gi — "co", "ve", "la"… */
const MIN_TOKEN_LENGTH = 3;

/**
 * Tu xa giao/hu tu. Danh sach nay CO CHU Y GIU NGAN: sau khi bo dau, rat nhieu hu tu tieng Viet
 * trung mat chu voi tu noi dung, va loai nham mot tu noi dung thi hong ca truy van.
 *
 * Da CAN NHAC roi LOAI khoi danh sach: `khi` (trung "khí" — may loc khong khi), `voi` (trung
 * "vòi"), `cua` (trung "cửa"), `ban` (trung "bàn"/"bán"), `chi` (trung "chi phí"), `gio` (trung
 * "gió"/"giờ"), `day` (trung "dây"), `dau` (trung "đầu"/"dầu"), `con`/`cai`/`cho`/`moi`.
 *
 * Token ngan hon 3 ky tu (`a`, `e`, `k`, `oi`, `ma`, `la`…) da bi `MIN_TOKEN_LENGTH` loai, khong
 * can liet ke o day.
 */
const STOPWORDS = new Set([
  'nhe',
  'nha',
  'nhi',
  'vay',
  'minh',
  'shop',
  'anh',
  'xin',
  'giup',
  'dum',
  'gium',
  'khong',
  'duoc',
  'roi',
  'luon',
  'nua',
  'cung',
  'thi',
  'sao',
  'the',
  'nay',
  'kia',
  'rat',
  'hoac',
  // Tu DE HOI: chung noi khach dang hoi, khong noi khach hoi VE CAI GI. Bo chung la bat buoc sau
  // khi co mo rong viet tat, vi `bn` no ra `bao nhieu` — hai token khong mang nghia san pham
  // nhung du hiem trong tap FAQ de an diem IDF cao. Do tren du lieu that (21 FAQ BB-GREY):
  // "con nay cs bn w b" (cong suat bao nhieu watt) truoc khi bo cho ra 5 ket qua dan dau boi
  // "BB loc duoc dien tich bao nhieu m2" — trong khi BB-GREY KHONG CO cau nao ve cong suat, tuc
  // dung ra phai chuyen Sale. Tra lai sai con te hon khong tra loi.
  // `bao` trung mat chu voi "bao" trong "bao hanh"/"bao duong", nhung hai cum do van nhan dien
  // duoc bang `hanh`/`duong` — da kiem bang test "bao hanh bao lau".
  'bao',
  'nhieu',
  'nao',
  'lau',
]);

/** Cat theo moi thu khong phai chu/so — dau cau, emoji, xuong dong. */
const TOKEN_SEPARATOR = /[^\p{L}\p{N}]+/u;

/** Nghia trong glossary co the kem chu thich: "khong (sau chu) / nghin (sau so)". */
const PARENTHETICAL = /\([^)]*\)/g;

function tokenize(normalized: string): string[] {
  return normalized
    .split(TOKEN_SEPARATOR)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(token));
}

/**
 * Tui token cua tin khach: token goc CONG token cua nghia moi viet tat khop duoc.
 *
 * Viet tat mot tu khop theo TOKEN nguyen ven (`rawTokens.has`) — khong khop chuoi con, neu khong
 * thi `c`=chi se no trong moi tu co chu "c". Muc glossary nhieu tu (goi tenant Ultty co 29 muc
 * dang cau mau nhu "bn tien 1 c vay shop") khop theo cum trong ca cau.
 */
function queryTokens(normalized: string, glossary: readonly GlossaryTerm[]): Set<string> {
  const rawTokens = new Set(normalized.split(TOKEN_SEPARATOR).filter(Boolean));
  const bag = new Set(tokenize(normalized));
  for (const entry of glossary) {
    const term = normalize(entry.term);
    if (!term) continue;
    const matched = term.includes(' ') ? normalized.includes(term) : rawTokens.has(term);
    if (!matched) continue;
    for (const token of tokenize(normalize(entry.meaning.replace(PARENTHETICAL, ' ')))) {
      bag.add(token);
    }
  }
  return bag;
}

/**
 * Duoi nguong nay thi mot lan khop chua phai bang chung: khach go 5-6 tu ma cau FAQ chi trung
 * DUNG MOT tu chung thuong la trung mat chu, khong phai trung y.
 */
const MIN_MATCHED_TERMS = 2;

/**
 * Co du bang chung de dua cau FAQ nay ra khong?
 *
 * Do tren du lieu that (21 FAQ BB-GREY, 19/08/2026): khach hoi "con nay cs bn w b" (cong suat bao
 * nhieu watt) trong khi BB-GREY KHONG CO cau nao ve cong suat. Bon cau van duoc keo ra, deu chi
 * vi trung DUNG MOT tu: "cong" (trung mat chu giua "cong suat" va "cong nghe") va "may". Khong bo
 * loc tan suat nao bat duoc kieu trung mat chu do — chi co dem so tu da khop.
 *
 * Tra loi sai chu de con te hon chuyen Sale, nen mac dinh la TU CHOI. Hai ngoai le:
 * - Truy van qua ngan (<=2 tu noi dung): khong con gi de doi hoi them.
 * - Tu da khop la tu DUY NHAT trong ca tap FAQ (`df === 1`): "hanh" trong "bao hanh" chi xuat
 *   hien o dung mot cau, khop mot tu nhung la bang chung chac.
 */
function isEvidenceEnough(
  matched: readonly string[],
  queryTerms: number,
  documentFrequency: ReadonlyMap<string, number>,
): boolean {
  if (matched.length >= MIN_MATCHED_TERMS) return true;
  if (queryTerms <= MIN_MATCHED_TERMS) return true;
  const only = matched[0];
  return only !== undefined && documentFrequency.get(only) === 1;
}

/**
 * Xep FAQ theo do lien quan voi tin khach, cao xuong thap; bo cac FAQ khong khop token nao va cac
 * FAQ khop qua yeu so voi cau dan dau. Tra ve toi da `MAX_FAQ_ANSWERS`.
 *
 * IDF dung bien "khong bao gio am" `ln(1 + (N - n + 0.5) / (n + 0.5))`: voi tap FAQ mot san pham
 * (thuong 1-21 cau) bien co dien co the ra so am va lat nguoc thu tu.
 */
export function rankFaqs<T extends { question: string }>(
  faqs: readonly T[],
  text: string,
  glossary: readonly GlossaryTerm[] = [],
): T[] {
  if (!faqs.length) return [];
  const normalized = normalize(text);
  const query = queryTokens(normalized, glossary);
  if (!query.size) return [];

  const documents = faqs.map((faq) => tokenize(normalize(faq.question)));
  const total = documents.length;
  const averageLength = documents.reduce((sum, document) => sum + document.length, 0) / total || 1;

  const documentFrequency = new Map<string, number>();
  for (const term of query) {
    documentFrequency.set(term, documents.filter((document) => document.includes(term)).length);
  }

  const scored = faqs
    .map((faq, index) => {
      const document = documents[index] ?? [];
      const matched: string[] = [];
      let score = 0;
      for (const term of query) {
        const seen = documentFrequency.get(term) ?? 0;
        if (!seen) continue;
        const frequency = document.filter((token) => token === term).length;
        if (!frequency) continue;
        const idf = Math.log(1 + (total - seen + 0.5) / (seen + 0.5));
        const saturation =
          (frequency * (K1 + 1)) /
          (frequency + K1 * (1 - B + (B * document.length) / averageLength));
        score += idf * saturation;
        matched.push(term);
      }
      return { faq, score, matched };
    })
    .filter(
      (entry) => entry.score > 0 && isEvidenceEnough(entry.matched, query.size, documentFrequency),
    )
    .sort((left, right) => right.score - left.score);

  const best = scored[0]?.score ?? 0;
  if (!best) return [];
  const floor = best * RELATIVE_SCORE_FLOOR;
  return scored
    .filter((entry) => entry.score >= floor)
    .slice(0, MAX_FAQ_ANSWERS)
    .map((entry) => entry.faq);
}
