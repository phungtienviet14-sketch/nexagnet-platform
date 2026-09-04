/**
 * THAN LOI CUA GITHUB -> MOT CHAN DOAN DOC DUOC, DA LAM SACH.
 *
 * VI SAO TEP NAY TON TAI
 *
 * `api()` truoc day VUT than khi non-2xx: `body` chi duoc parse khi `response.ok`. Nen mot `403` ve
 * toi log duoi dang dung MOT CON SO. Lan chay that `33889198070` dung o do — decision `HEAD_MISMATCH`
 * dung, roi `COMMENT_POST_FAILED status=403` — va khong mot chu nao cua GitHub giai thich tai sao.
 *
 * Mot con so `403` khong phan biet duoc: thieu quyen · PR bi khoa · repo archived · interaction
 * limit · token het han. Nam nguyen nhan, nam hanh dong khac han, mot con so. Nen lan chan doan vua
 * roi phai LOAI TRU tung cai bang cac phep do rieng — mot viec le ra khong phai lam neu cau tra loi
 * cua GitHub con nguyen. Cau do ("Resource not accessible by integration") nam trong than, va than
 * bi vut truoc khi ai kip doc.
 *
 * VI SAO PHAI LAM SACH
 *
 * Log cua GitHub Actions la CONG KHAI tren mot repo public. Nen tep nay khong bao gio mang ca than
 * tho ra log: no CHON dung nhung truong GitHub tai lieu hoa (`message`, `documentation_url`,
 * `errors[]`), va chay moi chuoi qua mot bo mau bi mat truoc khi tra ve.
 *
 * KHONG MOT HEADER NAO di qua day, va do la mot quyet dinh CAU TRUC chu khong phai mot bo loc:
 * `authorization` khong the lo ra tu mot ham chi nhan `text`. Cai duy nhat con phai loc la than —
 * va no chi lo bi mat khi co ai do o dau day doi lai chinh cau tra loi cua GitHub (proxy, gateway).
 *
 * Tep nay THUAN. Viec goi mang nam o `github.mjs`.
 */

/** Chuoi thay cho mot bi mat bi cat. Mot MA, khong phai mot cau — no di thang vao log. */
export const REDACTED = '[REDACTED]';

/**
 * Toi da ky tu giu lai cho MOT chuoi. Du cho mot cau GitHub tra ve, khong du cho ca mot trang HTML
 * cua proxy do vao log.
 */
const MAX_TEXT = 300;

/** Toi da phan tu cua `errors[]` giu lai. Mot loi validation thu sau khong noi them dieu gi. */
const MAX_ERRORS = 5;

/**
 * MAU CUA BI MAT — NEO O TIEN TO, KHONG O DO HON LOAN.
 *
 * Mot mau kieu "chuoi 40 ky tu hex" se cat luon SHA, tuc cat dung thu ma moi chan doan o day can
 * nhat. Bon dinh dang duoi day la dinh dang token GitHub TAI LIEU HOA, nen chung cat dung cai can
 * cat va khong cham vao thu khac:
 *
 *   ghs_         token cua `GITHUB_TOKEN` trong Actions (server-to-server) — cai co that o duong nay
 *   ghp_ gho_ ghu_ ghr_   cac loai token nguoi dung
 *   github_pat_  personal access token (fine-grained)
 *   Bearer ...   header bi ai do doi nguoc vao than
 */
const SECRETS = Object.freeze([
  /gh[pousr]_[A-Za-z0-9]{16,}/g,
  /github_pat_[A-Za-z0-9_]{16,}/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /x-access-token:[A-Za-z0-9._-]+/gi,
]);

/**
 * Mot chuoi da lam sach va cat ngan, hoac `null` neu khong phai chuoi co noi dung.
 * @param {unknown} value
 * @returns {string | null}
 */
function cleanText(value) {
  if (typeof value !== 'string') return null;
  let text = value;
  // `String.prototype.replace` dat lai `lastIndex` ve 0 sau khi chay xong, nen dung lai duoc cac
  // mau `/g` dung chung o tren.
  for (const pattern of SECRETS) text = text.replace(pattern, REDACTED);
  text = text.trim();
  if (text.length === 0) return null;
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}...` : text;
}

/**
 * Bo cac truong `null` de mot chan doan chi mang thu GitHub thuc su noi.
 * @param {Record<string, unknown>} entry
 * @returns {Record<string, unknown>}
 */
const withoutNulls = (entry) =>
  Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== null));

/**
 * `errors[]` cua GitHub: moi phan tu la mot loi validation cu the.
 *
 * Chi giu BON truong tai lieu hoa. Mot phep `...entry` se keo theo bat ky truong nao GitHub them
 * sau nay — tuc mo mot duong cho du lieu chua ai xem xet di thang vao log cong khai.
 *
 * @param {unknown} value
 * @returns {Array<Record<string, unknown>> | null}
 */
function cleanErrors(value) {
  if (!Array.isArray(value)) return null;
  const entries = value
    .slice(0, MAX_ERRORS)
    .map((entry) =>
      withoutNulls({
        resource: cleanText(entry?.resource),
        field: cleanText(entry?.field),
        code: cleanText(entry?.code),
        message: cleanText(entry?.message),
      }),
    )
    .filter((entry) => Object.keys(entry).length > 0);
  return entries.length > 0 ? entries : null;
}

/**
 * Than tho cua mot cau tra loi non-2xx -> chan doan da lam sach, hoac `null` neu than rong.
 *
 * `null` la mot cau tra loi CO NGHIA: "GitHub khong noi gi ca". No khac han "GitHub noi khong du
 * quyen", va nguoi truc phai phan biet duoc hai cai do.
 *
 * @param {unknown} text Than tho, dung nhu `response.text()` tra ve.
 * @returns {Record<string, unknown> | null}
 */
export function describeApiError(text) {
  const raw = typeof text === 'string' ? text.trim() : '';
  if (raw.length === 0) return null;

  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Than khong phai JSON — mot trang loi cua proxy, hoac HTML cua GitHub. "Khong doc duoc" cung
    // la mot chan doan, va no khac han mot cau tu chinh GitHub.
    return withoutNulls({ raw: cleanText(raw) });
  }

  if (parsed === null || typeof parsed !== 'object') {
    return withoutNulls({ raw: cleanText(raw) });
  }

  const source = /** @type {Record<string, unknown>} */ (parsed);
  const described = withoutNulls({
    message: cleanText(source.message),
    documentationUrl: cleanText(source.documentation_url),
    errors: cleanErrors(source.errors),
  });

  // Than JSON co that nhung khong mang mot truong nao ta biet: giu mot manh tho da lam sach, con
  // hon tra ve mot object rong roi de nguoi truc doan.
  return Object.keys(described).length > 0 ? described : withoutNulls({ raw: cleanText(raw) });
}
