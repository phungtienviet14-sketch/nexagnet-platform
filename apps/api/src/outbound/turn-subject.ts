/**
 * CHU THE CUA LUOT — luot nay DUOC PHEP noi ve san pham nao (Issue #208).
 *
 * ---------------------------------------------------------------------------------------------
 * TEP NAY TRA LOI REVIEW DOC LAP 05/09/2026 TREN BAN #205 DA MERGE.
 *
 * #205 dong duoc cong DANH TINH: mot cau chi chon duoc neu ban ghi sinh ra no da duoc he thong
 * tuyen bo la ke duoc, dung ban da ghim, dung khach. Nhung phep kiem pham vi san pham cua no doc
 * NGUOC VAO CHINH NO:
 *
 *     const scopes = bound.units.map((unit) => unit.evidence.scope.productSku);
 *     if (!singleProductScope(scopes)) ...        // "cac nguon DA CHON co hoa hop voi nhau khong"
 *
 * Do la mot cau hoi PHAN THAN. No bat duoc mot loi nhan tron SKU A voi SKU B, nhung khong bat
 * duoc cai nang hon:
 *
 *     chu the that cua luot  = SKU B
 *     bang chung tra cuu duoc = mot cau cua SKU A
 *     model chon DUY NHAT cau cua A
 *     -> tap pham vi = {A} -> `singleProductScope({A}) === true` -> DUOC GUI
 *
 * Do tren `main` (`63ebe04`) TRUOC khi viet mot dong nao, dung `composeOutbound` that: cau cua
 * SKU A ra kenh, `sendable=true`, va no con qua duoc ca `pinnedOutboundVerdict` o diem nghen gui
 * hang gio sau. Khach hoi ve ghe, he thong tra loi bang thong so cua may loc khong khi.
 *
 * ---------------------------------------------------------------------------------------------
 * VE THIEU KHONG PHAI O BEN NGUON.
 *
 * Ban ghi DA mang dung SKU cua no — ghim `x:faq:a:1@<ban>#BB-GREY:...` noi dung su that. Thu
 * khong ton tai la VE CON LAI cua quan he: mot thu tinh HE THONG SO HUU tra loi "luot nay dang
 * noi ve cai gi". Khong co no thi khong co gi de doi chieu, va moi phep kiem pham vi deu chi
 * quay ve tu doi chieu voi chinh minh.
 *
 * ---------------------------------------------------------------------------------------------
 * VA NO KHONG DUOC PHEP DEN TU MODEL.
 *
 * Hai duong sau deu la duong VONG, va muc 3 hop dong loai tru han ca hai:
 *
 *     model goi tra_cuu_tai_lieu({sku: "A"})  -> cho nen chu the luot = A
 *     bang chung da chon chi co A             -> cho nen chu the luot = A
 *
 * Ca hai deu de model TU TAO ra cai tham quyen dang bi kiem. Chu the phai den tu mot ranh gioi
 * tat dinh: van ban CHINH KHACH vua gui, doi chieu danh muc san pham cua khach. Model khong voi
 * toi duoc tin cua khach.
 */

/**
 * BA TRANG THAI, KHONG PHAI HAI.
 *
 * `unresolved` khong phai mot khe ho hay mot gia tri mac dinh phai tranh — no la SU THAT ve rat
 * nhieu luot that: mot cau noi tiep khong nhac ten san pham ("bao hanh bao lau", "co den ngu
 * khong") thi he thong THUC SU khong biet dang noi ve cai gi. Muc 3 hop dong doi dung dieu do:
 * bieu dien su that ay tuong minh, va fail closed — khong bao gio bia ra mot SKU de lap cho.
 *
 * `ambiguous` tach rieng khoi `unresolved` vi hai su co khac han nhau doi voi nguoi truc: mot cai
 * la "khach chua noi san pham nao", mot cai la "khach nhac hai san pham va he thong khong duoc
 * phep tu chon mot". Gop lai thi ca hai deu hien ra y het nhau va nguoi truc se di tim sai cho.
 */
export type TurnSubject =
  | { readonly kind: 'unresolved' }
  | { readonly kind: 'single'; readonly productSku: string }
  | { readonly kind: 'ambiguous'; readonly productSkus: readonly string[] };

/** Luot chua xac dinh duoc san pham nao. Gia tri BINH THUONG, khong phai mot loi. */
export const UNRESOLVED_SUBJECT: TurnSubject = { kind: 'unresolved' };

/**
 * TU TAP SKU DA GIAI RA THANH CHU THE.
 *
 * Bo trung truoc khi dem: mot tin nhac "Felix" hai lan van la MOT san pham, va coi no la
 * `ambiguous` se lam fail closed mot luot hoan toan ro rang.
 */
export function resolveTurnSubject(skus: readonly string[]): TurnSubject {
  const unique = [...new Set(skus)];
  if (!unique.length) return UNRESOLVED_SUBJECT;
  if (unique.length === 1) return { kind: 'single', productSku: unique[0]! };
  return { kind: 'ambiguous', productSkus: unique };
}

/**
 * MANH BANG CHUNG NAY CO DUOC PHEP KE TRONG LUOT NAY KHONG?
 *
 * Doc DUY NHAT pham vi ma he thong da gan cho ban ghi, khong doc mot chu van xuoi nao — cung ly
 * do voi #189/#200/#205: moi bo nhan dang huu han tren ngon ngu vo han deu co lop bo sot, va mot
 * lop bo sot tren duong CHO PHEP la mot duong di vong hoan chinh.
 *
 * BA NHANH:
 *
 *  · `productSku === null` (pham vi TOAN KHACH) luon hoa hop. Mot cau thuong hieu hay mot chinh
 *    sach chung dung duoc trong moi luot, ke ca luot chua ro san pham — do la ca y nghia cua
 *    pham vi toan khach, khong phai mot nhan nhuong.
 *  · `single` — phai TRUNG dung SKU do. Day la ca ban sua.
 *  · `unresolved`/`ambiguous` — bang chung theo san pham KHONG dung duoc (muc 4 hop dong, quy
 *    tac v0 an toan). Khong doan, khong lay SKU dau tien, khong noi long khi chi co mot ung vien.
 */
export function subjectAdmits(subject: TurnSubject, evidenceProductSku: string | null): boolean {
  if (evidenceProductSku === null) return true;
  return subject.kind === 'single' && subject.productSku === evidenceProductSku;
}

/** Tien to cua the chu the trong `OutboundComposition.grounded`. */
const SUBJECT_PREFIX = 't:';

/**
 * GHIM CHU THE VAO BAN SOAN — ve CON LAI cua quan he, di theo ban soan xuong diem nghen gui.
 *
 * Vi sao phai ghim: Sale bam `Duyệt & gửi` co the nhieu gio sau luc soan. Luc do ngu canh tat
 * dinh cua luot khong con — khong con tin cua khach, khong con danh muc luc do. Ghim `x:` da
 * mang dung SKU cua tung nguon (#205); thieu ve nay thi khong co gi de doi chieu, va do dung la
 * cai M7 do duoc: mot ban soan sai pham vi qua duoc ca diem nghen gui.
 *
 * `ambiguous` KHONG ghim danh sach SKU: cai duy nhat diem nghen gui can biet la "luot nay khong
 * uy quyen cho bat ky bang chung theo san pham nao". Ghim them danh sach chi lam ban soan phinh
 * theo so SKU khach nhac, ma khong doi mot ket cuc nao.
 */
export function subjectPinToken(subject: TurnSubject): string {
  if (subject.kind === 'single') return `${SUBJECT_PREFIX}single:${subject.productSku}`;
  return `${SUBJECT_PREFIX}${subject.kind}`;
}

/**
 * DOC NGUOC the chu the — `null` nghia la BAN SOAN NAY KHONG MANG CHU THE NAO.
 *
 * `null` khac han `unresolved`: `unresolved` la mot tuyen bo ("he thong da xet va khong ra"),
 * con `null` la vang mat ("khong ai xet"). Ban ghi soan TRUOC ban nay roi vao nhanh `null`, va
 * ben goi phai xu ly no nhu mot vang mat — xem `pinnedOutboundVerdict`.
 *
 * The hong hinh dang bi BO chu khong doan lai: mot ghim hong la mot ban soan khong chung minh
 * duoc quan he, va doc "de tinh" chinh la mo lai cai cong vua dong.
 */
export function parseSubjectPin(tokens: readonly string[]): TurnSubject | null {
  for (const token of tokens) {
    if (!token.startsWith(SUBJECT_PREFIX)) continue;
    const body = token.slice(SUBJECT_PREFIX.length);
    if (body === 'unresolved') return UNRESOLVED_SUBJECT;
    if (body === 'ambiguous') return { kind: 'ambiguous', productSkus: [] };
    if (body.startsWith('single:')) {
      const sku = body.slice('single:'.length);
      if (sku) return { kind: 'single', productSku: sku };
    }
  }
  return null;
}
