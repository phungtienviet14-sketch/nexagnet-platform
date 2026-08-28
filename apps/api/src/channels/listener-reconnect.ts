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
 * MOT KET NOI PHAI SONG BAO LAU thi moi duoc coi la "on dinh" va cho phep dat lai bo dem.
 *
 * ==============================================================================================
 * VI SAO CAN NGUONG NAY — do tren stack that, 28/08/2026:
 *
 *     07:38:46  zca-js listener: connected
 *     07:38:54  zca-js listener closed (1000): NORMAL_CLOSURE     <- 8 GIAY sau
 *
 * Neu bo dem duoc dat lai ngay khi `connected`, mot socket chap chon nhu tren se cho ra vong
 * lap: ket noi -> dat lai ve 0 -> dut sau 8s -> cho 2s -> ket noi... tuc **dang nhap vao tai
 * khoan Zalo moi ~10 giay, mai mai**.
 *
 * Voi mot userbot, do khong phai mot van de hieu nang. CLAUDE.md ghi ro rui ro: dung zca la vi
 * pham ToS va tai khoan CO THE BI KHOA. Mot vong dang nhap 10 giay/lan la cach nhanh nhat de
 * dieu do xay ra — tuc ban sua cho su co 44 gio se tu tao ra mot su co nang hon.
 *
 * Nen bo dem chi duoc dat lai khi ket noi da DUNG VUNG. Mot socket dut lien tuc se thay khoang
 * cho tang dan toi tran, dung nhu mot socket khong bao gio noi lai duoc.
 */
export const STABLE_CONNECTION_MS = 60_000;

/**
 * Ket noi vua roi co du "on dinh" de tha bo dem ve 0 khong?
 *
 * Tach thanh ham rieng de cai nguong tren duoc kiem bang mot bai test, thay vi nam an trong mot
 * phep so sanh giua hai `setTimeout`.
 */
export function shouldResetBackoff(connectedForMs: number): boolean {
  return connectedForMs >= STABLE_CONNECTION_MS;
}

/**
 * SAU KHI MOT LAN NOI LAI CHAY, cho bao lau roi moi hoi "the da nghe duoc chua?".
 *
 * ==============================================================================================
 * VI SAO CAN — mot lo hong that trong chinh ban sua truoc:
 *
 * `performConnect()` TU NUOT loi dang nhap: no bat `catch`, dat `connectionState = 'error'`, roi
 * tra ve BINH THUONG. Nen `connect().catch(...)` khong bao gio chay, va mot lan noi lai that bai
 * (mang con dut, Zalo dang tu choi) se KHONG hen lan thu ke tiep.
 *
 * Ket qua: mot kenh "tu chua" chi chua duoc DUNG MOT LAN roi bo cuoc im lang — tuc van la su co
 * §7.1, chi lui lai mot nhip. Mot co che tu phuc hoi that bai im lang con te hon khong co, vi no
 * lam nguoi ta thoi kiem tra.
 *
 * Nen sau moi lan thu, ta HOI LAI trang thai thay vi tin vao gia tri tra ve. `connected` la mot
 * su kien den sau, nen phai cho — 15 giay du cho mot lan dang nhap + bat tay WebSocket.
 */
export const RECONNECT_VERIFY_MS = 15_000;

/**
 * Ma dong nao dang duoc noi lai?
 *
 * TAT CA. Ham nay ton tai de cau tra loi do duoc VIET RA thay vi nam an trong mot nhanh `if` —
 * vi cau tra loi truoc day la "tat ca TRU 1000", va chinh cai tru do la su co §7.1.
 */
export function shouldReconnectAfterClose(_code: number | null): boolean {
  return true;
}
