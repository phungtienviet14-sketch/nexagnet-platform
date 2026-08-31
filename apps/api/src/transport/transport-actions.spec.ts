import { describe, expect, it } from 'vitest';
import { USER_ROLES } from '../auth/auth.types.js';
import {
  TRANSPORT_ACTIONS,
  actionsForRole,
  roleCanPerform,
  type TransportAction,
} from './transport-actions.js';

/**
 * Hanh dong cua mien van tai — T1 §11.1, cau bridge demo `GD-22`.
 *
 * Vi sao khai hang so NGAY o T2 du nen tang chua co mo hinh permission (`PG-02`): T1 ghi ro chi
 * phi dao nguoc cua `GD-22` la "trung binh — nhung CHI NEU action duoc khai tu dau. Neu khong,
 * rat cao". Rai `if (role === 'ADMIN')` khap ma mien co nghia la luc auth foundation co permission
 * that, phai di tim tung dong mot trong ca mien de doi.
 */
describe('Hanh dong mien van tai + cau bridge vai tro (GD-22)', () => {
  it('bo hanh dong phu du cac nhom nghiep vu cua T2, T3 va T4', () => {
    expect([...TRANSPORT_ACTIONS]).toEqual([
      'transport.vehicle.read',
      'transport.vehicle.manage',
      'transport.driver.read',
      'transport.driver.manage',
      'transport.customer.read',
      'transport.customer.manage',
      'transport.partner.read',
      'transport.partner.manage',
      'transport.trip.read',
      'transport.trip.create',
      'transport.trip.update',
      'transport.trip.assign',
      'transport.trip.transition',
      'transport.trip.cancel',
      'transport.costing.expense.read',
      'transport.costing.expense.record',
      'transport.costing.driver_fund.read',
      'transport.costing.driver_fund.advance',
      'transport.costing.driver_fund.return',
      'transport.costing.driver_fund.adjust',
      'transport.costing.reversal.post',
      'transport.costing.period.read',
      'transport.costing.period.manage',
      'transport.costing.period.reopen',
      'transport.fuel.entry.read',
      'transport.fuel.entry.submit_for_driver',
      'transport.fuel.entry.verify',
      'transport.fuel.statement.import',
      'transport.fuel.reconciliation.read',
      'transport.fuel.reconciliation.match',
      'transport.fuel.reconciliation.resolve',
      'transport.fuel.reconciliation.close',
      'transport.fuel.reconciliation.reopen',
      'transport.driver.self.trip.read',
      'transport.driver.self.trip.update',
      'transport.driver.self.fund.read',
      'transport.driver.self.fuel.read',
      'transport.driver.self.fuel.submit',
    ]);
  });

  it('khong co ma nao trung nhau', () => {
    expect(new Set(TRANSPORT_ACTIONS).size).toBe(TRANSPORT_ACTIONS.length);
  });

  describe('ADMIN — vai Giam doc (VT-081, VT-084)', () => {
    it('lam duoc moi viec van hanh, KE CA huy chuyen', () => {
      for (const action of TRANSPORT_ACTIONS) {
        if (action.startsWith('transport.driver.self.')) continue;
        expect(roleCanPerform('ADMIN', action), action).toBe(true);
      }
      expect(roleCanPerform('ADMIN', 'transport.trip.cancel')).toBe(true);
    });
  });

  describe('ACCOUNTING — vai Ke toan (VT-082)', () => {
    it('nhap va sua duoc du lieu van hanh', () => {
      expect(roleCanPerform('ACCOUNTING', 'transport.trip.create')).toBe(true);
      expect(roleCanPerform('ACCOUNTING', 'transport.trip.assign')).toBe(true);
      expect(roleCanPerform('ACCOUNTING', 'transport.trip.transition')).toBe(true);
      expect(roleCanPerform('ACCOUNTING', 'transport.vehicle.manage')).toBe(true);
    });

    it('KHONG huy duoc chuyen — nguon noi ro "khong xoa du lieu"', () => {
      expect(roleCanPerform('ACCOUNTING', 'transport.trip.cancel')).toBe(false);
    });

    /**
     * T3: Ke toan CO quyen ung tien va dong ky — Issue #85 ghi ro "Director and Accountant can
     * create advances", va dong ky cuoi thang la viec cua chinh ho.
     *
     * Nhung MO LAI mot ky da dong thi khong: `GD-11` doi mot quyen RIENG cho viec do, vi ky da dong
     * la ky da bao cao ra ngoai. Hai dong duoi day la cho DUY NHAT trong ma the hien su khac biet
     * giua "dong so" va "viet lai so da chot".
     */
    it('ung tien va dong ky duoc, nhung KHONG mo lai ky da dong (GD-11)', () => {
      expect(roleCanPerform('ACCOUNTING', 'transport.costing.driver_fund.advance')).toBe(true);
      expect(roleCanPerform('ACCOUNTING', 'transport.costing.expense.record')).toBe(true);
      expect(roleCanPerform('ACCOUNTING', 'transport.costing.reversal.post')).toBe(true);
      expect(roleCanPerform('ACCOUNTING', 'transport.costing.period.manage')).toBe(true);

      expect(roleCanPerform('ACCOUNTING', 'transport.costing.period.reopen')).toBe(false);
      expect(roleCanPerform('ADMIN', 'transport.costing.period.reopen')).toBe(true);
    });

    /**
     * T4 lap lai DUNG khuon do cho ky doi soat bang ke — va do la diem cua bai test nay.
     *
     * Ke toan nhap bang ke, chay so khop, quyet chenh lech va DONG ky: bon viec cuoi thang cua ho.
     * Nhung mot ky da dong da PHAT BAN GIAO CONG NO ra ngoai (`FuelSettlementHandoff`), nen mo lai
     * no la mot quyet dinh khac han ve muc do — `GD-11` doi mot quyen rieng, giong het T3.
     */
    it('doi soat bang ke: dong duoc ky, nhung KHONG mo lai ky da dong (GD-11)', () => {
      expect(roleCanPerform('ACCOUNTING', 'transport.fuel.statement.import')).toBe(true);
      expect(roleCanPerform('ACCOUNTING', 'transport.fuel.reconciliation.match')).toBe(true);
      expect(roleCanPerform('ACCOUNTING', 'transport.fuel.reconciliation.resolve')).toBe(true);
      expect(roleCanPerform('ACCOUNTING', 'transport.fuel.reconciliation.close')).toBe(true);
      expect(roleCanPerform('ACCOUNTING', 'transport.fuel.entry.verify')).toBe(true);

      expect(roleCanPerform('ACCOUNTING', 'transport.fuel.reconciliation.reopen')).toBe(false);
      expect(roleCanPerform('ADMIN', 'transport.fuel.reconciliation.reopen')).toBe(true);
    });

    it('la tap con cua Giam doc, khong phai mot nhanh loai tru', () => {
      for (const action of actionsForRole('ACCOUNTING')) {
        expect(roleCanPerform('ADMIN', action), action).toBe(true);
      }
    });
  });

  describe('SALE — CHO GIU TAM cho vai Lai xe (GD-22)', () => {
    it('CHI co hanh dong tren pham vi cua chinh minh', () => {
      expect([...actionsForRole('SALE')]).toEqual([
        'transport.driver.self.trip.read',
        'transport.driver.self.trip.update',
        'transport.driver.self.fund.read',
        'transport.driver.self.fuel.read',
        'transport.driver.self.fuel.submit',
      ]);
    });

    it('KHONG doc duoc danh sach chuyen chung — day la cho ro ri de nhat', () => {
      expect(roleCanPerform('SALE', 'transport.trip.read')).toBe(false);
      expect(roleCanPerform('SALE', 'transport.trip.create')).toBe(false);
      expect(roleCanPerform('SALE', 'transport.vehicle.read')).toBe(false);
    });

    /**
     * T3 mo them mot be mat cho lai xe — va do la cho ro ri de nhat TIEP THEO.
     *
     * Lai xe DOC duoc so quy cua chinh minh, nhung khong doc duoc so quy nguoi khac (cong that nam o
     * `Driver.authUserId`, khong o vai), va khong GHI duoc mot dong nao: ai chi bao nhieu la mot su
     * that ke toan, khong phai mot lua chon cua nguoi tieu tien.
     */
    it('doc duoc so quy cua chinh minh, nhung khong ghi va khong doc so quy chung', () => {
      expect(roleCanPerform('SALE', 'transport.driver.self.fund.read')).toBe(true);
      expect(roleCanPerform('SALE', 'transport.costing.driver_fund.read')).toBe(false);
      expect(roleCanPerform('SALE', 'transport.costing.driver_fund.advance')).toBe(false);
      expect(roleCanPerform('SALE', 'transport.costing.expense.record')).toBe(false);
      expect(roleCanPerform('SALE', 'transport.costing.expense.read')).toBe(false);
    });

    /**
     * T4 mo be mat thu ba cho lai xe: NOP PHIEU DO DAU. Day la lan dau mot lai xe duoc GHI mot thu
     * co gia tri tien te — nen ranh gioi phai chat hon hai lan truoc.
     *
     * Ho nop duoc phieu CUA CHINH MINH, nhung khong duyet duoc phieu nao (ke ca cua chinh ho: mot
     * nguoi tu duyet chung tu cua minh la mot cong khong ton tai), khong doc duoc danh sach phieu
     * chung, va khong cham duoc mot buoc nao cua doi soat bang ke.
     */
    it('nop duoc phieu dau cua chinh minh, nhung khong duyet va khong doi soat', () => {
      expect(roleCanPerform('SALE', 'transport.driver.self.fuel.submit')).toBe(true);
      expect(roleCanPerform('SALE', 'transport.driver.self.fuel.read')).toBe(true);

      expect(roleCanPerform('SALE', 'transport.fuel.entry.verify')).toBe(false);
      expect(roleCanPerform('SALE', 'transport.fuel.entry.read')).toBe(false);
      expect(roleCanPerform('SALE', 'transport.fuel.entry.submit_for_driver')).toBe(false);
      expect(roleCanPerform('SALE', 'transport.fuel.statement.import')).toBe(false);
      expect(roleCanPerform('SALE', 'transport.fuel.reconciliation.read')).toBe(false);
      expect(roleCanPerform('SALE', 'transport.fuel.reconciliation.close')).toBe(false);
    });
  });

  describe('MANAGER — khong nam trong cau bridge, nen DONG', () => {
    it('khong co hanh dong van tai nao', () => {
      expect([...actionsForRole('MANAGER')]).toEqual([]);
      for (const action of TRANSPORT_ACTIONS) {
        expect(roleCanPerform('MANAGER', action), action).toBe(false);
      }
    });
  });

  it('moi vai co that cua nen tang deu duoc tra loi tuong minh, khong nem', () => {
    for (const role of USER_ROLES) {
      expect(Array.isArray(actionsForRole(role)), role).toBe(true);
    }
  });

  it('khong vai nao duoc cap mot hanh dong ngoai bo hanh dong', () => {
    const known = new Set<TransportAction>(TRANSPORT_ACTIONS);
    for (const role of USER_ROLES) {
      for (const action of actionsForRole(role)) expect(known.has(action), action).toBe(true);
    }
  });
});
