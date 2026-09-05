import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { CapabilityId } from '@netviet/tenant';
import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';
import type { SettlementReadService } from './settlement-read.service.js';
import { SettlementReportsController } from './settlement-reports.controller.js';
import { DIRECT_MARGIN_ROLLUP_MAX_TRIPS } from './settlement.schemas.js';

/**
 * `#168 B1` — `TX-05` cuoi cung cung co mot duong HTTP.
 *
 * Bai o day do BIEN GIOI (kiem tham so, ma HTTP, be mat quyen, composition), khong do lai phep tinh
 * cong no: `settlement-domain.spec.ts` va `transport-settlement.int.spec.ts` da lam viec do tu T5,
 * va nhan doi chung o day se tao ra hai cho cung khang dinh mot cong thuc.
 */

/** Mot tang doc GIA chi ghi lai minh duoc goi voi gi — du de do bien gioi. */
function fakeRead(overrides: { tripDirectMargin?: unknown; documentChain?: unknown } = {}) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const record =
    (method: string, result: unknown) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return Promise.resolve(result);
    };

  const read = {
    arAging: record('arAging', { asOf: '2026-09-01', rows: [] }),
    apByCounterparty: record('apByCounterparty', []),
    partnerPosition: record('partnerPosition', { partnerId: 'p1' }),
    tripDirectMargin: record(
      'tripDirectMargin',
      'tripDirectMargin' in overrides ? overrides.tripDirectMargin : { tripId: 't1' },
    ),
    directMarginRollup: record('directMarginRollup', { tripCount: 0 }),
    documentChain: record(
      'documentChain',
      'documentChain' in overrides ? overrides.documentChain : { original: { id: 'd1' } },
    ),
  };
  return { read, calls };
}

const controllerWith = (read: unknown) =>
  new SettlementReportsController(read as unknown as SettlementReadService);

describe('#168 B1 — bien gioi HTTP cua bao cao quyet toan', () => {
  describe('AR aging', () => {
    it('chuyen tiep `asOf` va `customerId` xuong tang doc', async () => {
      const { read, calls } = fakeRead();
      await controllerWith(read).arAging({ asOf: '2026-09-01', customerId: 'kh-1' });

      expect(calls).toEqual([{ method: 'arAging', args: ['2026-09-01', 'kh-1'] }]);
    });

    /**
     * `asOf` BAT BUOC — mot mac dinh im lang se lam hai nguoi mo cung mot man hinh cach nhau qua
     * nua dem doc ra hai bang khac nhau, va khong bang nao ghi lai minh dung moc nao.
     */
    it('thieu `asOf` la 400, khong phai mot mac dinh "hom nay"', async () => {
      const { read, calls } = fakeRead();
      expect(() => controllerWith(read).arAging({ customerId: 'kh-1' })).toThrow(
        BadRequestException,
      );
      expect(calls).toEqual([]);
    });

    it('`asOf` sai dang la 400', async () => {
      const { read } = fakeRead();
      expect(() => controllerWith(read).arAging({ asOf: '01/09/2026' })).toThrow(
        BadRequestException,
      );
    });

    it('tham so la khong nhan duoc — `.strict()` chan go sai ten', async () => {
      const { read } = fakeRead();
      expect(() => controllerWith(read).arAging({ asOf: '2026-09-01', customer: 'kh-1' })).toThrow(
        BadRequestException,
      );
    });
  });

  describe('cong no phai tra', () => {
    /**
     * `GD-15` o tang HTTP: khong co ban "tat ca cac dong". Mot bang gop ca cay xang, nha xe va doi
     * tac mang don se cho ra mot cot tong ma khong ai tra tien theo no.
     */
    it('`flow` BAT BUOC — khong co ban gop chung mot bang', async () => {
      const { read, calls } = fakeRead();
      expect(() => controllerWith(read).apByCounterparty({})).toThrow(BadRequestException);
      expect(calls).toEqual([]);
    });

    it('chi nhan dung bon dong da khai cua TX-05', async () => {
      const { read } = fakeRead();
      for (const flow of [
        'CUSTOMER_FREIGHT',
        'FUEL_SUPPLIER',
        'CARRIER_SERVICE',
        'PARTNER_COMMISSION',
      ] as const) {
        await expect(controllerWith(read).apByCounterparty({ flow })).resolves.toBeDefined();
      }
      expect(() => controllerWith(read).apByCounterparty({ flow: 'TAT_CA' })).toThrow(
        BadRequestException,
      );
    });
  });

  describe('bien truc tiep', () => {
    /**
     * `null` cua tang doc nghia la "khong co chuyen nay". Tra mot than `null` mang ma 200 se lam
     * giao dien khong phan biet duoc "chuyen khong ton tai" voi "chuyen co that nhung chua tinh
     * duoc bien".
     */
    it('chuyen khong ton tai ra 404, khong phai 200 voi than null', async () => {
      const { read } = fakeRead({ tripDirectMargin: null });
      await expect(controllerWith(read).tripDirectMargin('khong-co')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('CSV `tripIds` duoc tach, bo phan tu rong, va giu nguyen thu tu', async () => {
      const { read, calls } = fakeRead();
      await controllerWith(read).directMarginRollup({ tripIds: 'a,,b , c' });

      expect(calls).toEqual([{ method: 'directMarginRollup', args: [['a', 'b', 'c']] }]);
    });

    it('danh sach rong la 400 — mot bao cao khong co chuyen nao khong noi gi', async () => {
      const { read } = fakeRead();
      expect(() => controllerWith(read).directMarginRollup({ tripIds: ' , ' })).toThrow(
        BadRequestException,
      );
    });

    /**
     * `directMarginRollup()` doc TUNG chuyen mot roi cong o tang mien. Khong co tran thi mot URL du
     * dai bien mot route bao cao thanh mot cong tu choi dich vu.
     */
    it('vuot tran so chuyen la 400, khong phai mot vong lap khong bien', async () => {
      const { read, calls } = fakeRead();
      const tooMany = Array.from(
        { length: DIRECT_MARGIN_ROLLUP_MAX_TRIPS + 1 },
        (_, index) => `t${index}`,
      ).join(',');

      expect(() => controllerWith(read).directMarginRollup({ tripIds: tooMany })).toThrow(
        BadRequestException,
      );
      expect(calls).toEqual([]);
    });

    it('dung tran thi van qua', async () => {
      const { read } = fakeRead();
      const atLimit = Array.from(
        { length: DIRECT_MARGIN_ROLLUP_MAX_TRIPS },
        (_, index) => `t${index}`,
      ).join(',');

      await expect(
        controllerWith(read).directMarginRollup({ tripIds: atLimit }),
      ).resolves.toBeDefined();
    });
  });

  it('chuoi chung tu khong ton tai ra 404', async () => {
    const { read } = fakeRead({ documentChain: null });
    await expect(controllerWith(read).documentChain('khong-co')).rejects.toThrow(NotFoundException);
  });
});

/**
 * BE MAT CHI DOC — khong mot route GHI nao.
 *
 * `SettlementService` co day du lenh ghi tai chinh (ghi nhan cong no, dieu chinh, dao chung tu,
 * phan bo tien, dieu khoan, ky, quy tac hoa hong). Khong lenh nao trong so do da tung duoc gan
 * quyen, nen phoi chung ra o day se la tu quyet dinh AI duoc dao mot chung tu da phat.
 */
describe('#168 B1 — controller quyet toan la CHI DOC', () => {
  it('khong ten phuong thuc nao doc len nhu mot lenh ghi', () => {
    const names = Object.getOwnPropertyNames(SettlementReportsController.prototype);
    for (const name of names) {
      expect(
        /^(create|post|record|recognise|adjust|reverse|allocate|open|close|set|update|delete)/i.test(
          name,
        ),
        name,
      ).toBe(false);
    }
  });

  it('controller khong cam vao `SettlementService` — chi vao tang DOC', () => {
    // Mot cai nhin vao chinh chu ky ham dung: neu ai do tiem `SettlementService` vao de "tien tay
    // them mot route ghi", bai nay do truoc khi route do kip ra doi.
    expect(SettlementReportsController.length).toBe(1);
    const source = SettlementReportsController.toString();
    expect(source).not.toContain('SettlementService');
  });
});

/**
 * COMPOSITION — be mat quyet toan den cung `transport-settlement` va bien mat cung no.
 *
 * Cung khuon `fuel.composition.spec.ts`. Mot khach chi theo doi chuyen va gia thanh ma van thay man
 * hinh cong no se hoac nhap vao do, hoac hoi vi sao no o day — ca hai deu la chi phi cua mot ranh
 * gioi capability khong noi that.
 */
describe('#168 B1 — composition cua be mat quyet toan', () => {
  const namesFor = (capabilities: readonly CapabilityId[]): string[] => {
    const composition = buildAppComposition(capabilities);
    return [
      ...composition.controllers.map((controller) => controller.name),
      ...composition.imports.map((entry) =>
        typeof entry === 'function' ? entry.name : String((entry as { name?: string }).name ?? ''),
      ),
    ];
  };

  it('bat du chuoi van tai thi be mat quyet toan co mat', () => {
    const names = namesFor([
      'transport-core',
      'transport-costing',
      'transport-fuel',
      'transport-settlement',
    ]);
    expect(names).toContain('SettlementReportsController');
    expect(names).toContain('TransportSettlementModule');
  });

  it('KHONG bat quyet toan thi khong mot manh nao cua no duoc nap', () => {
    const names = namesFor(['transport-core', 'transport-costing', 'transport-fuel']);
    expect(names).not.toContain('SettlementReportsController');
    expect(names).not.toContain('TransportSettlementModule');
    // ...nhung cac be mat cua T2/T3/T4 van con day du.
    expect(names).toContain('TripsController');
    expect(names).toContain('FuelEntriesController');
  });

  it('mot khach BAN HANG khong nap mot manh nao cua quyet toan', () => {
    const names = namesFor(['knowledge', 'messaging', 'turn-processing', 'sales-order']);
    expect(names).not.toContain('SettlementReportsController');
  });
});
