import { normalize } from '../rules/text.js';

/**
 * VO HOI THOAI — cai gi con lai cho model viet sau khi noi dung nghiep vu da thuoc ve he thong.
 *
 * ---------------------------------------------------------------------------------------------
 * TEP NAY TRA LOI CAU CHAN CUOI CUNG CUA #189, VA NO KHONG PHAI MOT TU DIEN CAM.
 *
 * Review doc lap (05/09/2026, B1) chi ra rang sau #193 duong di vong van con nguyen:
 *
 *     co MOT nguon he thong nao do da tra cuu duoc
 *   + mot cach dien dat chinh sach MOI ma bo trich khong nhan ra
 *   = van xuoi den tay khach
 *
 * Bang chung la chinh muc 8 ca 5: `APPROVED_DOC` la mot cau MO TA SAN PHAM khong lien quan gi
 * ("Ghế Felix có tựa lưng lưới..."), the ma no du de mo cong G1 cho mot loi hua thanh toan bia
 * ("bên em cho mình khất tiền hàng tới khi bán xong"). Cau do khong co chu so nen G2 khong xet,
 * khong trung `POLICY_SURFACES` nen G3 khong xet, khong co grant nen G4 khong xet.
 *
 * ---------------------------------------------------------------------------------------------
 * VI SAO KHONG THEM "khat tien hang" VAO `POLICY_SURFACES`.
 *
 * Vi do dung la cach #187 da lam va da bi tu choi. Mot DANH SACH CAM tren mot ngon ngu vo han
 * luon co lop bo sot, va moi lan bo sot thi cong MO. Huong sua duoc review chi dinh la nguoc lai:
 * noi dung SU KIEN den tay khach phai TU NGUON HE THONG SO HUU ma ra.
 *
 * Nen cong o day la mot DANH SACH CHO, va no hong theo chieu DONG:
 *
 *     tu ngu trong loi nhan  ->  phai co mat trong nguon he thong cua chinh luot nay
 *                            ->  hoac phai la mot tu CHUC NANG trong danh sach dong duoi day
 *
 * Mot cach dien dat MOI khong nam trong nguon thi bi chan — dung vi no moi, chu khong phai vi ai
 * do da kip liet ke no. Do la khac biet ban chat giua danh sach CHO va danh sach CAM.
 *
 * ---------------------------------------------------------------------------------------------
 * DO LUONG TRUOC KHI VIET (muc 6 hop dong), tren TOAN BO kho tai lieu DA DUYET cua khach
 * (95 FAQ + 3 bai tu van = 98 tai lieu, `tenants/ultty/data/content-manifest.json`):
 *
 *     cau tra loi lay tu chinh tai lieu          98/98  (100%)  <- muc 8 ca 16 van dat
 *     cau do boc them vo le phep ("Dạ ... ạ.")   98/98  (100%)
 *     13 cau he qua BIA (ke ca ca 5)              0/98 duoc nhan, tren CA HAI cach viet
 *                                                 (co dau va khong dau)
 *     cau tra loi cua tai lieu A doi chieu voi
 *     nguon cua tai lieu B khong lien quan       55/9506 (0.58%)
 *
 * 0.58% con lai gan nhu deu la cap FAQ TRUNG NOI DUNG cua hai ma mau (`bb-grey` / `bb-rose`) —
 * tuc "nhan oan" mot cau vo hai, khong phai nhan mot cau bia.
 *
 * ---------------------------------------------------------------------------------------------
 * DOI CHIEU THEO DUNG CACH VIET, KHONG BO DAU. Day la mot quyet dinh, khong phai mot chi tiet.
 *
 * Bo dau thi `nợ` (mon no) va `nó` (dai tu) la cung mot chuoi. Do that: mot nguon FAQ ve quat
 * ("...cho nên chắc chắn là mát") du de "Dạ bên em cho mình nợ ạ." di lot — MOT LOI HUA CONG NO
 * duoc mot bai FAQ ve quat bao lanh. Do luong: 3/98 tai lieu lam duoc dieu do.
 *
 * Nen tu ngu NOI DUNG doi chieu theo DUNG cach viet (chi ha chu hoa). He qua da biet va da chon:
 * mot ban nhap viet HOAN TOAN khong dau se khong con tu ngu nao truy nguyen duoc, nen loi nhan bi
 * bo. Do la fail-closed, va no trung voi tien le co san trong chinh kho nay: `numeralValue()` tra
 * `null` cho mot cach viet nhap nhang, va `null` o cong tham quyen la KHONG GUI. Mot cach viet
 * nhap nhang khong duoc phep tu chon nghia co loi cho no.
 *
 * ---------------------------------------------------------------------------------------------
 * CHU SO KHONG DI QUA DAY. Chung thuoc G2/G4 — hai lop do doi chieu GIA TRI (1150k = 1.150.000),
 * chat hon nhieu so voi doi chieu chuoi. Xet lai o day chi lam yeu di, khong lam manh len.
 */

/**
 * TU CHUC NANG — tap DONG, va moi muc deu phai vo hai KHI DUNG MOT MINH.
 *
 * Day la thu duy nhat model duoc phep tu viet ma khong can nguon: dai tu, tieng le phep, lien tu,
 * gioi tu, tu phu dinh/tinh thai, tu de hoi. Muc 2 hop dong cho phep dung mot "conversational
 * envelope" phi su kien, va day la ranh gioi cua no.
 *
 * BA QUY TAC KHI THEM MOT MUC — vi pham mot trong ba la mo lai dung cai cong vua dong:
 *
 *  1. KHONG mot muc nao duoc la ten khach, ma SKU, con so, don vi tien, hay mot tu thuong mai
 *     (`no`, `gia`, `tang`, `giam`, `duyet`, `chot`, `ship`, `cod`, `vat`, ...). Co test khoa.
 *  2. Phai vo hai KHI DUNG MOT MINH, ke ca sau khi BO DAU. `ban` da bi loai vi `bạn` (dai tu) va
 *     `bán` (dong tu ban hang) cung mot chuoi sau khi bo dau; `no` bi loai vi `nó` va `nợ`.
 *  3. Cong nay chi tha MOT tu. Cac tu con lai cua cum van phai co nguon: `bao` o lai duoc (can cho
 *     "bao nhiêu") vi mot cau bao hanh van con `hanh` phai truy nguyen; `qua` o lai duoc (can cho
 *     "quá") vi mot cau tang qua van con `tang`.
 *
 * Danh sach nay la TU VUNG NEN TANG, khong phai cua mot khach: khong muc nao mang nghia thuong mai.
 */
const CONVERSATIONAL_ENVELOPE: ReadonlySet<string> = new Set(
  `
  da vang a o oi nhe nhi nha u oke ah
  thua kinh xin cam on mong
  em minh anh chi ta chung toi ho ai nguoi quy khach
  la thi ma va voi cung con nhung nen neu khi de cho tu den ve theo nhu cua boi vi tai ra vao
  trong ngoai tren duoi giua day kia nay ay
  co khong chua duoc bi phai se dang van cu chi moi rat qua lam hon nua deu cang the
  mot hai vai tung cac ca
  gi nao sao dau bao nhieu
  hoi noi giup tro can them xem kiem hieu biet
  `
    .trim()
    .split(/\s+/u),
);

/** Danh sach cho, de bo test doi chieu voi tu vung vat mang — xem `outbound-envelope.spec.ts`. */
export const ENVELOPE_WORDS: readonly string[] = [...CONVERSATIONAL_ENVELOPE];

/**
 * TU NGU cua mot doan van — chi chu cai, KHONG lay cum thuan chu so.
 *
 * Cum thuan chu so bi bo vi G2/G4 da so khop chung theo GIA TRI; doi chieu them theo chuoi o day
 * se lam mot cach viet hop le ("1.150.000đ" trong nguon vs "1150k" trong loi nhan) bi bo oan.
 */
function words(text: string): string[] {
  return text.match(/\p{L}[\p{L}\p{N}]*/gu) ?? [];
}

/**
 * TAP TU NGU MA HE THONG SO HUU trong luot nay.
 *
 * `sources` = chuoi he thong so huu (van ban tai lieu da duyet, ten/mo ta san pham trong danh muc,
 * so tien rules engine da dinh dang, nhan chinh sach) VA cac dong ma chinh bo soan vua render.
 *
 * TIN KHACH KHONG CO MAT O DAY, va do la co y. Khach xin cong no khong lam cho he thong co quyen
 * hua cong no — cung dung ranh gioi ma `buildGrounding()` da dat cho lop chinh sach. Tin khach chi
 * neo nguon cho CON SO (mot cau xac nhan so luong phai noi duoc), va lop do o G2.
 */
export function attestedWords(sources: readonly string[]): ReadonlySet<string> {
  const attested = new Set<string>();
  for (const source of sources) {
    for (const word of words(source)) attested.add(word.toLowerCase());
  }
  return attested;
}

/**
 * TU NGU TRONG `text` MA KHONG NGUON NAO CHUNG — `[]` = ca doan deu truy nguyen duoc.
 *
 * Tra ve DANH SACH chu khong phai `boolean` de nguoi truc doc duoc chinh chu da lam hong tin, va
 * de diem nghen gui bao lai duoc cung mot chu.
 */
export function unattestedWords(text: string, attested: ReadonlySet<string>): string[] {
  const missing: string[] = [];
  for (const word of new Set(words(text))) {
    if (attested.has(word.toLowerCase())) continue;
    if (CONVERSATIONAL_ENVELOPE.has(normalize(word))) continue;
    missing.push(word);
  }
  return missing;
}

/** Ghim tu ngu da truy nguyen vao bang chung — doc nguoc bang `parseAttestedTokens()`. */
export function attestedTokens(text: string, attested: ReadonlySet<string>): string[] {
  return [
    ...new Set(
      words(text)
        .map((word) => word.toLowerCase())
        .filter((word) => attested.has(word)),
    ),
  ].map((word) => `s:${word}`);
}

/** Doc nguoc `attestedTokens()` — diem nghen gui dung de kiem lai doc lap. */
export function parseAttestedTokens(tokens: readonly string[]): ReadonlySet<string> {
  return new Set(tokens.flatMap((token) => (token.startsWith('s:') ? [token.slice(2)] : [])));
}
