import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { BusinessDateError, assertBusinessDate, type BusinessDate } from '../business-date.js';
import { TRANSPORT_CLOCK } from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import { tollLinkPeriodInvalid } from './toll-account-link.js';
import { TRANSPORT_TOLL_DECISIONS } from './toll-decisions.js';
import type { TollProvider } from './toll-provider.port.js';
import { TransportTollCoreFacts } from './toll.ports.js';
import { TollRepository } from './toll.repository.js';
import type { TollAccount, TollAccountVehicleLink } from './toll.types.js';

/**
 * TAI KHOAN GIAO THONG va ANH XA XE — tach khoi `toll.service.ts` vi hai ly do.
 *
 * Mot la do dai (`.claude/rules`: tep < 800 dong). Hai la RANH GIOI: khai mot tai khoan giao thong
 * va noi mot chiec xe vao no la viec DANH MUC, lam mot lan roi thoi; nap mot sao ke la viec HANG
 * THANG. Hai nhip khac nhau, hai be mat khac nhau, hai quyen khac nhau.
 */
@Injectable()
export class TollAccountService {
  constructor(
    private readonly repository: TollRepository,
    private readonly core: TransportTollCoreFacts,
    private readonly audit: AuditLogService,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  async createAccount(
    input: { provider: TollProvider; accountNo: string; holderName: string | null },
    actor: string,
  ): Promise<TollAccount> {
    const account = await this.repository.createAccount(input);
    await this.audit.append({
      actor,
      action: 'transport.toll.account.create',
      entityType: 'TransportTollAccount',
      entityId: account.id,
      after: { provider: account.provider, accountNo: account.accountNo },
    });
    return account;
  }

  listAccounts(provider: TollProvider | null): Promise<readonly TollAccount[]> {
    return this.repository.listAccounts(provider);
  }

  async setAccountActive(id: string, active: boolean, actor: string): Promise<TollAccount> {
    const account = await this.repository.setAccountActive(id, active);
    await this.audit.append({
      actor,
      action: 'transport.toll.account.update',
      entityType: 'TransportTollAccount',
      entityId: account.id,
      after: { active },
    });
    return account;
  }

  listLinksForAccount(accountId: string): Promise<readonly TollAccountVehicleLink[]> {
    return this.repository.listLinksForAccount(accountId);
  }

  listLinksForVehicle(vehicleId: string): Promise<readonly TollAccountVehicleLink[]> {
    return this.repository.listLinksForVehicle(vehicleId);
  }

  /**
   * MO mot doan noi xe <-> tai khoan giao thong.
   *
   * ===========================================================================
   * BAT BIEN ND 119/2024/ND-CP D.11 kh.3 DUOC KIEM O BA TANG, va do khong phai thua:
   *
   *   · o day        — de tra ve mot ma loi doc duoc thay vi mot loi rang buoc tho cua Postgres;
   *   · o kho bo nho — de che do `memory` khong cho qua thu ma `prisma` chan (neu khong, moi bai
   *                    test chay o che do bo nho se xanh cho mot hanh vi khong bao gio chay duoc);
   *   · o Postgres   — bang unique mot phan, de HAI nguoi ghi cung luc khong cung thang.
   */
  async openLink(
    input: {
      accountId: string;
      vehicleId: string;
      providerVehicleRef: string | null;
      effectiveFrom: string;
      effectiveTo: string | null;
    },
    actor: string,
  ): Promise<TollAccountVehicleLink> {
    const account = await this.repository.findAccount(input.accountId);
    if (!account) {
      throw TransportDomainError.notFound(
        'TOLL_ACCOUNT_NOT_FOUND',
        `Khong tim thay tai khoan giao thong ${input.accountId}`,
      );
    }
    if (!account.active) {
      this.decide('denied', 'TOLL_LINK_ACCOUNT_INACTIVE', { accountId: account.id });
      throw TransportDomainError.invalid(
        'TOLL_ACCOUNT_INACTIVE',
        `Tai khoan ${account.accountNo} khong con hieu luc`,
      );
    }

    /*
     * XE PHAI CO THAT, va phep kiem di qua `TransportTollCoreFacts` — mot cong CHI DOC.
     *
     * #269 J9: *"cross-tenant/foreign vehicle/account IDs fail closed"*. Mot `vehicleId` bia se
     * dung o day chu khong di toi lop kho, va no khong bao gio tao ra mot chiec xe moi.
     */
    const vehicle = await this.core.findVehicle(input.vehicleId);
    if (!vehicle) {
      throw TransportDomainError.notFound(
        'TOLL_VEHICLE_NOT_FOUND',
        `Khong tim thay xe ${input.vehicleId}`,
      );
    }

    const effectiveFrom = this.requireBusinessDate(input.effectiveFrom);
    const effectiveTo =
      input.effectiveTo === null ? null : this.requireBusinessDate(input.effectiveTo);
    if (tollLinkPeriodInvalid({ effectiveFrom, effectiveTo })) {
      this.decide('denied', 'TOLL_LINK_PERIOD_INVALID', { effectiveFrom, effectiveTo });
      throw TransportDomainError.invalid(
        'TOLL_LINK_PERIOD_INVALID',
        `Ngay dong (${String(effectiveTo)}) phai sau hoac bang ngay mo (${effectiveFrom})`,
      );
    }

    const link = await this.repository.openLink({
      accountId: input.accountId,
      vehicleId: input.vehicleId,
      providerVehicleRef: input.providerVehicleRef,
      effectiveFrom,
      effectiveTo,
      createdBy: actor,
      at: this.now(),
    });

    this.decide('allowed', 'TOLL_LINK_OPENED', {
      accountId: link.accountId,
      vehicleId: link.vehicleId,
    });
    await this.audit.append({
      actor,
      action: 'transport.toll.link.open',
      entityType: 'TransportTollAccountVehicleLink',
      entityId: link.id,
      after: { accountId: link.accountId, vehicleId: link.vehicleId, effectiveFrom },
    });
    return link;
  }

  /**
   * DONG mot doan noi.
   *
   * "Xe doi tai khoan" la DONG doan cu roi MO doan moi — khong bao gio la them mot doan thu hai.
   * Nen ham nay ton tai rieng, va no khong nhan mot `accountId` moi: gop hai viec lam mot se lam
   * mot lan doi tai khoan that bai o giua de lai mot chiec xe khong noi voi tai khoan nao.
   */
  async closeLink(id: string, effectiveTo: string, actor: string): Promise<TollAccountVehicleLink> {
    const closed = await this.repository.closeLink(
      id,
      this.requireBusinessDate(effectiveTo),
      actor,
      this.now(),
    );
    this.decide('allowed', 'TOLL_LINK_CLOSED', { linkId: id });
    await this.audit.append({
      actor,
      action: 'transport.toll.link.close',
      entityType: 'TransportTollAccountVehicleLink',
      entityId: id,
      after: { effectiveTo: closed.effectiveTo },
    });
    return closed;
  }

  private requireBusinessDate(value: string): BusinessDate {
    try {
      return assertBusinessDate(value);
    } catch (error) {
      if (error instanceof BusinessDateError) {
        throw TransportDomainError.invalid('BUSINESS_DATE_INVALID', error.message);
      }
      throw error;
    }
  }

  /** Telemetry LUON fail-open — thieu no thi nghiep vu van chay (`.claude/rules`). */
  private decide(
    outcome: 'allowed' | 'denied',
    reason:
      | 'TOLL_LINK_OPENED'
      | 'TOLL_LINK_CLOSED'
      | 'TOLL_LINK_VEHICLE_ALREADY_LINKED'
      | 'TOLL_LINK_ACCOUNT_INACTIVE'
      | 'TOLL_LINK_PERIOD_INVALID',
    detail: Record<string, unknown>,
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_TOLL_DECISIONS,
      point: 'toll_account.link',
      outcome,
      reason,
      detail,
    });
  }

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }
}
