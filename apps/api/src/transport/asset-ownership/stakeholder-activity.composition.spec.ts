import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';
import { actionsForRole } from '../transport-actions.js';

const here = dirname(fileURLToPath(import.meta.url));

const providerTokens = (capabilities: Parameters<typeof buildAppComposition>[0]): string[] =>
  buildAppComposition(capabilities).providers.map((provider) =>
    typeof provider === 'function'
      ? provider.name
      : typeof provider.provide === 'function'
        ? provider.provide.name
        : String(provider.provide),
  );

const codeOf = (file: string): string =>
  readFileSync(resolve(here, file), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('/*'))
    .join('\n');

describe('composition cua be mat ben huu quan — phan hoat dong', () => {
  it('dich vu di cung `transport-core`: khach toi thieu van mo duoc bang', () => {
    expect(providerTokens(['transport-core'])).toContain('StakeholderActivityService');
  });

  it('cong bao duong CHI co khi khach bat `transport-asset-compliance`', () => {
    expect(providerTokens(['transport-core'])).not.toContain('StakeholderMaintenanceFacts');
    expect(providerTokens(['transport-core', 'transport-asset-compliance'])).toContain(
      'StakeholderMaintenanceFacts',
    );
  });
});

describe('thu tu khai route — `activity` phai dung TRUOC `:vehicleId`', () => {
  /**
   * Nest doi khop theo dung thu tu khai bao. Neu `@Get('activity')` roi xuong duoi
   * `@Get(':vehicleId')`, chuoi `activity` se duoc doc nhu mot ma xe: doi chieu pham vi that bai, va
   * nguoi dung nhan `403` cho mot chiec xe khong ton tai. Do la mot loi KHONG bai don vi nao thay,
   * vi ca hai ham deu chay dung khi goi truc tiep.
   */
  it('vi tri hai route trong tep giu dung thu tu', () => {
    /*
     * Doc tren van ban DA BO CHU THICH. Chinh chu thich cua route `activity` co nhac ten
     * `@Get(':vehicleId')` de giai thich vi sao thu tu quan trong — doc tren van ban tho thi
     * `indexOf` bat trung lan nhac do va bai bao dong sai.
     */
    const source = codeOf('./stakeholder-vehicles.controller.ts');
    const activityAt = source.indexOf("@Get('activity')");
    const byIdAt = source.indexOf("@Get(':vehicleId')");

    expect(activityAt).toBeGreaterThan(-1);
    expect(byIdAt).toBeGreaterThan(-1);
    expect(activityAt).toBeLessThan(byIdAt);
  });
});

describe('khong mot quyen moi nao duoc de ra o day', () => {
  it('duong hoat dong dung DUNG ma quyen ma hai duong cu da dung', () => {
    const source = codeOf('./stakeholder-vehicles.controller.ts');
    const codes = [...source.matchAll(/@RequiresTransportAction\('([^']+)'\)/g)].map(
      (match) => match[1],
    );

    // Ba route, MOT ma quyen. `#278` N9 gioi han o "already authorized fields".
    expect(new Set(codes)).toEqual(new Set(['transport.stakeholder.self.vehicle.read']));
    expect(codes).toHaveLength(3);
  });

  it('ke toan KHONG duoc cap be mat ben huu quan qua duong nay', () => {
    // Ma quyen nay thuoc ve pham vi CUA CHINH nguoi so huu, khong phai mot quyen doc van hanh.
    expect(actionsForRole('ACCOUNTING')).not.toContain('transport.stakeholder.self.vehicle.read');
  });
});

describe('khong mot truong tien nao trong kieu du lieu cua be mat nay', () => {
  it('`StakeholderVehicleActivity` khong khai mot truong tien nao', () => {
    /*
     * Doc THANG tren van ban nguon. Mot bai chay tren du lieu chi kiem duoc nhung dong no tu dung
     * ra; bai nay kiem chinh LOI KHAI, nen mot truong tien them vao se bi bat ngay ca khi chua co
     * ai dien du lieu vao no.
     */
    const source = codeOf('./stakeholder-activity.ts');
    const activityType = source.slice(
      source.indexOf('export interface StakeholderVehicleActivity'),
      source.indexOf('export interface StakeholderActivityView'),
    );

    expect(activityType).not.toMatch(/amount|price|cost|revenue|payable|receivable|salary/i);
  });

  it('ket qua duoc CHEP TUNG TRUONG, khong phai trai tu ket qua cua bang doi xe', () => {
    // Mot phep trai (`...vehicle`) se lam moi truong tuong lai cua `VehicleInsight` tu chay sang
    // man hinh co dong. Bai nay chan dung cai cu phap do.
    const source = codeOf('./stakeholder-activity.ts');
    expect(source).not.toMatch(/\.\.\.vehicle\b/);
  });
});
