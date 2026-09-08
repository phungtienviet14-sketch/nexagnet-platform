import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';
import { actionsForRole } from '../transport-actions.js';

const here = dirname(fileURLToPath(import.meta.url));

const names = (capabilities: Parameters<typeof buildAppComposition>[0]): string[] =>
  buildAppComposition(capabilities).controllers.map((controller) => controller.name);

const tokens = (capabilities: Parameters<typeof buildAppComposition>[0]): string[] =>
  buildAppComposition(capabilities).providers.map((provider) =>
    typeof provider === 'function'
      ? provider.name
      : typeof provider.provide === 'function'
        ? provider.provide.name
        : String(provider.provide),
  );

const sourceOf = (file: string): string =>
  readFileSync(resolve(here, file), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('/*'))
    .join('\n');

describe('composition cua bang doi xe + bao cao tuyen', () => {
  it('di cung `transport-core` — khong mot capability moi nao', () => {
    expect(names(['transport-core'])).toContain('InsightController');
    expect(tokens(['transport-core'])).toContain('InsightCoreFacts');
  });

  it('khong co mat o khach khong dung van tai', () => {
    expect(names(['knowledge'])).not.toContain('InsightController');
  });
});

describe('be mat bao cao khong co duong ghi nao', () => {
  it('controller chi co `@Get`', () => {
    const source = sourceOf('insight.controller.ts');
    for (const verb of ['@Post', '@Put', '@Patch', '@Delete']) {
      expect(source, verb).not.toContain(verb);
    }
    expect(source).toContain('@Get(');
  });

  it('cong ra ngoai chi co ham doc', () => {
    const source = sourceOf('insight-facts.port.ts');
    const methods = [...source.matchAll(/abstract ([a-z]+)(\w*)\(/g)];
    expect(methods.length).toBeGreaterThan(0);
    for (const [, verb, tail] of methods) {
      expect(['list', 'find'], `${verb}${tail}`).toContain(verb);
    }
  });

  it('phep gop khong goi mot ham doi trang thai nao', () => {
    const source = sourceOf('insight-metrics.ts');
    for (const mutation of ['setRunStatus', 'setLegStatus', 'cancelRun', 'assignRun', 'create']) {
      expect(source, mutation).not.toContain(mutation);
    }
  });
});

/**
 * KHONG MA QUYEN MOI, va khong toa do.
 *
 * Hai bao cao nay tra ve km + ma don cua CA doi xe, dung loai du lieu ma `transport.analytics.read`
 * da canh giu. Neu mot ngay co nguoi doi chung sang mot ma rong hon — hay tra them toa do — thi
 * bai nay do truoc khi ma do roi khoi may.
 */
describe('quyen — dung lai ma da co, va khong mo them gi', () => {
  it('ca hai tuyen deu doi `transport.analytics.read`', () => {
    const source = sourceOf('insight.controller.ts');
    const actions = [...source.matchAll(/@RequiresTransportAction\('([^']+)'\)/g)].map(
      ([, action]) => action,
    );

    expect(actions).toHaveLength(2);
    expect(new Set(actions)).toEqual(new Set(['transport.analytics.read']));
  });

  it('lai xe khong doc duoc — bao cao mang km va ma don cua ca doi xe', () => {
    expect(actionsForRole('SALE')).not.toContain('transport.analytics.read');
  });

  it('khong tra ve mot toa do nao — do la viec cua tuyen ban do, sau mot ma quyen khac', () => {
    const source = sourceOf('insight.types.ts');
    for (const field of ['latitude', 'longitude', 'GeoPoint', 'observationId']) {
      expect(source, field).not.toContain(field);
    }
  });
});
