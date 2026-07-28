/**
 * Chong trung + chong MAT TIN cho cac worker doc tin (ZcaListener, BotPoller).
 *
 * NGUYEN TAC BAT BIEN: chi danh dau tin la DA XU LY khi pipeline chay THANH CONG.
 * Truoc day ca hai worker danh dau NGAY TRUOC khi goi pipeline, nen mot loi tam thoi
 * (LLM timeout, mang chap chon) lam tin bi coi la da xong va KHONG BAO GIO chay lai —
 * ma Zalo thi khong phat lai tin. Do la mat don, mat tien cua khach.
 *
 * Tin THO da duoc luu xuong DB tu truoc do (PipelineService.saveMessage) nen khong mat du lieu;
 * cai mat la DON chua duoc tao. Vi vay: loi -> khong danh dau + log ERROR kem id de con lan ra.
 *
 * Vi sao KHONG dung BullMQ o day: CLAUDE.md da chot BullMQ nhung ghi ro "CHUA dung — YAGNI
 * voi 10-20 don/ngay". Thu lai trong tien trinh + log id that bai la du cho tai hien tai;
 * dung queue that khi co nhieu tien trinh worker hoac can retry song sot qua restart.
 */

/** Tran so tin DA XONG giu lai de chong trung. zca doc MOI tin nhom -> can chan phinh bo nho. */
export const MAX_SEEN = 2000;

/** So lan THU LAI khi xu ly that bai (ngoai lan chay dau). */
export const MAX_PROCESS_RETRIES = 2;

/** Gian cach giua 2 lan thu (ms). Test truyen 0 de chay nhanh. */
export const RETRY_DELAY_MS = 300;

/** Phan logger toi thieu ma processWithRetry can — de test truyen fake, khong phu thuoc Nest. */
export interface RetryLogger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Theo doi tin nao DA XONG va tin nao DANG chay.
 * - `done`: da xu ly thanh cong -> khong lam lai (co tran, bo id cu nhat khi vuot).
 * - `inFlight`: dang chay -> chan chay song song cung mot tin (zca co the ban trung su kien).
 */
export class MessageGuard {
  private readonly done = new Set<string>();
  private readonly inFlight = new Set<string>();

  /** Gianh quyen xu ly tin. false = da xong hoac dang co nguoi chay. */
  claim(id: string): boolean {
    if (this.done.has(id) || this.inFlight.has(id)) return false;
    this.inFlight.add(id);
    return true;
  }

  /** Xu ly THANH CONG -> danh dau da xong. */
  complete(id: string): void {
    this.inFlight.delete(id);
    this.done.add(id);
    if (this.done.size > MAX_SEEN) {
      const oldest = this.done.values().next().value;
      if (oldest !== undefined) this.done.delete(oldest);
    }
  }

  /** THAT BAI -> tra lai quyen. Tin KHONG bi danh dau, con duong xu ly lai. */
  release(id: string): void {
    this.inFlight.delete(id);
  }
}

/**
 * Chay `run` va thu lai khi loi tam thoi. Het luot -> tra null (ben goi PHAI release, khong complete).
 * `delayMs` tach ra lam tham so de test chay khong can cho.
 */
export async function processWithRetry<T>(
  run: () => Promise<T>,
  messageId: string,
  logger: RetryLogger,
  delayMs: number = RETRY_DELAY_MS,
): Promise<T | null> {
  const total = MAX_PROCESS_RETRIES + 1;
  for (let attempt = 1; attempt <= total; attempt++) {
    try {
      return await run();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (attempt < total) {
        logger.warn(`Xu ly tin ${messageId} that bai (lan ${attempt}/${total}), thu lai: ${detail}`);
        await sleep(delayMs);
        continue;
      }
      logger.error(
        `Tin ${messageId} XU LY THAT BAI het ${total} luot — tin tho da luu DB, CAN XU LY LAI THU CONG: ${detail}`,
      );
      return null;
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
