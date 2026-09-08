import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';
import { actionsForRole } from '../transport-actions.js';

const here = dirname(fileURLToPath(import.meta.url));

const controllerNames = (capabilities: Parameters<typeof buildAppComposition>[0]): string[] =>
  buildAppComposition(capabilities).controllers.map((controller) => controller.name);

const providerTokens = (capabilities: Parameters<typeof buildAppComposition>[0]): string[] =>
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

describe('composition cua bao cao ban do vong chay', () => {
  it('co mat o khach chi bat `transport-core` — bao cao khong ban do van la mot bao cao', () => {
    expect(controllerNames(['transport-core'])).toContain('JourneyController');
    expect(providerTokens(['transport-core'])).toContain('JourneyCoreFacts');
  });

  it('khong co mat o khach khong dung van tai', () => {
    expect(controllerNames(['knowledge'])).not.toContain('JourneyController');
  });

  it('cong moc chi ton tai khi bat `transport-checkpoint`', () => {
    expect(providerTokens(['transport-core'])).not.toContain('JourneyCheckpointFacts');
    expect(providerTokens(['transport-core', 'transport-checkpoint'])).toContain(
      'JourneyCheckpointFacts',
    );
  });

  it('cong toa do chi ton tai khi bat `transport-proof`', () => {
    expect(providerTokens(['transport-core'])).not.toContain('JourneyLocationFacts');
    expect(providerTokens(['transport-core', 'transport-proof'])).toContain('JourneyLocationFacts');
  });

  it('cong nhien lieu chi ton tai khi bat `transport-fuel`', () => {
    expect(providerTokens(['transport-core'])).not.toContain('JourneyFuelFacts');
    expect(providerTokens(['transport-core', 'transport-costing', 'transport-fuel'])).toContain(
      'JourneyFuelFacts',
    );
  });
});

/**
 * ===========================================================================
 * TOA DO KHONG DUOC DI THEO MA QUYEN CUA BAO CAO.
 *
 * Day la bai quan trong nhat cua tep. `transport.location.history.read` nam trong
 * `ACCOUNTING_DENIED`, tuc ma tran vai DA tu choi ke toan quyen xem lich su vi tri. Mot tranche ban
 * do rat de vo tinh cap lai quyen do: chi can dat toa do vao cung mot khung nhin voi bao cao va
 * gan ca hai duoi `transport.run.read`.
 *
 * Lan cap quyen do se KHONG lam do mot bai kiem nao cua auth, vi khong dong nao trong
 * `transport-actions.ts` bi sua. Nen no phai duoc bat o day.
 */
describe('be mat bao cao — toa do di sau MOT ma quyen KHAC', () => {
  it('tuyen ban do doi `transport.location.history.read`, bao cao doi `transport.run.read`', () => {
    const source = sourceOf('journey.controller.ts');

    expect(source).toContain("@RequiresTransportAction('transport.run.read')");
    expect(source).toContain("@RequiresTransportAction('transport.location.history.read')");
  });

  /*
   * Kiem qua `actionsForRole` chu khong qua danh sach `ACCOUNTING_DENIED` (von la `const` noi bo):
   * cai rang buoc that la KET QUA — ke toan goi tuyen ban do thi 403 — chu khong phai mot dong nam
   * trong mot mang nao do. Doc ket qua thi mot lan doi cach dung danh sach van bi bat.
   */
  it('ke toan KHONG doc duoc ban do, nhung VAN doc duoc bao cao', () => {
    const accounting = actionsForRole('ACCOUNTING');

    expect(accounting).not.toContain('transport.location.history.read');
    expect(accounting).toContain('transport.run.read');
  });

  it('quan tri doc duoc CA HAI — nguoi truc phai nhin duoc ban do', () => {
    const admin = actionsForRole('ADMIN');

    expect(admin).toContain('transport.run.read');
    expect(admin).toContain('transport.location.history.read');
  });

  it('lai xe khong doc duoc ca hai — bao cao mang km va ma don cua ca doi xe', () => {
    const driver = actionsForRole('SALE');

    expect(driver).not.toContain('transport.run.read');
    expect(driver).not.toContain('transport.location.history.read');
  });

  /**
   * KHUNG NHIN BAO CAO KHONG DUOC MANG MOT TOA DO NAO.
   *
   * Mot bai doc ma nguon, khong phai mot bai kieu: he kieu khong noi duoc "kieu nay khong duoc co
   * truong toa do". Neu mot ngay co nguoi them `origin` vao `JourneyLegView` cho tien, bai nay do
   * truoc khi ma do ra khoi may.
   */
  it('`JourneyLegView` khong co mot truong toa do nao', () => {
    const source = sourceOf('journey.types.ts');
    const start = source.indexOf('export interface JourneyLegView');
    const end = source.indexOf('\n}', start);
    const body = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    for (const field of ['origin:', 'destination:', 'paths', 'point', 'latitude', 'longitude']) {
      expect(body, field).not.toContain(field);
    }
  });
});

describe('be mat bao cao khong co duong ghi nao', () => {
  it('controller chi co `@Get`', () => {
    const source = sourceOf('journey.controller.ts');
    for (const verb of ['@Post', '@Put', '@Patch', '@Delete']) {
      expect(source, verb).not.toContain(verb);
    }
    expect(source).toContain('@Get(');
  });

  it('bon cong ra ngoai chi co ham doc', () => {
    const source = sourceOf('journey-facts.port.ts');
    const methods = [...source.matchAll(/abstract ([a-z]+)(\w*)\(/g)];
    expect(methods.length).toBeGreaterThan(0);

    const READ_VERBS = ['find', 'list', 'timeline'];
    for (const [, verb, tail] of methods) {
      expect(READ_VERBS, `${verb}${tail}`).toContain(verb);
    }
  });

  it('hinh hoc khong goi mot ham doi trang thai nao', () => {
    const source = sourceOf('journey-geometry.ts');
    for (const mutation of ['setRunStatus', 'setLegStatus', 'cancelRun', 'assignRun', 'create']) {
      expect(source, mutation).not.toContain(mutation);
    }
  });
});
