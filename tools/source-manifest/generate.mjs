/**
 * SINH BANG VI TRI MA NGUON tu chinh AST cua `apps/api/src`.
 *
 * ---------------------------------------------------------------------------
 * VI SAO SINH RA chu khong viet tay:
 *
 * Muc 19 cam mot bang anh xa viet tay kieu `if (name === 'order.approve') file = '…'`. Mot bang
 * nhu the la mot su that THU HAI ve ma nguon, va no bat dau troi khoi su that thu nhat ngay lan
 * refactor dau tien — im lang, vi khong co gi kiem no.
 *
 * Bang nay doc tu chinh ma nguon, va `pnpm test:source-manifest` sinh lai roi so voi ban da
 * commit. Troi khoi nhau la CI do, khong phai mot man hinh chi sai cho.
 *
 * ---------------------------------------------------------------------------
 * VI SAO KHONG DUNG `new Error().stack`:
 *
 * Vi trong repo nay no cho ket qua SAI, khong phai vi no cham. Bon ranh gioi nghiep vu di qua
 * mot ham boc mong:
 *
 *   pipeline.service.ts:116        `this.observed(name, fn)`
 *   orders.service.ts:461          `telemetry.step(step, fn, { actor })`
 *   sales-order-outcome.ts:85      `this.observed(name, fn)`
 *   outbound-channel.router.ts:102 `this.telemetry.step(name, …)`
 *
 * Khung ngan xep gan nhat cua MOI buoc di qua chung deu la chinh dong boc do. Mot man hinh chi
 * moi buoc ve `pipeline.service.ts:116` thi khong sai ve ky thuat, nhung vo dung — va no vo dung
 * mot cach IM LANG, tuc kieu hong te nhat cho mot cong cu chan doan.
 *
 * Chuoi ky tu thi nguoc lai: `this.observed('conversation.resolve', …)` viet o DUNG ranh gioi
 * nghiep vu. Nen ta di tim CHUOI, khong di tim khung ngan xep.
 *
 * ---------------------------------------------------------------------------
 * BAT BIEN: CHI NOI DUNG PHAN BANG CHUNG CHIU DUNG DUOC.
 *
 * `channel.send` xuat hien o HAI cho (`outbound-channel.router.ts` dong 43 va 78). Chon bua mot
 * trong hai se dua nguoi debug toi nham nhanh trong dung luc ho tin man hinh nhat.
 *
 * Nhung im han cung sai: ca hai cho deu nam trong DUNG MOT TEP, va tep do la mot su that. Nen
 * bang ghi tep, bo dong. Xem `reduceToEvidence()` — ba muc do dong thuan, khong phai hai.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

/** Thu muc duy nhat phat telemetry hom nay. Them mien moi thi them o day, co y thuc. */
const SCAN_ROOTS = ['apps/api/src'];

/**
 * Ten telemetry co dang `<mien>.<viec>` — `order.approve`, `outbound.send_confirmation`.
 *
 * Bo loc nay giu bang khoi phinh thanh chi muc CUA MOI chuoi trong repo: no vua lam bang nho,
 * vua tranh dua mot chuoi vo tinh giong ten buoc vao ket qua.
 */
const TELEMETRY_NAME = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/;

/** Khong quet bai kiem: chuoi trong bai kiem lam mot ten dang le duy nhat tro thanh trung. */
function isTestFile(file) {
  return /\.(spec|test)\.tsx?$/.test(file) || file.includes(`${sep}__tests__${sep}`);
}

function listSourceFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry) || isTestFile(full)) continue;
      out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

/** Duong dan repo-relative, POSIX — dang DUY NHAT duoc phep roi khoi tep nay (muc 5). */
function repoRelative(repoRoot, file) {
  return relative(repoRoot, file).split(sep).join('/');
}

/**
 * Ten ham NGHIEP VU bao quanh mot nut: `PipelineService.intakeTurn`.
 *
 * Di NGUOC len cay chu khong tra cuu bang type checker: ta chi can mot cai TEN cho nguoi doc,
 * va mot `ts.Program` day du se keo theo ca tsconfig, path mapping va vai giay moi lan chay.
 */
function enclosingFunctionName(node) {
  let method;
  let owner;
  for (let cur = node.parent; cur; cur = cur.parent) {
    if (!method) {
      if (ts.isMethodDeclaration(cur) || ts.isFunctionDeclaration(cur)) {
        method = cur.name?.getText();
      } else if (
        (ts.isPropertyDeclaration(cur) || ts.isVariableDeclaration(cur)) &&
        cur.initializer &&
        (ts.isArrowFunction(cur.initializer) || ts.isFunctionExpression(cur.initializer))
      ) {
        method = cur.name?.getText();
      } else if (ts.isConstructorDeclaration(cur)) {
        method = 'constructor';
      }
    }
    if (!owner && (ts.isClassDeclaration(cur) || ts.isClassExpression(cur))) {
      owner = cur.name?.getText();
    }
  }
  if (owner && method) return `${owner}.${method}`;
  return owner ?? method ?? undefined;
}

function siteOf(sourceFile, repoRoot, node) {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    filePath: repoRelative(repoRoot, sourceFile.fileName),
    line: line + 1,
    functionName: enclosingFunctionName(node),
  };
}

function literalText(node) {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return undefined;
}

/**
 * Chuoi nay co phai THAM SO TRUC TIEP cua mot lan goi ham khong?
 *
 * DAY LA BO LOC QUAN TRONG NHAT CUA CA TEP. Khong co no, chi muc `names` bat ca nhung cho chi
 * KHAI BAO ten chu khong PHAT ra no:
 *
 *   turn-decisions.ts   `points: ['message.intake', …]`   <- bo tu vung, khong phai noi phat
 *   telemetry.service.ts `'gen_ai.system': record.provider` <- khoa thuoc tinh OTel
 *
 * Ket qua khi khong loc: `message.intake` dem duoc 5 cho, `order.approve` dem duoc 5 cho, va
 * MOI ranh gioi dang gia nhat bi bo vi "trung". Bang van dung — nhung rong o dung nhung cho
 * nguoi ta can no nhat.
 *
 * Tham so truc tiep cua mot lan goi thi nguoc lai: do la noi ten duoc TRUYEN DI, tuc la noi
 * viec that su xay ra —
 *
 *   `this.observed('conversation.resolve', fn)`
 *   `this.operatorTurn(id, actor, 'order.approve', fn)`
 *   `telemetry.step('audit.persist', write, { action })`
 *
 * Vi tri tham so khong quan trong: `operatorTurn` dat ten o tham so thu BA.
 */
function isDirectCallArgument(node) {
  const parent = node.parent;
  return !!parent && ts.isCallExpression(parent) && parent.arguments.includes(node);
}

/** Gia tri cua mot thuoc tinh trong object literal, khi khoa la mot ten thuong. */
function propertyValue(objectLiteral, name) {
  for (const prop of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key =
      ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : undefined;
    if (key === name) return prop.initializer;
  }
  return undefined;
}

/** Ly do la mot bien (vd `channel.send`) -> khoa dai dien cho MOI ly do cua diem do. */
export const ANY_REASON = '*';

export function decisionKey(point, reason) {
  return `${point}|${reason ?? ANY_REASON}`;
}

/**
 * Quet mot lan, thu duoc HAI chi muc:
 *
 *   `names`     moi chuoi dang `<mien>.<viec>` -> cac cho no duoc viet ra
 *   `decisions` moi `decision({ point, reason })` -> cho no duoc viet ra
 *
 * Ca hai deu la DANH SACH o buoc nay. Viec ep ve "duy nhat hoac khong co" lam o buoc sau, de
 * bao cao dem duoc bao nhieu ten da bi bo vi trung.
 */
function collect(repoRoot) {
  const names = new Map();
  const decisions = new Map();

  const push = (map, key, site) => {
    const sites = map.get(key);
    if (sites) sites.push(site);
    else map.set(key, [site]);
  };

  for (const root of SCAN_ROOTS) {
    for (const file of listSourceFiles(join(repoRoot, root))) {
      const sourceFile = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.ES2022,
        /* setParentNodes */ true,
        ts.ScriptKind.TS,
      );

      const visit = (node) => {
        const text = literalText(node);
        if (text && TELEMETRY_NAME.test(text) && isDirectCallArgument(node)) {
          push(names, text, siteOf(sourceFile, repoRoot, node));
        }

        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'decision' &&
          node.arguments.length > 0 &&
          node.arguments[0] &&
          ts.isObjectLiteralExpression(node.arguments[0])
        ) {
          const arg = node.arguments[0];
          const point = literalText(propertyValue(arg, 'point'));
          if (point) {
            const reason = literalText(propertyValue(arg, 'reason'));
            push(decisions, decisionKey(point, reason), siteOf(sourceFile, repoRoot, node));
          }
        }

        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
  }

  return { names, decisions };
}

/**
 * Ep moi khoa ve DUNG NHUNG GI BANG CHUNG CHIU DUNG DUOC — khong hon.
 *
 * Ba muc, theo do dong thuan cua cac cho viet ra:
 *
 *   mot cho          -> tep + ham + DONG        (truong hop thuong gap)
 *   nhieu cho, cung tep -> tep (+ ham neu cung) -> KHONG co dong
 *   khac tep         -> khong ghi gi
 *
 * Muc giua la thu dang gia nhat cua ham nay. `order.approve` duoc viet ra NAM cho trong
 * `orders.service.ts` — mot cho la ten buoc, bon cho la ten hanh dong cho so kiem toan. Chon
 * dai mot dong trong nam dong do la bia; nhung noi "khong biet gi ca" thi cung sai, vi ca nam
 * cho deu nam trong DUNG MOT TEP va tep do la mot cau tra loi co that.
 *
 * Muc 7 cho phep dung cach nay: `function + file` voi `line = undefined` la mot ket qua hop le;
 * mot so dong bia ra thi khong.
 */
function reduceToEvidence(map) {
  const kept = {};
  const narrowed = [];
  const dropped = [];

  for (const key of [...map.keys()].sort()) {
    const sites = map.get(key);
    const first = sites[0];

    if (sites.length === 1) {
      kept[key] = {
        ...(first.functionName ? { functionName: first.functionName } : {}),
        filePath: first.filePath,
        line: first.line,
      };
      continue;
    }

    if (!sites.every((site) => site.filePath === first.filePath)) {
      dropped.push({ key, count: sites.length });
      continue;
    }

    const sameFunction = sites.every((site) => site.functionName === first.functionName);
    kept[key] = {
      ...(sameFunction && first.functionName ? { functionName: first.functionName } : {}),
      filePath: first.filePath,
    };
    narrowed.push({ key, count: sites.length, filePath: first.filePath });
  }

  return { kept, narrowed, dropped };
}

/** URL repo — nguon la `package.json` cua NEN TANG, khong phai goi khach nao (muc 23). */
function repositoryUrl(repoRoot) {
  try {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    const raw = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
    return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : undefined;
  } catch {
    return undefined;
  }
}

export function buildManifest(repoRoot) {
  const { names, decisions } = collect(repoRoot);
  const reducedNames = reduceToEvidence(names);
  const reducedDecisions = reduceToEvidence(decisions);
  const url = repositoryUrl(repoRoot);
  return {
    manifest: {
      ...(url ? { repositoryUrl: url } : {}),
      names: reducedNames.kept,
      decisions: reducedDecisions.kept,
    },
    narrowed: [...reducedNames.narrowed, ...reducedDecisions.narrowed],
    dropped: [...reducedNames.dropped, ...reducedDecisions.dropped],
  };
}

const HEADER = [
  '/**',
  ' * TEP DUOC SINH RA — dung sua tay.',
  ' *',
  ' * Sinh boi `node tools/source-manifest/generate.mjs`; `pnpm test:source-manifest` sinh lai roi',
  ' * so voi tep nay, nen mot ban sua tay se lam CI do.',
  ' *',
  ' * Moi muc o day den tu AST cua `apps/api/src`. Ten nao xuat hien o hai cho tro len bi BO —',
  ' * xem chu thich dau `tools/source-manifest/generate.mjs`.',
  ' */',
  "import type { SourceManifest } from './source-manifest.js';",
  '',
  'export const SOURCE_MANIFEST: SourceManifest = ',
].join('\n');

export function renderModule(manifest) {
  return `${HEADER}${JSON.stringify(manifest, null, 2)};\n`;
}

export const MANIFEST_MODULE_PATH = 'apps/api/src/observability/source-manifest.generated.ts';

function main() {
  const repoRoot = process.cwd();
  const { manifest, narrowed, dropped } = buildManifest(repoRoot);
  writeFileSync(join(repoRoot, MANIFEST_MODULE_PATH), renderModule(manifest), 'utf8');

  const nameCount = Object.keys(manifest.names).length;
  const decisionCount = Object.keys(manifest.decisions).length;
  console.log(
    `source-manifest: ${nameCount} ten, ${decisionCount} quyet dinh -> ${MANIFEST_MODULE_PATH}`,
  );
  for (const { key, count, filePath } of narrowed) {
    console.log(
      `  chi giu tep cho "${key}": ${count} cho viet ra trong ${filePath}, khong ro dong`,
    );
  }
  for (const { key, count } of dropped) {
    console.log(`  bo qua "${key}": ${count} cho viet ra o nhieu tep khac nhau`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('generate.mjs')) main();
