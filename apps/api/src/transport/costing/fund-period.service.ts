import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { TelemetryService } from '../../observability/telemetry.service.js';
import {
  TRANSPORT_CLOCK,
  TRANSPORT_CORE_POLICY,
  type TransportCorePolicy,
} from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import { TRANSPORT_COSTING_DECISIONS } from './costing-decisions.js';
import { requireDriverFacts, resolveCostingBusinessDate } from './costing-guards.js';
import { CostingRepository } from './costing.repository.js';
import type { DriverFundPeriod, FundPeriodSnapshot } from './costing.types.js';
import {
  evaluateFundPeriodTransition,
  periodsOverlap,
  type FundPeriodStatus,
} from './fund-period.js';
import { TransportCoreFacts } from './transport-core-facts.port.js';

export interface OpenFundPeriodInput {
  readonly driverId: string;
  readonly startDate: string;
  readonly endDate: string;
}

export interface ClosedFundPeriod {
  readonly period: DriverFundPeriod;
  readonly snapshot: FundPeriodSnapshot;
}

/**
 * KY QUYET TOAN QUY — T1 §7.3, `INV-22`, nguyen tac cua `GD-11`.
 *
 * Tach khoi `CostingService` vi day la mot MAY TRANG THAI, khong phai mot duong ghi so cai. Hai thu
 * do co hai luat khac han: so cai chi duoc THEM, con ky thi DOI TRANG THAI — va gop chung vao mot
 * service se lam cai `update` hop le cua ky nam ngay canh cho ma mot `update` la dieu cam.
 *
 * DONG KY KHONG TAO BUT TOAN. Khong mot loi goi `ledger.post()` nao trong tep nay, va do la cach
 * kiem nhanh nhat rang bat bien do con dung.
 */
@Injectable()
export class FundPeriodService {
  constructor(
    private readonly ledger: CostingRepository,
    private readonly core: TransportCoreFacts,
    private readonly audit: AuditLogService,
    @Inject(TRANSPORT_CORE_POLICY) private readonly corePolicy: TransportCorePolicy,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  async openPeriod(input: OpenFundPeriodInput, actor: string): Promise<DriverFundPeriod> {
    await requireDriverFacts(this.core, input.driverId);
    const startDate = this.businessDate(input.startDate);
    const endDate = this.businessDate(input.endDate);
    if (startDate > endDate) {
      throw TransportDomainError.invalid(
        'FUND_PERIOD_RANGE_INVALID',
        `Ky quy co ngay bat dau ${startDate} sau ngay ket thuc ${endDate}`,
      );
    }

    const account = await this.ledger.ensureAccount(input.driverId, this.now());
    const existing = await this.ledger.listPeriods(account.id);
    const clash = existing.find((period) => periodsOverlap(period, { startDate, endDate }));
    if (clash) {
      // Kiem o day de nguoi dung nhan mot cau tra loi noi ro ky nao dang vuong. Kho THAT van cuong
      // che dieu nay mot lan nua bang EXCLUDE constraint — cai kiem nay dung voi mot nguoi ghi,
      // constraint kia moi dung voi hai nguoi ghi cung luc.
      throw TransportDomainError.conflict(
        'FUND_PERIOD_OVERLAP',
        `Khoang ${startDate}..${endDate} chong lap voi ky ${clash.id} (${clash.startDate}..${clash.endDate})`,
      );
    }

    const period = await this.ledger.createPeriod({
      accountId: account.id,
      startDate,
      endDate,
      at: this.now(),
    });

    this.telemetry?.decision({
      vocabulary: TRANSPORT_COSTING_DECISIONS,
      point: 'fund_period.transition',
      outcome: 'allowed',
      reason: 'PERIOD_OPENED',
      detail: { periodId: period.id, accountId: account.id, startDate, endDate },
    });
    this.telemetry?.stateChange({
      entity: 'TransportDriverFundPeriod',
      entityId: period.id,
      from: null,
      to: period.status,
    });
    await this.audit.append({
      actor,
      action: 'transport.costing.period.open',
      entityType: 'TransportDriverFundPeriod',
      entityId: period.id,
      after: period,
    });
    return period;
  }

  /**
   * DONG KY — HAI PHA, va ranh gioi giua chung la mot lua chon da can nhac.
   *
   * ```text
   * pha 1: OPEN|REOPENED -> CLOSING   commit NGAY        (dong bang)
   * pha 2: chup anh + CLOSING -> CLOSED   MOT giao dich  (chot con so)
   * ```
   *
   * PHA 1 PHAI COMMIT RIENG: no la khoanh khac ky ngung nhan but toan. Neu no nam chung giao dich
   * voi phep cong, thi trong suot luc cong, mot phien khac VAN ghi duoc — va anh chup se noi mot
   * con so ma so cai khong con dong y.
   *
   * PHA 2 PHAI NGUYEN TU. Ban T3 dau tach no lam hai lan commit (chup anh, roi doi trang thai) va
   * do la lo hong `#94 §2`: mot lan chet dung giua chung de lai mot anh chup DA COMMIT tren mot ky
   * VAN o `CLOSING`, nen lenh dong goi lai se chup THEM mot anh nua cho CUNG MOT lan dong. Hai anh
   * cho mot lan dong nghia la cau hoi "ky nay da bao cao con so nao?" co hai cau tra loi, va khong
   * cach nao biet cau nao da gui cho ke toan.
   *
   * Gop lai thi mot lan chet giua pha 2 cuon lai sach: khong anh chup nao, ky ve dung `CLOSING` —
   * DONG BANG, khong mat du lieu — va lan goi sau chup DUNG mot anh. Do la ly do ham nay van chap
   * nhan dau vao dang `CLOSING`.
   *
   * MOT LAN MO LAI ROI DONG LAI la mot LAN DONG MOI, va no PHAI de lai mot anh chup moi: "con so
   * da bao cao lan truoc" la thu nguoi doi soat can khi ho hoi vi sao bao cao thang truoc khac.
   *
   * Dong ky KHONG tao but toan (T1 §7.3). So du am khi dong ky la KET QUA HOP LE, khong phai loi
   * (`FUND-003`) — anh chup ghi dung so am va khong sinh mot khoan khau tru nao (`GD-12`).
   */
  async closePeriod(periodId: string, actor: string): Promise<ClosedFundPeriod> {
    const period = await this.requirePeriod(periodId);

    let closing = period;
    if (period.status !== 'CLOSING') {
      closing = await this.transition(period, 'CLOSING', actor);
    }

    // May trang thai van la nguoi quyet dinh canh nay co ton tai khong, du kho moi la noi ghi no.
    // Bo kiem nay di thi `fund-period.ts` chi con la mot loi khuyen trong tai lieu.
    this.requireTransitionAllowed(closing, 'CLOSED');

    const finalized = await this.ledger.finalizeClose({
      periodId: closing.id,
      takenBy: actor,
      at: this.now(),
    });
    // `null` = ky khong con o `CLOSING` khi kho giu duoc khoa: mot phien khac da chot xong. KHONG
    // chup them mot anh nua va KHONG tra ve ket qua cua nguoi khac nhu the la cua minh.
    if (!finalized) {
      throw TransportDomainError.conflict(
        'FUND_PERIOD_STATUS_RACE',
        `Ky quy ${closing.id} vua duoc mot phien khac chot xong — tai lai de doc anh chup da co`,
      );
    }

    const { period: closed, snapshot } = finalized;
    this.telemetry?.decision({
      vocabulary: TRANSPORT_COSTING_DECISIONS,
      point: 'fund_period.transition',
      outcome: 'allowed',
      reason: 'PERIOD_CLOSED',
      detail: {
        periodId: closed.id,
        snapshotId: snapshot.id,
        sequence: snapshot.sequence,
        closingBalance: snapshot.closingBalance,
        entryCount: snapshot.entryCount,
      },
    });
    this.telemetry?.stateChange({
      entity: 'TransportDriverFundPeriod',
      entityId: closed.id,
      from: 'CLOSING',
      to: closed.status,
    });
    await this.audit.append({
      actor,
      action: 'transport.costing.period.close',
      entityType: 'TransportDriverFundPeriod',
      entityId: closed.id,
      before: { status: period.status },
      after: { status: closed.status, snapshot },
    });
    return { period: closed, snapshot };
  }

  /**
   * MO LAI mot ky da dong — `GD-11`: quyen rieng + dau vet.
   *
   * Quyen duoc cat o tang hanh dong (`transport.costing.period.reopen`, chi Giam doc), khong o day:
   * mot service khong duoc biet ten vai nao. Cai o day la thu con lai — LY DO bat buoc, va mot dong
   * audit mang ca ly do do. Mot lan mo lai khong giai trinh duoc thi bang chung ve so lieu da bao
   * cao ra ngoai cung mat theo.
   */
  async reopenPeriod(
    periodId: string,
    reason: string,
    actor: string,
  ): Promise<DriverFundPeriod> {
    const period = await this.requirePeriod(periodId);
    const reopened = await this.transition(period, 'REOPENED', actor, reason);

    await this.audit.append({
      actor,
      action: 'transport.costing.period.reopen',
      entityType: 'TransportDriverFundPeriod',
      entityId: reopened.id,
      before: { status: period.status, closedAt: period.closedAt, closedBy: period.closedBy },
      after: { status: reopened.status, reopenReason: reopened.reopenReason },
    });
    return reopened;
  }

  async listPeriods(driverId: string): Promise<DriverFundPeriod[]> {
    await requireDriverFacts(this.core, driverId);
    const account = await this.ledger.findAccountByDriver(driverId);
    return account ? this.ledger.listPeriods(account.id) : [];
  }

  async listSnapshots(periodId: string): Promise<FundPeriodSnapshot[]> {
    await this.requirePeriod(periodId);
    return this.ledger.listSnapshots(periodId);
  }

  /* ------------------------------ Noi bo ------------------------------ */

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }

  private businessDate(provided: string): string {
    return resolveCostingBusinessDate(provided, this.now(), this.corePolicy.timeZone);
  }

  private async requirePeriod(id: string): Promise<DriverFundPeriod> {
    const period = await this.ledger.findPeriod(id);
    if (!period) {
      throw TransportDomainError.notFound('FUND_PERIOD_NOT_FOUND', `Khong tim thay ky quy ${id}`);
    }
    return period;
  }

  /**
   * MOT lan doi trang thai: quyet o ham thuan, ghi co rang buoc `from`.
   *
   * `setPeriodStatus` tra `null` khi ky KHONG con o trang thai `from` — nghia la mot phien khac vua
   * doi no truoc. Do la mot va cham, khong phai mot loi dau vao: nguoi goi phai tai lai roi quyet
   * lai, chu khong sua duoc gi de qua duoc.
   */
  /** May trang thai quyet dinh; ham nay chi bien mot cau tra loi "khong" thanh mot loi co ma. */
  private requireTransitionAllowed(period: DriverFundPeriod, to: FundPeriodStatus): void {
    const decision = evaluateFundPeriodTransition(period.status, to);
    if (decision.allowed) return;

    this.telemetry?.decision({
      vocabulary: TRANSPORT_COSTING_DECISIONS,
      point: 'fund_period.transition',
      outcome: 'denied',
      reason: decision.reason,
      detail: { periodId: period.id, from: period.status, to },
    });
    throw TransportDomainError.denied(
      decision.reason,
      `Ky quy ${period.id}: khong chuyen duoc ${period.status} -> ${to} (${decision.reason})`,
    );
  }

  private async transition(
    period: DriverFundPeriod,
    to: FundPeriodStatus,
    actor: string,
    reopenReason?: string,
  ): Promise<DriverFundPeriod> {
    this.requireTransitionAllowed(period, to);

    const next = await this.ledger.setPeriodStatus(period.id, period.status, to, {
      at: this.now(),
      actor,
      reopenReason: reopenReason ?? null,
    });
    if (!next) {
      throw TransportDomainError.conflict(
        'FUND_PERIOD_STATUS_RACE',
        `Ky quy ${period.id} vua duoc nguoi khac chuyen trang thai — tai lai roi thu lai`,
      );
    }

    this.telemetry?.decision({
      vocabulary: TRANSPORT_COSTING_DECISIONS,
      point: 'fund_period.transition',
      outcome: 'allowed',
      // `CLOSED` khong di duong nay: no duoc ghi trong giao dich cua `finalizeClose()`, va
      // `closePeriod()` phat ma `PERIOD_CLOSED` ngay sau do.
      reason: to === 'CLOSING' ? 'PERIOD_CLOSING_STARTED' : 'PERIOD_REOPENED',
      detail: { periodId: period.id, from: period.status, to },
    });
    this.telemetry?.stateChange({
      entity: 'TransportDriverFundPeriod',
      entityId: period.id,
      from: period.status,
      to: next.status,
    });
    return next;
  }
}
