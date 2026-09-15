// Doc cau hinh Autopilot V2 tu tep, KHONG khang dinh gi. Moi khang dinh nam trong tests/.
//
// VI SAO KHONG DUNG MOT THU VIEN YAML
//
// Goi nay do dung bon thu: mot khoi frontmatter nho do chinh repo nay viet, mot tep JSON, mot tep
// YAML bieu mau, va su ton tai cua mot tep. Keo mot dependency YAML vao chi de doc bon thu do la
// them be mat cho mot goi ma ly do ton tai cua no la GIAM be mat.
//
// Doi lai, ham doc frontmatter duoi day KHONG phai mot parser YAML: no chi tach dong, bo chu thich,
// va tra ve (thut le, khoa, gia tri). Han che duoc ghi ra o day chu khong giau: no khong hieu chuoi
// nhieu dong, khong hieu neo/alias, khong hieu flow map long nhau. Neu mot ngay frontmatter cua
// pilot can nhung thu do, hay doi sang thu vien YAML — dung co gang lam ham nay thong minh hon.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Goc repo, suy ra tu vi tri tep nay: tools/autopilot-v2-contract/src/ -> ../../../ */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const PATHS = {
  pilotWorkflow: join(REPO_ROOT, '.github', 'workflows', 'agent-builder.md'),
  pilotLock: join(REPO_ROOT, '.github', 'workflows', 'agent-builder.lock.yml'),
  ruleset: join(REPO_ROOT, '.github', 'rulesets', 'main-protection.json'),
  issueForm: join(REPO_ROOT, '.github', 'ISSUE_TEMPLATE', 'agent-task.yml'),
  workflowsDir: join(REPO_ROOT, '.github', 'workflows'),
  adr: join(REPO_ROOT, 'docs', 'kien-truc', 'adr-0001-autopilot-official-first.md'),
  evidence: join(REPO_ROOT, 'docs', 'phat-trien', 'van-hanh', 'autopilot-v2-official-first.md'),
};

/**
 * @typedef {object} FrontmatterLine
 * @property {number} indent  So dau cach dau dong.
 * @property {string} key     Khoa truoc dau hai cham. Rong neu dong la mot muc danh sach.
 * @property {string} value   Phan sau dau hai cham, da cat khoang trang. Co the rong.
 * @property {string} text    Nguyen van dong, da cat khoang trang hai dau.
 */

/**
 * @typedef {object} Frontmatter
 * @property {string} raw               Nguyen van khoi frontmatter, CO chu thich.
 * @property {string[]} commentLines    Cac dong chu thich, da cat `#` va khoang trang.
 * @property {FrontmatterLine[]} lines  Cac dong CO nghia (da bo chu thich va dong trong).
 */

/**
 * Tach khoi frontmatter nam giua cap `---` dau tien cua mot tep Markdown.
 *
 * @param {string} source Noi dung tep.
 * @returns {Frontmatter}
 * @throws {Error} Neu khong tim thay cap `---`.
 */
export function parseFrontmatter(source) {
  const normalized = source.replace(/\r\n/gu, '\n');
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/u.exec(normalized);
  if (match === null) {
    throw new Error('KHONG_TIM_THAY_FRONTMATTER: tep khong mo dau bang mot khoi `---`');
  }
  const raw = match[1];

  /** @type {string[]} */
  const commentLines = [];
  /** @type {FrontmatterLine[]} */
  const lines = [];

  for (const rawLine of raw.split('\n')) {
    const text = rawLine.replace(/\s+$/u, '');
    const trimmed = text.trim();
    if (trimmed === '') continue;
    if (trimmed.startsWith('#')) {
      commentLines.push(trimmed.replace(/^#\s?/u, ''));
      continue;
    }
    const indent = text.length - text.trimStart().length;
    const colon = /^(\s*)(-\s+)?([A-Za-z0-9_.-]+):(.*)$/u.exec(text);
    lines.push({
      indent,
      key: colon === null ? '' : colon[3],
      value: colon === null ? '' : colon[4].trim(),
      text: trimmed,
    });
  }

  return { raw, commentLines, lines };
}

/**
 * Doc frontmatter cua workflow pilot.
 *
 * @returns {Frontmatter}
 */
export function readPilotFrontmatter() {
  return parseFrontmatter(readFileSync(PATHS.pilotWorkflow, 'utf8'));
}

/**
 * Tim moi dong co dung mot khoa, bat ke thut le.
 *
 * @param {Frontmatter} frontmatter
 * @param {string} key
 * @returns {FrontmatterLine[]}
 */
export function linesWithKey(frontmatter, key) {
  return frontmatter.lines.filter((line) => line.key === key);
}

/**
 * @typedef {object} GhAwPin
 * @property {string | null} tag    Tag da ghim, dang `vX.Y.Z`.
 * @property {string | null} sha    Commit SHA 40 ky tu cua tag do.
 * @property {string | null} audit  Ngay ISO `YYYY-MM-DD` ban ghim duoc do lai lan cuoi.
 */

/**
 * Ban ghim gh-aw ma repo nay khai trong chu thich frontmatter. Day la QUY UOC CUA REPO NAY, khong
 * phai mot truong cua gh-aw — xem chu thich dau `.github/workflows/agent-builder.md`.
 *
 * @param {Frontmatter} frontmatter
 * @returns {GhAwPin}
 */
export function readGhAwPin(frontmatter) {
  /** @param {string} prefix */
  const pick = (prefix) => {
    const hit = frontmatter.commentLines.find((line) => line.startsWith(prefix));
    return hit === undefined ? null : hit.slice(prefix.length).trim();
  };
  return { tag: pick('gh-aw-pin:'), sha: pick('gh-aw-sha:'), audit: pick('gh-aw-audit:') };
}

/**
 * Cung ban ghim do, nhung khai trong mot tep Markdown bang chu thich HTML:
 *
 *     <!-- gh-aw-pin: v0.88.7 -->
 *
 * VI SAO PHAI CO. Ban ghim gh-aw xuat hien o BA cho: workflow pilot, ADR, va tai lieu bang chung.
 * Van xuoi thi doc duoc nhung khong do duoc — mot lan nang ban sua workflow roi quen hai tep kia
 * de lai mot ban ghim ma nguoi review tin nhung may khong con dung. Ba dong chu thich nay la phan
 * MAY DOC cua cung mot su that, va bat bien 11 bat chung phai trung nhau.
 *
 * @param {string} path Duong dan tep Markdown.
 * @returns {GhAwPin}
 */
export function readDocPin(path) {
  const source = readFileSync(path, 'utf8');
  /** @param {string} name */
  const pick = (name) => {
    const hit = new RegExp(String.raw`<!--\s*${name}:\s*([^\s>]+)\s*-->`, 'u').exec(source);
    return hit === null ? null : hit[1];
  };
  return { tag: pick('gh-aw-pin'), sha: pick('gh-aw-sha'), audit: pick('gh-aw-audit') };
}

/**
 * Cac check bat buoc + danh sach bypass khai trong tep ruleset da commit.
 *
 * @returns {{ requiredChecks: string[], strict: boolean, bypassActors: unknown[] }}
 */
export function readRuleset() {
  const ruleset = JSON.parse(readFileSync(PATHS.ruleset, 'utf8'));
  const rule = (ruleset.rules ?? []).find(
    (/** @type {{ type: string }} */ entry) => entry.type === 'required_status_checks',
  );
  const params = rule?.parameters ?? {};
  return {
    requiredChecks: (params.required_status_checks ?? []).map(
      (/** @type {{ context: string }} */ check) => check.context,
    ),
    strict: params.strict_required_status_checks_policy === true,
    bypassActors: ruleset.bypass_actors ?? [],
  };
}

/**
 * `.lock.yml` cua pilot da ton tai chua. Chua ton tai la trang thai DUNG cho toi khi qua cong §14
 * cua Issue #309 — xem `docs/phat-trien/van-hanh/autopilot-v2-official-first.md` §9.1.
 *
 * @returns {boolean}
 */
export function pilotLockExists() {
  return existsSync(PATHS.pilotLock);
}

/**
 * Moi gia tri `uses:` trong mot tep YAML workflow.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function usesRefs(source) {
  return [...source.replace(/\r\n/gu, '\n').matchAll(/^\s*-?\s*uses:\s*(\S+)/gmu)].map(
    (match) => match[1],
  );
}
