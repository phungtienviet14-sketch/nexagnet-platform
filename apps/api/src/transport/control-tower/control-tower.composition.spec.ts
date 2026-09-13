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

  /**
   * Cong MOC di cung `transport-checkpoint`, va day la cong duy nhat doi HINH DANG cua bang.
   *
   * Bon cong kia chi them muc vao hang viec, nen dang ky nham chung o `transport-core` chi lam thua
   * mot provider. Dang ky nham cong nay se lam ba cot `PICKUP`/`LOADING`/`ARRIVED` MO ra o mot
   * khach khong he ghi moc nao — tuc ba cot rong vinh vien ma khong mang mot ma ly do nao, dung
   * kieu "im lang bao rang khong co viec gi" ma ca tep nay ton tai de chan.
   */
  it('cong moc chi ton tai khi bat `transport-checkpoint`', () => {
    expect(providerTokens(['transport-core'])).not.toContain('ControlTowerCheckpointFacts');
    expect(providerTokens(['transport-core', 'transport-checkpoint'])).toContain(
      'ControlTowerCheckpointFacts',
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

  /**
   * NAM CONG RA NGOAI CHI CO HAM DOC.
   *
   * Bai giu hai chieu, va can ca hai. Danh sach CHO PHEP mot minh se yeu di moi lan co nguoi them
   * mot dong tu doc moi (`timeline` la lan gan nhat); danh sach CAM mot minh thi khong bat duoc mot
   * ten sang tao kieu `applyRunPhase`. Nen o day ca hai cung dung: dong tu phai nam trong tu dien
   * doc, VA khong duoc chua mot dong tu ghi o bat ky vi tri nao trong ten.
   */
  it('nam cong ra ngoai chi co ham doc', () => {
    const source = sourceOf('control-tower-facts.port.ts');
    const methods = [...source.matchAll(/abstract ([a-z]+)(\w*)\(/g)];
    expect(methods.length).toBeGreaterThan(0);

    /**
     * `count` la dong tu DOC thu nam, them o `#279`: `countPendingAllowances()` tra ve mot con SO,
     * khong tra ve hang — thap dieu hanh khong duoc doc so tien cua mot khoan phu cap.
     */
    const READ_VERBS = ['find', 'list', 'feed', 'timeline', 'count'];
    const WRITE_VERBS = [
      'create',
      'update',
      'set',
      'record',
      'delete',
      'remove',
      'cancel',
      'assign',
      'close',
      'reopen',
      'apply',
      'write',
      'save',
    ];

    for (const [, verb, tail] of methods) {
      const name = `${verb}${tail}`;
      /*
       * Kiem tren DONG TU DAU, khong tren ca ten. `listRunAssignments` co chua chuoi "assign" o
       * giua va van la mot ham doc — mot bai kiem chuoi con se cam no, va nguoi sua tiep theo se
       * doi ten mot ham doc cho vua mot bai kiem thay vi cho vua nguoi doc.
       */
      expect(READ_VERBS, name).toContain(verb);
      expect(WRITE_VERBS, name).not.toContain(verb);
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
