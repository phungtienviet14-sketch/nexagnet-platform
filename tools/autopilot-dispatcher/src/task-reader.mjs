/**
 * Doc hop dong task tu THAN Issue — bang dung ngu nghia cua giao thuc, khong viet lai.
 *
 * `extractTaskContract` cua `@netviet/autopilot-protocol` da mang ca hai lop kiem (hinh dang +
 * quan he giua cac truong: HIGH thi phai co nguoi duyet, co risk_areas thi phai HIGH) va ca luat
 * "marker phai la dong noi dung dau tien". Package nay KHONG duoc noi long, khong duoc thay the,
 * va khong duoc sao chep mot manh nao cua no — mot ban sao la mot ban SE LECH.
 *
 * Thu duy nhat them vao la DAU VAN TAY chinh tac: mot chuoi 64 hex on dinh cho mot hop dong. No
 * lam ba viec: khoa so cai, khoa phat hien "hop dong doi sau khi da nhan", va ten nhanh/worktree.
 */
import { createHash } from 'node:crypto';
import { extractTaskContract } from '@netviet/autopilot-protocol/validator/index.mjs';
import { REASONS, deny } from './errors.mjs';

/**
 * Tuan tu hoa CHINH TAC: khoa doi tuong sap xep de `{a,b}` va `{b,a}` cho cung mot dau van tay.
 * Neu khong, mot lan Architect sua lai thu tu truong se doc ra thanh "hop dong khac" va lam vo
 * tinh dong nhat cua so cai.
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(/** @type {Record<string, unknown>} */ (value))
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** @param {unknown} value */
export function contractDigest(value) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

/**
 * @param {object} input
 * @param {string} input.body than Issue
 * @param {number} input.issue so Issue that (tu GitHub, khong tu than)
 * @returns {{ ok: true, contract: any, raw: Record<string, unknown>, digest: string } | import('./errors.mjs').Denied}
 */
export function readTaskContract({ body, issue }) {
  const extracted = extractTaskContract(body);
  // Ma tu choi cua giao thuc duoc CHUYEN TIEP nguyen van: nguoi van hanh doc log thay dung ma ma
  // tai lieu giao thuc mo ta, khong phai mot ban dich cua rieng dispatcher.
  if (!extracted.ok) return extracted;
  const declared = extracted.contract.issue;
  if (declared !== undefined && Number(declared) !== Number(issue)) {
    // Hop dong tu khai minh thuoc Issue khac => hoac bi chep sang cho khac, hoac dang tro sang mot
    // task khong phai task nay. Ca hai deu la ly do dung, khong phai ly do doan.
    return deny(REASONS.CONTRACT_ISSUE_MISMATCH, { declared: Number(declared), actual: issue });
  }
  return {
    ok: /** @type {const} */ (true),
    contract: extracted.contract,
    raw: extracted.raw,
    digest: contractDigest(extracted.raw),
  };
}
