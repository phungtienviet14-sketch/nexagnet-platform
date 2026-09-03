import { loadTenantConfig } from '@netviet/tenant';
import type { PayrollPolicySnapshot } from './workforce.types.js';

/**
 * Chinh sach cua `transport-workforce` — tham so luong (VT-060).
 *
 * MAC DINH LA `0`, VA DO LA CAU TRA LOI TRUNG THUC. Khac `transport-fuel` (o do `GD-08` da ghi ten
 * mot con so cu the nen mac dinh khong rong), o day nguon khach chi cho CAU TRUC: VT-060 mo ta
 * "luong co ban + khoan theo chuyen/km + thuong tiet kiem dau", con muc luong that nam trong danh
 * sach DU LIEU CON THIEU cua T0 ("Quy che luong lai xe hien hanh").
 *
 * Bia mot muc luong mac dinh se lam mot con so DO CHUNG TA NGHI RA hien len phieu luong cua mot
 * nguoi that, va khong ai doc phieu do biet no khong phai cua khach. `0` thi khong nham lan duoc:
 * phieu ra `0` dong la mot cau hoi ai cung se hoi ngay.
 *
 * `GD-12`: KHONG co tham so nao cho khau tru tu dong. Mot o cau hinh de san se la loi moi bat no
 * len ma khong ai doc lai C-02.
 */

export const TRANSPORT_PAYROLL_POLICY = Symbol('TRANSPORT_PAYROLL_POLICY');

export function tenantTransportPayrollPolicy(): PayrollPolicySnapshot {
  const configured = loadTenantConfig().policies.transportPayroll;
  return {
    baseSalaryVnd: configured?.baseSalaryVnd ?? 0,
    perTripVnd: configured?.perTripVnd ?? 0,
    perKmVnd: configured?.perKmVnd ?? 0,
    fuelSavingBonusVndPerLiter: configured?.fuelSavingBonusVndPerLiter ?? 0,
  };
}
