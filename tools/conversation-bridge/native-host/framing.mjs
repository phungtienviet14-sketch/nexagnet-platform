/**
 * DONG GOI CUA CHROME NATIVE MESSAGING: 4 byte do dai (little-endian) + JSON ma hoa UTF-8.
 *
 * Day la mot bo GIAI MA TICH LUY, khong phai mot ham `JSON.parse` boc mong. Ly do rat cu the:
 * `stdin` la mot dong byte, va Node giao no theo tung mieng tuy y. Mot khung 300 byte co the ve
 * lam ba lan, va hai khung nho co the ve trong cung mot lan. Ma nao gia dinh "moi chunk la mot
 * thong diep" se chay dung tren may nhanh va hong tren may cham — kieu hong te nhat.
 *
 * FAIL-CLOSED o moi cho:
 *   · do dai vuot tran        -> dung han duong ong, khong cap phat bo dem theo so ke khac noi
 *   · JSON hong               -> dung han, khong bo qua roi doc tiep (mot khung lech nua se lam
 *                                moi khung sau do lech theo, va "doc tiep" nghia la doc rac)
 *   · byte thua sau khi dong  -> la loi, khong phai du lieu
 *
 * Tran 64 KiB la co y rong gap nhieu lan khung WAKE lon nhat co the (~200 byte) va van nho hon
 * han gioi han 1 MiB cua Chrome cho chieu host -> tien ich.
 */
import { Buffer } from 'node:buffer';

export const MAX_FRAME_BYTES = 64 * 1024;
const HEADER_BYTES = 4;

/**
 * @param {unknown} value
 * @returns {Buffer}
 */
export function encodeFrame(value) {
  const payload = Buffer.from(JSON.stringify(value), 'utf8');
  if (payload.length > MAX_FRAME_BYTES) {
    throw new Error(`Khung vuot tran ${MAX_FRAME_BYTES} byte`);
  }
  const header = Buffer.alloc(HEADER_BYTES);
  header.writeUInt32LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

/**
 * @typedef {{ push: (chunk: Uint8Array) => { ok: true, frames: unknown[] } | { ok: false, error: string }, pending: () => number }} FrameDecoder
 */

/** @returns {FrameDecoder} */
export function createFrameDecoder() {
  let buffer = Buffer.alloc(0);
  let broken = /** @type {string | null} */ (null);
  return {
    push(chunk) {
      if (broken !== null) return { ok: false, error: broken };
      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
      /** @type {unknown[]} */
      const frames = [];
      for (;;) {
        if (buffer.length < HEADER_BYTES) return { ok: true, frames };
        const length = buffer.readUInt32LE(0);
        if (length === 0 || length > MAX_FRAME_BYTES) {
          broken = 'FRAME_LENGTH_INVALID';
          return { ok: false, error: broken };
        }
        if (buffer.length < HEADER_BYTES + length) return { ok: true, frames };
        const body = buffer.subarray(HEADER_BYTES, HEADER_BYTES + length);
        buffer = buffer.subarray(HEADER_BYTES + length);
        let parsed;
        try {
          parsed = JSON.parse(body.toString('utf8'));
        } catch {
          broken = 'FRAME_NOT_JSON';
          return { ok: false, error: broken };
        }
        frames.push(parsed);
      }
    },
    pending: () => buffer.length,
  };
}
