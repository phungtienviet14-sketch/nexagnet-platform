import { Injectable } from '@nestjs/common';
import type { FleetRepository } from '../fleet/fleet.repository.js';
import { CounterpartySubjectPort } from './counterparty-subject.port.js';
import type { CounterpartySubjectKind } from './counterparty.types.js';

/**
 * Hien thuc `CounterpartySubjectPort` bang cac danh muc cua `transport-core`.
 *
 * Hai loai o day (`CUSTOMER`, `PARTNER`) deu song trong `FleetRepository`, tuc trong CUNG capability
 * — nen adapter nay khong lam chieu phu thuoc cua T1 §10.1 cong them mot canh nao.
 *
 * Khi co mot loai chu the thuoc capability KHAC (vi du cay xang cua `transport-fuel`), no KHONG
 * duoc them vao day. Duong dung la mot adapter thu hai do chinh capability do dang ky, va tang lap
 * rap chon cai nao co mat — nho vay `transport-core` khong bao gio phai import mot kho ma khach
 * chua bat.
 */
@Injectable()
export class FleetCounterpartySubjectAdapter extends CounterpartySubjectPort {
  constructor(private readonly fleet: FleetRepository) {
    super();
  }

  supports(kind: CounterpartySubjectKind): boolean {
    return kind === 'CUSTOMER' || kind === 'PARTNER';
  }

  async exists(kind: CounterpartySubjectKind, subjectId: string): Promise<boolean> {
    if (kind === 'CUSTOMER') return (await this.fleet.findCustomer(subjectId)) !== null;
    if (kind === 'PARTNER') return (await this.fleet.findPartner(subjectId)) !== null;
    return false;
  }
}
