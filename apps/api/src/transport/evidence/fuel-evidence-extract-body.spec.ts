import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Body, Param, Post } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { FuelEvidenceController } from './fuel-evidence.controller.js';

/**
 * `#317` — ANH CHUNG TU LON KHONG DI QUA THAN JSON, va gioi han JSON TOAN CUC KHONG bi nang.
 *
 * Man hinh soat chung tu (`#313`) tung tai byte anh ve roi gui lai duoi dang base64 trong than JSON,
 * va vuong tran mac dinh cua Express (100 kb): anh chup that tu dien thoai ra `413`. Chu so huu chot:
 * KHONG nang gioi han JSON toan cuc — mot tran lon cho MOI route la mot be mat tu choi dich vu cho
 * MOI route, chi de phuc vu mot man hinh.
 *
 * `#317` noi man hinh vao route may chu `POST .../evidence/:evidenceId/extract` (`#308`): may chu tu
 * doc byte tu kho, KHONG co than yeu cau nao de vuong tran. Hai bai duoi day giu hai tinh chat do:
 *
 *   1. route extract KHONG nhan `@Body()` — neu mot ngay no nhan lai byte/base64, bai do;
 *   2. khong tep nguon nao cua API cau hinh lai body parser (nang `limit`, `useBodyParser`, ...).
 *
 * Moi bai co DOI CHUNG AM: phep do phai bat duoc dung hanh vi no cam, neu khong thi "xanh" khong noi
 * len dieu gi.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const API_SRC = resolve(HERE, '../..');

/** Khoa metadata ma Nest ghi cho tham so route (`@Body`, `@Param`, `@Req`, ...). */
const ROUTE_ARGS = '__routeArguments__';

/** `"<loai>:<vi tri>"` -> tap `<loai>` cua mot phuong thuc route. */
const paramTypesOf = (controller: abstract new (...args: never[]) => unknown, method: string) => {
  const metadata = (Reflect.getMetadata(ROUTE_ARGS, controller, method) ?? {}) as Record<
    string,
    unknown
  >;
  return new Set(Object.keys(metadata).map((key) => key.split(':')[0]));
};

/** Doi chung am: mot route extract CO than yeu cau — dung hinh dang ma bai that cam. */
class ExtractWithBody {
  @Post(':evidenceId/extract')
  extract(@Param('evidenceId') evidenceId: string, @Body() body: unknown): unknown {
    return { evidenceId, body };
  }
}

class ParamOnly {
  @Post(':evidenceId')
  read(@Param('evidenceId') evidenceId: string): string {
    return evidenceId;
  }
}

/** Loai tham so cua `@Body()`, do tu doi chung chu khong go tay mot so enum cua Nest. */
const bodyParamType = (): string => {
  const withBody = paramTypesOf(ExtractWithBody, 'extract');
  const withoutBody = paramTypesOf(ParamOnly, 'read');
  const onlyInBody = [...withBody].filter((type) => !withoutBody.has(type));
  expect(onlyInBody).toHaveLength(1);
  return onlyInBody[0] as string;
};

describe('#317 — route doc anh da luu khong co than yeu cau', () => {
  it('doi chung am: phep do thay duoc `@Body()` tren mot route co than', () => {
    const body = bodyParamType();
    expect(paramTypesOf(ExtractWithBody, 'extract').has(body)).toBe(true);
  });

  it('`extract` chi nhan request + hai id tren duong dan — KHONG co `@Body()`', () => {
    const body = bodyParamType();
    const types = paramTypesOf(FuelEvidenceController, 'extract');

    // NEO: metadata doc duoc that (ba tham so), khong phai mot tap rong xanh gia.
    expect(types.size).toBeGreaterThan(0);
    expect(types.has(body)).toBe(false);
  });
});

/** Cac cach mot tep nguon co the nang/doi body parser toan cuc cua Nest/Express. */
const BODY_LIMIT_PATTERNS: readonly RegExp[] = [
  /\buseBodyParser\s*\(/,
  /\bbodyParser\s*:/,
  /from\s+['"]body-parser['"]/,
  /\bexpress\.json\s*\(/,
  /\bjson\s*\(\s*\{[^}]*\blimit\b/,
];

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [path] : [];
  });

describe('#317 — gioi han than JSON toan cuc cua API khong bi nang', () => {
  it('doi chung am: moi mau bat duoc dung mot cach nang gioi han that', () => {
    const offenders = [
      "app.useBodyParser('json', { limit: '20mb' });",
      'await NestFactory.create(AppModule, { bodyParser: false });',
      "import { json } from 'body-parser';",
      "app.use(express.json({ limit: '20mb' }));",
      "app.use(json({ limit: '20mb' }));",
    ];
    BODY_LIMIT_PATTERNS.forEach((pattern, index) => {
      expect(pattern.test(offenders[index] as string), String(pattern)).toBe(true);
    });
  });

  // Quet ca `src/` doc hang nghin tep: tran thoi gian rong de pre-push luc may tai khong do gia.
  it('khong tep nguon nao cua API cau hinh lai body parser', { timeout: 60_000 }, () => {
    const files = sourceFiles(API_SRC);
    // NEO: phep quet that su doc toi diem khoi dong cua API.
    expect(files.some((path) => path.endsWith(join('src', 'main.ts')))).toBe(true);

    const hits = files.flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      return BODY_LIMIT_PATTERNS.filter((pattern) => pattern.test(source)).map(
        (pattern) => `${path.slice(API_SRC.length)} ~ ${String(pattern)}`,
      );
    });
    expect(hits).toEqual([]);
  });
});
