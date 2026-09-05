/**
 * TIN NHAN DANH THUC — thu DUY NHAT cau noi duoc dua vao ChatGPT.
 *
 * Bat bien cua hop dong #204 §1.4 va §8: KHONG mot byte van ban tu do nao tu GitHub duoc di qua
 * cau noi. Khong than comment, khong log CI, khong than Issue, khong diff, khong URL do carrier
 * cung cap. Ly do khong phai la giu bi mat — la giu RANH GIOI TIEM NHIEM: neu than comment di qua
 * duoc, thi bat ky ai binh luan duoc tren repo public deu viet duoc chi thi thang vao mot phien
 * ChatGPT dang dang nhap cua nguoi dung.
 *
 * Nen ban mau nam O DAY, trong repo nay, va no nhan dung ba nguyen thuy DA KIEM:
 *
 *   repo     — tu CAU HINH CUC BO (khong phai tu carrier)
 *   pr       — so nguyen, tu carrier da qua schema V0
 *   headSha  — 40 hex, va la HEAD SONG da doi chieu, khong phai gia tri khai trong carrier
 *
 * Va — day moi la phan chiu luc — ham TU KIEM DAU RA cua chinh no truoc khi tra ve. Mot lan sua
 * tuong lai them mot truong (vi du `RISK=` lay tu carrier, hay mot ghi chu cua nguoi review) se
 * lam `WAKE_MESSAGE_PATTERN` khong khop va ham NEM, chu khong lang le gui di. Bat bien duoc cuong
 * che boi ma nguon, khong boi mot cau trong tai lieu.
 */

/** Dong dau — hang so, khong tham so hoa. */
export const WAKE_HEADLINE = 'review autopilot pending';

/**
 * Hinh dang DAY DU cua tin nhan. Neo hai dau (`^`/`$`) la co y: mot ban vao them mot dong cuoi
 * cung se bi bat.
 */
export const WAKE_MESSAGE_PATTERN =
  /^review autopilot pending\nREPO=[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\nPR=[1-9][0-9]{0,15}\nHEAD_SHA=[0-9a-f]{40}$/;

const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const SHA40_PATTERN = /^[0-9a-f]{40}$/;

/**
 * @param {{ repo: string, pr: number, headSha: string }} input
 * @returns {string}
 */
export function buildWakeMessage({ repo, pr, headSha }) {
  if (typeof repo !== 'string' || !REPO_PATTERN.test(repo)) {
    throw new Error('Tin nhan danh thuc: ten kho khong hop le');
  }
  if (!Number.isSafeInteger(pr) || pr < 1) {
    throw new Error('Tin nhan danh thuc: so PR khong hop le');
  }
  if (typeof headSha !== 'string' || !SHA40_PATTERN.test(headSha)) {
    throw new Error('Tin nhan danh thuc: HEAD_SHA khong hop le');
  }
  const message = [WAKE_HEADLINE, `REPO=${repo}`, `PR=${pr}`, `HEAD_SHA=${headSha}`].join('\n');
  // TU KIEM DAU RA. Khong phai thua: no la cho duy nhat bat duoc mot truong moi bi them vao ban
  // mau, ke ca khi tat ca kiem dau vao o tren van xanh.
  if (!WAKE_MESSAGE_PATTERN.test(message)) {
    throw new Error('Tin nhan danh thuc lech khoi ban mau co dinh — tu choi gui');
  }
  return message;
}
