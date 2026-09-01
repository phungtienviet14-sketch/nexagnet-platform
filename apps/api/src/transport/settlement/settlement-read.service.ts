import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../business-date.js';
import {
  computeDirectMargin,
  rollupDirectMargin,
  type DirectMargin,
  type DirectMarginRollup,
} from './direct-margin.js';
import type { SettlementFlow } from './settlement-flows.js';
import { agingBucketFor, daysOverdue, type AgingBucket } from './settlement-terms.js';
import { SettlementCoreFacts, SettlementCostingFacts } from './settlement.ports.js';
import { SettlementRepository } from './settlement.repository.js';
import type { SettlementDocumentChain } from './settlement.types.js';

/**
 * BAO CAO cua `TX-05` — CHI DOC. Issue #87: *"Never mutate from reporting."*
 *
 * ===========================================================================
 * `GD-15` CAM BU TRU, va do la rang buoc dinh hinh ca tep nay.
 *
 * Moi ham o day nhan `direction` hoac `flow` lam THAM SO BAT BUOC. Khong ton tai mot ham nao tra
 * ve "tong cong no cua doi tac X" — vi cau hoi do khong co MOT cau tra loi dung: mot doi tac vua
 * cho thue xe vua mang don ve co HAI so du, va cong chung lai chinh la mot phep bu tru.
 *
 * `partnerPosition()` tra ve ca hai chieu CANH NHAU cung mot cot `netDisplay`. Cot do la HIEN THI:
 * no khong ton tai trong bang nao, khong ai tra tien theo no, va cac con so goc luon di kem de
 * nguoi doc thay minh dang nhin mot phep tru chu khong phai mot so du.
 */

export interface ArAgingRow {
  readonly documentId: string;
  readonly counterpartyId: string;
  readonly businessDate: BusinessDate;
  readonly dueDate: BusinessDate | null;
  readonly outstandingAmount: number;
  readonly daysOverdue: number;
  readonly bucket: AgingBucket;
  readonly currencyCode: string;
}

export interface ArAgingReport {
  readonly asOf: BusinessDate;
  readonly rows: readonly ArAgingRow[];
  readonly totalsByBucket: Readonly<Record<AgingBucket, number>>;
  readonly outstandingTotal: number;
  readonly overdueTotal: number;
}

export interface ApByCounterpartyRow {
  readonly counterpartyId: string;
  readonly flow: SettlementFlow;
  readonly documentCount: number;
  /** DUONG — so tien cong ty con no. Doi dau tu `signedAmount` de bao cao doc thuan. */
  readonly outstandingAmount: number;
  readonly currencyCode: string;
}

/**
 * HAI CHIEU cua MOT doi tac, canh nhau. `netDisplay` la mot cot HIEN THI (`GD-15`).
 *
 * Ba con so goc luon di kem, va deu la so DUONG. Tra ve mot so am duy nhat se lam nguoi doc tuong
 * day la mot so du that — va do dung la phep bu tru phap ly ma nguon cam.
 */
export interface PartnerPosition {
  readonly partnerId: string;
  readonly receivableAmount: number;
  readonly carrierPayableAmount: number;
  readonly commissionPayableAmount: number;
  /** `receivable - (carrier + commission)`. CHI de hien thi. */
  readonly netDisplay: number;
  readonly currencyCode: string;
}

const EMPTY_BUCKETS: Readonly<Record<AgingBucket, number>> = {
  CURRENT: 0,
  D1_30: 0,
  D31_60: 0,
  D60_PLUS: 0,
};

@Injectable()
export class SettlementReadService {
  constructor(
    private readonly repository: SettlementRepository,
    private readonly core: SettlementCoreFacts,
    private readonly costing: SettlementCostingFacts,
  ) {}

  /** TUOI NO phai thu — bao cao AR aging / den han / qua han. */
  async arAging(asOf: BusinessDate, customerId?: string): Promise<ArAgingReport> {
    const chains = await this.repository.listChains({
      direction: 'RECEIVABLE',
      flow: 'CUSTOMER_FREIGHT',
      counterpartyId: customerId,
      originalsOnly: true,
    });

    const rows: ArAgingRow[] = chains
      .filter((chain) => chain.outstandingAmount !== 0)
      .map((chain) => ({
        documentId: chain.original.id,
        counterpartyId: chain.original.counterpartyId,
        businessDate: chain.original.businessDate,
        dueDate: chain.original.dueDate,
        outstandingAmount: chain.outstandingAmount,
        daysOverdue: daysOverdue(chain.original.dueDate, asOf),
        bucket: agingBucketFor(chain.original.dueDate, asOf),
        currencyCode: chain.original.currencyCode,
      }));

    const totalsByBucket = rows.reduce<Record<AgingBucket, number>>(
      (totals, row) => ({ ...totals, [row.bucket]: totals[row.bucket] + row.outstandingAmount }),
      { ...EMPTY_BUCKETS },
    );

    return {
      asOf,
      rows,
      totalsByBucket,
      outstandingTotal: rows.reduce((total, row) => total + row.outstandingAmount, 0),
      overdueTotal: rows
        .filter((row) => row.daysOverdue > 0)
        .reduce((total, row) => total + row.outstandingAmount, 0),
    };
  }

  /**
   * CONG NO PHAI TRA gom theo doi tac, TRONG MOT DONG.
   *
   * `flow` la tham so BAT BUOC — khong co ban "tat ca cac dong", vi mot bang gop ca cay xang, nha
   * xe va doi tac mang don lai se cho ra mot cot tong ma khong ai tra tien theo no.
   */
  async apByCounterparty(flow: SettlementFlow): Promise<ApByCounterpartyRow[]> {
    const chains = await this.repository.listChains({
      direction: 'PAYABLE',
      flow,
      originalsOnly: true,
    });

    const grouped = new Map<string, { amount: number; count: number; currencyCode: string }>();
    for (const chain of chains) {
      if (chain.outstandingAmount === 0) continue;
      const key = chain.original.counterpartyId;
      const bucket = grouped.get(key) ?? {
        amount: 0,
        count: 0,
        currencyCode: chain.original.currencyCode,
      };
      // `signedAmount` cua chieu PAYABLE la so AM; bao cao doc thuan hon voi so duong.
      bucket.amount += Math.abs(chain.outstandingAmount);
      bucket.count += 1;
      grouped.set(key, bucket);
    }

    return [...grouped.entries()]
      .map(([counterpartyId, bucket]) => ({
        counterpartyId,
        flow,
        documentCount: bucket.count,
        outstandingAmount: bucket.amount,
        currencyCode: bucket.currencyCode,
      }))
      .sort((left, right) => left.counterpartyId.localeCompare(right.counterpartyId));
  }

  /**
   * VI THE HAI CHIEU cua mot doi tac — acceptance 9 va 10.
   *
   * Ba con so goc giu rieng; `netDisplay` chi la mot phep tru de hien thi. Xoa ba con so goc di va
   * chi giu `netDisplay` se lam bien mat dung thu `GD-15` bao ve.
   */
  async partnerPosition(partnerId: string): Promise<PartnerPosition> {
    const [receivables, carrier, commission] = await Promise.all([
      this.repository.listChains({
        direction: 'RECEIVABLE',
        counterpartyId: partnerId,
        originalsOnly: true,
      }),
      this.repository.listChains({
        direction: 'PAYABLE',
        flow: 'CARRIER_SERVICE',
        counterpartyId: partnerId,
        originalsOnly: true,
      }),
      this.repository.listChains({
        direction: 'PAYABLE',
        flow: 'PARTNER_COMMISSION',
        counterpartyId: partnerId,
        originalsOnly: true,
      }),
    ]);

    const sum = (chains: readonly SettlementDocumentChain[]): number =>
      chains.reduce((total, chain) => total + Math.abs(chain.outstandingAmount), 0);

    const receivableAmount = sum(receivables);
    const carrierPayableAmount = sum(carrier);
    const commissionPayableAmount = sum(commission);

    return {
      partnerId,
      receivableAmount,
      carrierPayableAmount,
      commissionPayableAmount,
      netDisplay: receivableAmount - (carrierPayableAmount + commissionPayableAmount),
      currencyCode:
        carrier[0]?.original.currencyCode ??
        commission[0]?.original.currencyCode ??
        receivables[0]?.original.currencyCode ??
        'VND',
    };
  }

  /** BIEN TRUC TIEP cua mot chuyen. Acceptance 6 va 12. */
  async tripDirectMargin(tripId: string): Promise<DirectMargin | null> {
    const trip = await this.core.findTrip(tripId);
    if (!trip) return null;

    const [directCostAmount, carrierChains, commission] = await Promise.all([
      this.costing.directCostOf(tripId),
      this.repository.listChains({
        direction: 'PAYABLE',
        flow: 'CARRIER_SERVICE',
        tripId,
        originalsOnly: true,
      }),
      this.repository.findCommissionByTrip(tripId),
    ]);

    return computeDirectMargin({
      tripId,
      tripKind: trip.kind,
      revenueAmount: trip.freightAmount,
      directCostAmount,
      carrierPayableAmount: carrierChains.reduce(
        (total, chain) => total + Math.abs(chain.grossAmount),
        0,
      ),
      commissionAmount: commission?.resultAmount ?? 0,
      currencyCode: trip.currencyCode,
    });
  }

  /**
   * CONG DON bien truc tiep tren nhieu chuyen.
   *
   * Doc tung chuyen roi cong o tang mien chu khong cong o SQL: cong thuc bien khac nhau theo LOAI
   * chuyen (thue ngoai tru cong no nha xe; xe nha tru chi phi truc tiep va hoa hong), va mot cau
   * `SUM` khong bieu dien duoc su khac biet do ma khong nhan doi chinh cong thuc trong SQL.
   */
  async directMarginRollup(tripIds: readonly string[]): Promise<DirectMarginRollup> {
    const margins: DirectMargin[] = [];
    for (const tripId of tripIds) {
      const margin = await this.tripDirectMargin(tripId);
      if (margin) margins.push(margin);
    }
    return rollupDirectMargin(margins);
  }

  async documentChain(originalId: string): Promise<SettlementDocumentChain | null> {
    return this.repository.findChain(originalId);
  }
}
