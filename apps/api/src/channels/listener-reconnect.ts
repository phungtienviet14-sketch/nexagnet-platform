/**
 * CHINH SACH NOI LAI cua listener Zalo.
 *
 * ==============================================================================================
 * VI SAO CAN, TRONG KHI `listener.start({ retryOnClose: true })` DA DUOC BAT:
 *
 * Vi no khong chay o truong hop da xay ra that. Log ngay 27/08/2026:
 *
 *     04:36:01  zca-js listener closed (1000): NORMAL_CLOSURE
 *     (khong con dong nao nua — 25 gio)
 *
 * `1000` la ma dong BINH THUONG cua WebSocket: khong loi, khong ngoai le. Thu vien coi do la
 * "ben kia dong tu te, khong co gi de thu lai", nen `retryOnClose` khong kich hoat. Lan hoi phuc
 * duy nhat den tu viec container duoc TAO LAI khi deploy.
 *
 * Nen bat bien o day nguoc lai: **moi lan socket dong deu la mot lan phai noi lai**, ke ca dong
 * "binh thuong". Voi mot kenh DOC, mot socket dong tu te van la mot kenh khong nghe duoc.
 *
 * ==============================================================================================
 * KHONG GIOI HAN SO LAN THU, va do la mot lua chon:
 *
 * "Bounded backoff" o day la chan tren cua KHOANG CHO, khong phai chan tren cua SO LAN. Mot
 * listener bo cuoc sau N lan chinh la trang thai 44 gio — chi khac la no den nhanh hon. Kenh doc
 * la duong song cua GD1; no phai kien tri chung nao tien trinh con song.
 *
 * Cai duoc chan la CHI PHI: khoang cho tang gap doi toi tran 5 phut, nen mot Zalo dang tu choi
 * bi hoi 12 lan mot gio, khong phai 1800 lan.
 *
 * Loi DANG NHAP (credential hong) di duong KHAC: no chuyen trang thai sang `error` va doi nguoi
 * quet QR moi. Thu lai mai mai mot credential da hong khong bao gio thanh cong.
 */

/** Khoang cho dau tien. Du ngan de mot lan dut thoang qua duoc chua gan nhu tuc thi. */
const BASE_DELAY_MS = 2_000;
/** TRAN. Toi day thi ngung tang — 12 lan hoi moi gio la cai gia hop ly de giu kenh song. */
const MAX_DELAY_MS = 300_000;
/**
 * Bien thien ngau nhien ±20%.
 *
 * Khong phai trang tri: neu ca ba tien trinh cung mat ket noi vi mot su co mang, mot khoang cho
 * tat dinh se lam ca ba hoi lai DUNG CUNG MOT LUC, mai mai. Nhieu ngau nhien pha the dong bo do.
 */
const JITTER_RATIO = 0.2;

export interface ReconnectDelayInput {
  /** Lan thu thu may, bat dau tu 1. */
  readonly attempt: number;
  /** Nguon ngau nhien, tiem vao de bai test tat dinh. */
  readonly random?: () => number;
}

export function nextReconnectDelayMs(input: ReconnectDelayInput): number {
  const attempt = Math.max(1, Math.floor(input.attempt));
  // Ep tran o dang SO MU chu khong chi o ket qua: `2 ** (attempt - 1)` cham `Infinity` o attempt
  // ~1024, va mot kenh dut ca ngay se dem toi do. `Math.min` ben duoi chan tu lau truoc, nhung
  // mot `Infinity` di qua phep nhan se thanh `NaN` o buoc jitter.
  const exponential = BASE_DELAY_MS * 2 ** Math.min(attempt - 1, 20);
  const capped = Math.min(exponential, MAX_DELAY_MS);
  const random = input.random ?? Math.random;
  // `random()` in [0,1) -> he so in [0.8, 1.2).
  const factor = 1 - JITTER_RATIO + random() * (2 * JITTER_RATIO);
  return Math.max(BASE_DELAY_MS, Math.round(capped * factor));
}

/**
 * Ma dong nao dang duoc noi lai?
 *
 * TAT CA. Ham nay ton tai de cau tra loi do duoc VIET RA thay vi nam an trong mot nhanh `if` —
 * vi cau tra loi truoc day la "tat ca TRU 1000", va chinh cai tru do la su co §7.1.
 */
export function shouldReconnectAfterClose(_code: number | null): boolean {
  return true;
}
