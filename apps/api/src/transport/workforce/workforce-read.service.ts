import { Injectable } from '@nestjs/common';
import { TransportDomainError } from '../transport.errors.js';
import { WorkforceRepository } from './workforce.repository.js';
import type { PayrollPeriod, PayrollRun, PayslipDetail } from './workforce.types.js';

/**
 * Duong DOC cua `transport-workforce`.
 *
 * KHONG CO MOT LOI GOI GHI NAO — cung quy uoc voi `fuel-read.service.ts` va
 * `asset-compliance-read.service.ts`. `NO_REPORTING_AS_BUSINESS_TRUTH` (T1 §16) duoc giu bang cach
 * tep nay khong tiem thu gi ghi duoc.
 */
@Injectable()
export class WorkforceReadService {
  constructor(private readonly repository: WorkforceRepository) {}

  async listPeriods(): Promise<PayrollPeriod[]> {
    return this.repository.listPeriods();
  }

  async listRuns(periodId: string): Promise<PayrollRun[]> {
    return this.repository.listRuns(periodId);
  }

  async listPayslips(runId: string): Promise<PayslipDetail[]> {
    return this.repository.listPayslips(runId);
  }

  /**
   * MOI phieu cua mot lai xe — ke ca phieu bo sung va phieu dao.
   *
   * Tra ve CA chuoi sua chu khong chi ban goc: mot ky luong da duoc sua doc dung chi khi doc du ca
   * ba loai, va lay tong bang cach cong `netAmount` cua toan bo chuoi.
   */
  async listPayslipsByDriver(driverId: string): Promise<PayslipDetail[]> {
    return this.repository.listPayslipsByDriver(driverId);
  }

  async payslipDetail(id: string): Promise<PayslipDetail> {
    const detail = await this.repository.findPayslip(id);
    if (!detail) {
      throw TransportDomainError.notFound('PAYSLIP_NOT_FOUND', `Khong tim thay phieu luong ${id}`);
    }
    return detail;
  }
}
