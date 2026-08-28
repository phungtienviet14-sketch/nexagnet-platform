import { readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * PRELOAD PHAI VAO TRUOC — VA "TRUOC" LA MOT TINH CHAT CO THE MAT DI TRONG IM LANG.
 *
 * ---------------------------------------------------------------------------
 * VI SAO BAI NAY TON TAI (28/08/2026):
 *
 * `otel-preload.ts` duoc nap bang `node --import`, tuc truoc cau lenh dau tien cua `main.ts`.
 * Ly do la `instrumentation-http` lam viec bang cach VA LAI `node:http`: trong ESM moi cau
 * `import` cua mot file duoc danh gia TRUOC than file do, nen chi can preload keo theo mot module
 * nao do da cham vao `node:http`/Prisma la instrumentation vao MUON — va vao muon nghia la khong
 * vao duoc. Trieu chung khong phai mot loi: chi la span rong.
 *
 * Chu thich dau `otel-preload.ts` da noi dieu nay. Chu thich khong chan duoc ai ca. Ngay
 * 28/08/2026, khi noi `otel-config.ts` vao loi giai release identity dung chung, luc chon giua
 * "import `release-identity.ts` cho gon" va "tach mot module la chi phu thuoc `node:fs`", chinh
 * chu thich do la thu duy nhat can lai — va `release-identity.ts` import `@netviet/tenant`.
 *
 * Nen bai nay bien rang buoc do thanh mau do. No di bo do thi import TINH tu preload va khang
 * dinh khong duong nao cham vao do thi nghiep vu.
 *
 * `import type` KHONG duoc tinh: TypeScript xoa han cau lenh do luc bien dich, nen no khong ton
 * tai luc chay. Do cung la ly do `release-sha.ts` duoc phep dung KIEU tu `trace-context.ts`.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../..');
const ENTRY = resolve(HERE, 'otel-preload.ts');

/**
 * Nhung thu keo do thi nghiep vu vao. Danh sach nay la HOP DONG, khong phai mot bo loc de doan:
 * moi muc o day tung la — hoac gan la — mot duong that.
 */
const FORBIDDEN_PACKAGES = [
  '@netviet/tenant', // keo goi khach + zod + fs cua tenant
  '@netviet/shared',
  '@nestjs/common',
  '@nestjs/core',
  '@nestjs/platform-express', // cham `node:http` -> instrumentation vao muon
  '@prisma/client', // PrismaClient khoi tao truoc instrumentation
] as const;

/** Thu muc nghiep vu — preload khong duoc biet gi ve chung. */
const FORBIDDEN_DIRS = [
  'pipeline',
  'orders',
  'turns',
  'channels',
  'ingest',
  'knowledge',
  'workflow',
  'debug',
  'auth',
  'erp',
] as const;

/** Chi lay import GIA TRI. `import type ...` bi xoa luc bien dich nen khong tinh. */
function valueImports(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /^\s*(?:import|export)\s+([\s\S]*?)from\s*['"]([^'"]+)['"]/gm;
  for (const match of source.matchAll(pattern)) {
    const clause = match[1] ?? '';
    const specifier = match[2] ?? '';
    if (/^\s*type\s/.test(clause)) continue; // `import type { X } from ...`
    specifiers.push(specifier);
  }
  // `import './x.js';` — khong co `from`.
  for (const match of source.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) {
    specifiers.push(match[1] ?? '');
  }
  return specifiers;
}

/** Windows tra ve `a`; hop dong duoi day viet bang `/`. Dung `sep` de khong phai thoat ky tu. */
function toPosix(path: string): string {
  return path.split(sep).join('/');
}

interface Reached {
  readonly files: readonly string[];
  readonly packages: readonly string[];
}

/** Di bo do thi import tinh tu `entry`, chi theo cac duong dan tuong doi. */
function walk(entry: string): Reached {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (files.has(file)) continue;
    files.add(file);

    let source: string;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      continue; // tep khong doc duoc thi khong the keo them gi
    }

    for (const specifier of valueImports(source)) {
      if (specifier.startsWith('node:')) continue;
      if (!specifier.startsWith('.')) {
        packages.add(specifier);
        continue;
      }
      // Nguon viet duoi dang ESM da bien dich (`./x.js`), tren dia la `./x.ts`.
      queue.push(resolve(dirname(file), specifier.replace(/\.js$/, '.ts')));
    }
  }

  return { files: [...files], packages: [...packages] };
}

describe('preload OTel khong duoc keo do thi module nghiep vu', () => {
  const reached = walk(ENTRY);

  it('khong cham goi nao thuoc danh sach cam', () => {
    const violations = reached.packages.filter((pkg) =>
      FORBIDDEN_PACKAGES.some((banned) => pkg === banned || pkg.startsWith(`${banned}/`)),
    );

    expect(violations).toEqual([]);
  });

  it('khong cham thu muc nghiep vu nao trong `apps/api/src`', () => {
    const violations = reached.files
      .map((file) => toPosix(relative(SRC, file)))
      .filter((path) => FORBIDDEN_DIRS.some((dir) => path.startsWith(`${dir}/`)));

    expect(violations).toEqual([]);
  });

  it('van doc toi duoc loi giai release dung chung — bai tren khong xanh vi di bo hong', () => {
    // Neu bo di bo im lang tra ve mot tap rong thi hai bai tren xanh ma khong chung minh gi.
    const paths = reached.files.map((file) => toPosix(relative(SRC, file)));

    expect(paths).toContain('observability/release-sha.ts');
    expect(paths).toContain('observability/otel/otel-runtime.ts');
  });
});
