/**
 * SO CAI CUC BO — tri nho ben cua "task nao da duoc nhan tren MAY NAY".
 *
 * Khong co no thi moi vong hoi la mot lan phong moi: dispatcher hoi GitHub, thay nhan `agent:ready`
 * van con day (Claude chua kip go), roi phong them mot Claude nua. Sau nam phut la nam tien trinh
 * cung ghi vao cung mot repo.
 *
 * Khoa la `dispatch:<repo>:<issue>:<contract_digest>`. Dau van tay nam TRONG khoa la co chu dinh:
 * sua hop dong sinh ra mot khoa khac, nen lop tren doc ra duoc "hop dong da doi sau khi nhan" thay
 * vi lang le chay lai duoi mot prompt khac.
 *
 * PHAM VI: mot may, mot tien trinh. Day KHONG PHAI exactly-once phan tan, va khong duoc quang cao
 * nhu vay. Hai PC cung tro vao mot repo se cung nhan mot task — chan dieu do la viec cua mot lop
 * khac, ngoai V0.
 */
import fs from 'node:fs';
import path from 'node:path';
import { REASONS, deny } from './errors.mjs';

const LEDGER_FILE = 'ledger.json';

/**
 * @typedef {object} LedgerRecord
 * @property {string} key
 * @property {string} repo
 * @property {number} issue
 * @property {string} taskId
 * @property {string} contractDigest
 * @property {string} promptDigest
 * @property {string} triggerPrincipal
 * @property {string} baseSha
 * @property {string} branch
 * @property {string} worktreeLabel
 * @property {string} model
 * @property {string} effort
 * @property {string} state
 * @property {string} claimedAt
 * @property {string} updatedAt
 * @property {number} launches so lan DA phong tien trinh cho khoa nay
 * @property {string | null} lastReason
 * @property {string} [handoffState] ket qua HAU KIEM tren GitHub, ghi rieng khoi `state`. Mot lan
 *   chay bi giet giua chung van co the da mo PR va de lai ban giao that; `state` phai noi that
 *   rang lan chay do khong sach, nhung bang chung do khong duoc bien mat cung voi no.
 * @property {number | null} [pr]
 */

/**
 * Ghi THAY THE nguyen tu: ghi ra tep tam trong cung thu muc roi doi ten de. `rename` de len tep
 * dang ton tai la nguyen tu tren ca POSIX lan Windows (MoveFileEx + REPLACE_EXISTING), nen khong
 * co cua so nao ma so cai nam tren dia o trang thai viet do dang.
 * @param {typeof import('node:fs')} io
 * @param {string} file
 * @param {unknown} data
 */
function writeAtomic(io, file, data) {
  const temp = `${file}.${process.pid}.tmp`;
  io.writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  io.renameSync(temp, file);
}

/**
 * @param {{ dir: string, fsImpl?: typeof fs, now?: () => Date }} options
 */
export function createLedger(options) {
  const io = options.fsImpl ?? fs;
  const now = options.now ?? (() => new Date());
  const file = path.join(options.dir, LEDGER_FILE);

  /** @returns {{ ok: true, records: Record<string, LedgerRecord> } | import('./errors.mjs').Denied} */
  function readAll() {
    if (!io.existsSync(file)) return { ok: /** @type {const} */ (true), records: {} };
    try {
      const parsed = JSON.parse(io.readFileSync(file, 'utf8'));
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return deny(REASONS.LEDGER_CORRUPT);
      }
      return { ok: /** @type {const} */ (true), records: parsed };
    } catch {
      // So cai hong KHONG duoc tu dong xoa di lam lai: xoa la mat dung cai tri nho dang chan mot
      // lan phong trung. Dung lai va de nguoi xu ly.
      return deny(REASONS.LEDGER_CORRUPT);
    }
  }

  return {
    file,

    readAll,

    /** @param {string} key */
    get(key) {
      const all = readAll();
      if (!all.ok) return all;
      return { ok: /** @type {const} */ (true), record: all.records[key] ?? null };
    },

    /**
     * Ghi mot ban ghi moi cho khoa nay. Neu khoa da ton tai => TU CHOI, khong ghi de.
     * @param {LedgerRecord} record
     */
    claim(record) {
      const all = readAll();
      if (!all.ok) return all;
      if (all.records[record.key]) {
        return deny(REASONS.TASK_ALREADY_CLAIMED, {
          key: record.key,
          state: all.records[record.key].state,
        });
      }
      const stamped = { ...record, claimedAt: now().toISOString(), updatedAt: now().toISOString() };
      try {
        io.mkdirSync(options.dir, { recursive: true });
        writeAtomic(io, file, { ...all.records, [record.key]: stamped });
      } catch (error) {
        return deny(REASONS.LEDGER_UNWRITABLE, { code: /** @type {any} */ (error)?.code });
      }
      return { ok: /** @type {const} */ (true), record: stamped };
    },

    /**
     * @param {string} key
     * @param {Partial<LedgerRecord>} patch
     */
    update(key, patch) {
      const all = readAll();
      if (!all.ok) return all;
      const current = all.records[key];
      if (!current) return deny(REASONS.LEDGER_CORRUPT, { key, problem: 'MISSING' });
      const next = { ...current, ...patch, key, updatedAt: now().toISOString() };
      try {
        writeAtomic(io, file, { ...all.records, [key]: next });
      } catch (error) {
        return deny(REASONS.LEDGER_UNWRITABLE, { code: /** @type {any} */ (error)?.code });
      }
      return { ok: /** @type {const} */ (true), record: next };
    },

    /**
     * Cac ban ghi cua CUNG mot Issue nhung KHAC dau van tay: bang chung hop dong da doi sau khi
     * task duoc nhan.
     * @param {{ repo: string, issue: number, contractDigest: string }} input
     */
    priorContractsFor({ repo, issue, contractDigest }) {
      const all = readAll();
      if (!all.ok) return all;
      const prefix = `dispatch:${repo}:${issue}:`;
      const others = Object.values(all.records).filter(
        (record) => record.key.startsWith(prefix) && record.contractDigest !== contractDigest,
      );
      return { ok: /** @type {const} */ (true), records: others };
    },
  };
}

/** @typedef {ReturnType<typeof createLedger>} Ledger */
