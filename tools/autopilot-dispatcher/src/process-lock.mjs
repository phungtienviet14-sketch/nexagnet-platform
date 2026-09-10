/**
 * KHOA MOT-TIEN-TRINH cua HE DIEU HANH.
 *
 * So cai chan mot task chay hai lan. Khoa nay chan mot thu khac: HAI DISPATCHER cung chay tren
 * cung mot may. Do la truong hop that va de xay ra — mot ban chay tay trong terminal, mot ban do
 * Task Scheduler goi luc dang nhap. Neu ca hai deu doc so cai truoc khi ai kip ghi, ca hai deu
 * thay "chua ai nhan" va ca hai deu phong.
 *
 * Co che: tao tep voi co `wx` — he dieu hanh dam bao chi MOT tien trinh tao duoc. Khong dung
 * "kiem tra ton tai roi tao", vi giua hai buoc do la dung cai khoang thoi gian ma loi nay song.
 *
 * Khoa CU (chu da chet) duoc thu hoi bang cach hoi HDH xem PID con song khong. Khong co buoc nay
 * thi mot lan mat dien la khoa ket vinh vien va nguoi van hanh phai xoa tep bang tay.
 */
import fs from 'node:fs';
import path from 'node:path';
import { REASONS, deny } from './errors.mjs';

const LOCK_FILE = 'dispatcher.lock';

/**
 * @param {number} pid
 * @param {{ kill: (pid: number, signal: number) => void }} proc
 */
function isAlive(pid, proc) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    // Signal 0 khong gui gi ca — chi hoi "tien trinh nay co ton tai va toi co quyen khong".
    proc.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM = ton tai nhung khac chu so huu => VAN la dang song, khong duoc thu hoi.
    return /** @type {any} */ (error)?.code === 'EPERM';
  }
}

/**
 * @param {{ dir: string, fsImpl?: typeof fs, proc?: { pid: number, kill: (pid: number, signal: number) => void }, now?: () => Date }} options
 */
export function acquireProcessLock(options) {
  const io = options.fsImpl ?? fs;
  const proc = options.proc ?? process;
  const now = options.now ?? (() => new Date());
  const file = path.join(options.dir, LOCK_FILE);

  try {
    io.mkdirSync(options.dir, { recursive: true });
  } catch (error) {
    return deny(REASONS.LOCK_UNWRITABLE, { code: /** @type {any} */ (error)?.code });
  }

  /** @param {boolean} allowReclaim */
  const tryCreate = (allowReclaim) => {
    try {
      const handle = io.openSync(file, 'wx');
      io.writeSync(
        handle,
        `${JSON.stringify({ pid: proc.pid, startedAt: now().toISOString() })}\n`,
      );
      io.closeSync(handle);
      return { ok: /** @type {const} */ (true) };
    } catch (error) {
      const code = /** @type {any} */ (error)?.code;
      if (code !== 'EEXIST') return deny(REASONS.LOCK_UNWRITABLE, { code });
      if (!allowReclaim) return deny(REASONS.LOCK_HELD, { holder: null });
      // `openSync('wx')` va `writeSync` la HAI buoc. Giua chung, tep khoa ton tai nhung con RONG.
      // Mot tien trinh thu hai roi dung vao khe do se doc ra chuoi rong, parse hong, suy ra "khong
      // co chu" roi CUOP mot khoa cua tien trinh dang song — dung tinh huong hai ban chay gan nhu
      // cung luc ma khoa nay sinh ra de chan. Nen doc khong ra = COI NHU CO CHU, khong thu hoi.
      // Doi lai: mot tep khoa hong that su can nguoi xoa tay, va do la danh doi dung huong.
      /** @type {{ pid?: number } | null} */
      let holder = null;
      try {
        holder = JSON.parse(io.readFileSync(file, 'utf8'));
      } catch {
        return deny(REASONS.LOCK_HELD, { holder: null, unreadable: true });
      }
      const pid = Number(holder?.pid);
      if (!Number.isInteger(pid) || pid <= 0) {
        return deny(REASONS.LOCK_HELD, { holder: null, unreadable: true });
      }
      if (isAlive(pid, proc)) return deny(REASONS.LOCK_HELD, { holder: pid });
      // Chu cu da chet: thu hoi DUNG MOT LAN, roi thu tao lai. Neu lan hai van EEXIST thi co mot
      // tien trinh khac vua gianh duoc — nhuong, khong gianh tiep.
      try {
        io.unlinkSync(file);
      } catch {
        return deny(REASONS.LOCK_HELD, { holder: pid });
      }
      return tryCreate(false);
    }
  };

  const created = tryCreate(true);
  if (!created.ok) return created;

  return {
    ok: /** @type {const} */ (true),
    file,
    pid: proc.pid,
    release() {
      try {
        io.unlinkSync(file);
        return true;
      } catch {
        return false;
      }
    },
  };
}
