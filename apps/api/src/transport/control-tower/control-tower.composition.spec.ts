import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';

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

describe('composition cua thap dieu hanh', () => {
  /**
   * Den cung `transport-core` — KHONG mot capability moi.
   *
   * T1 §10.1 cam tao capability cho `Reporting`, va `CAPABILITY_IDS` la enum dong trong
   * `packages/tenant`: them mot ma o do buoc phai sua goi nen tang roi build lai. Bang dieu hanh
   * khong ton tai duoc neu khong co vong chay, nen no thuoc dung capability da co.
   */
  it('co mat o khach chi bat `transport-core`', () => {
    expect(controllerNames(['transport-core'])).toContain('ControlTowerController');
  });

  it('khong co mat o khach khong dung van tai', () => {
    expect(controllerNames(['knowledge'])).not.toContain('ControlTowerController');
  });

  /**
   * BA CONG TUY CHON den va di CUNG capability so huu chung.
   *
   * Day la thu lam cho `unavailableSources` co nghia: neu adapter van duoc dang ky khi capability
   * tat thi service se khong bao gio nhan `undefined`, va bang se im lang bao rang khong co viec gi
   * — dung cai bay ma `OperationalAlertsService` da tranh.
   */
  it('cong de nghi chi chi ton tai khi bat `transport-costing`', () => {
    expect(providerTokens(['transport-core'])).not.toContain('ControlTowerClaimFacts');
    expect(providerTokens(['transport-core', 'transport-costing'])).toContain(
      'ControlTowerClaimFacts',
    );
  });

  it('cong nhien lieu chi ton tai khi bat `transport-fuel`', () => {
    expect(providerTokens(['transport-core'])).not.toContain('ControlTowerFuelFacts');
    expect(providerTokens(['transport-core', 'transport-costing', 'transport-fuel'])).toContain(
      'ControlTowerFuelFacts',
    );
  });

  it('cong canh bao chi ton tai khi bat `transport-asset-compliance`', () => {
    expect(providerTokens(['transport-core'])).not.toContain('ControlTowerAlertFacts');
    expect(providerTokens(['transport-core', 'transport-asset-compliance'])).toContain(
      'ControlTowerAlertFacts',
    );
  });

  /** Cong LOI di cung `transport-core` — khong co no thi khong co bang de ve. */
  it('cong loi luon di cung `transport-core`', () => {
    expect(providerTokens(['transport-core'])).toContain('ControlTowerCoreFacts');
  });
});

/**
 * ===========================================================================
 * BANG DIEU HANH KHONG BAO GIO GHI — giu o CA HAI tang, va ca hai deu duoc kiem.
 *
 * Cung khuon `analytics.composition.spec.ts`. O day ly do con nang hon mot bac: bang CHIEU trang
 * thai vong chay, nen mot route ghi tren bang se la mot duong doi trang thai KHONG di qua
 * `MovementService` — dung dieu #244 G3 cam.
 */
describe('be mat thap dieu hanh khong co duong ghi nao', () => {
  const sourceOf = (file: string): string =>
    readFileSync(resolve(here, file), 'utf8')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('/*'))
      .join('\n');

  it('controller chi co `@Get`', () => {
    const source = sourceOf('control-tower.controller.ts');
    for (const verb of ['@Post', '@Put', '@Patch', '@Delete']) {
      expect(source, verb).not.toContain(verb);
    }
    expect(source).toContain('@Get(');
  });

  it('bon cong ra ngoai chi co ham doc', () => {
    const source = sourceOf('control-tower-facts.port.ts');
    const methods = source.match(/abstract (\w+)\(/g) ?? [];
    expect(methods.length).toBeGreaterThan(0);
    for (const method of methods) {
      expect(method).toMatch(/abstract (find|list|feed)/);
    }
  });

  /**
   * Phep chieu KHONG duoc nhac mot ham doi trang thai nao.
   *
   * Mot bai doc ma nguon, khong phai mot bai kieu — vi he kieu khong noi duoc "tep nay khong goi
   * `setRunStatus`". Neu mot ngay co nguoi cho bang tu "keo the sang cot khac", bai nay do truoc.
   */
  it('phep chieu khong goi mot ham doi trang thai nao', () => {
    const source = sourceOf('control-tower-projection.ts');
    for (const mutation of ['setRunStatus', 'setLegStatus', 'cancelRun', 'assignRun', 'create']) {
      expect(source, mutation).not.toContain(mutation);
    }
  });
});
