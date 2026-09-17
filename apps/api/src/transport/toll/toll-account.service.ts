import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { TelemetryService } from '../../observability/telemetry.service.js';
import {
  BusinessDateError,
  assertBusinessDate,
  toBusinessDate,
  type BusinessDate,
} from '../business-date.js';
import { TRANSPORT_CLOCK } from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import { tollLinkEffectiveOn, tollLinkPeriodInvalid } from './toll-account-link.js';
import { TRANSPORT_TOLL_DECISIONS } from './toll-decisions.js';
import { TRANSPORT_TOLL_POLICY, type TransportTollPolicy } from './toll-policy.js';
import type { TollProvider } from './toll-provider.port.js';
import { TransportTollCoreFacts } from './toll.ports.js';
import { TollRepository } from './toll.repository.js';
import type {
  TollAccount,
  TollAccountLinkCount,
  TollAccountLinkListing,
  TollAccountVehicleLink,
} from './toll.types.js';

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
    @Inject(TRANSPORT_TOLL_POLICY) private readonly policy: TransportTollPolicy,
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

  /**
   * SO DOAN NOI cua mot tai khoan — kem ket luan "dang hieu luc" cho TUNG doan.
   *
   * ======================================================================================
   * VI SAO KHONG TRA VE MANG TRAN NHU TRUOC
   * ======================================================================================
   *
   * Ban truoc tra ve mang ban ghi tho, va man hinh tu cham bang `effectiveTo === null`. Phep rut
   * gon do bien mot doan MO TU THANG SAU thanh mot huy hieu xanh *"Dang hieu luc"* — trong khi
   * chinh may chu, o phep dem ngay ben canh, loai no ra. Hai con so canh nhau noi hai dieu khac
   * nhau ve cung mot doan noi, va nguoi doc khong co cach nao biet ben nao dung.
   *
   * Nen ket luan duoc cham o DAY, bang DUNG mot ham ma phep dem va phep doc mot dong ve chiec xe
   * dang dung (`tollLinkEffectiveOn`). Ba be mat, mot dinh nghia.
   *
   * `onDate` di ra ngoai cung ly do o `countEffectiveLinksByAccount`: man hinh phai noi duoc moc
   * da dung, va no khong duoc tu lay ngay tu dong ho trinh duyet.
   */
  async listLinksForAccount(accountId: string): Promise<TollAccountLinkListing> {
    return this.toListing(await this.repository.listLinksForAccount(accountId));
  }

  listLinksForVehicle(vehicleId: string): Promise<readonly TollAccountVehicleLink[]> {
    return this.repository.listLinksForVehicle(vehicleId);
  }

  /**
   * LICH SU NHAN CHI TRA cua MOT XE, qua MOI tai khoan — `#314` G7.
   *
   * "Xe doi tai khoan" la DONG doan o tai khoan cu roi MO doan o tai khoan moi. So theo tai khoan
   * chi ke mot nua cau chuyen do, va nguoi van hanh vua bi `TOLL_VEHICLE_ALREADY_LINKED` can dung
   * nua kia: *chiec xe nay DANG nhan chi tra tu tai khoan nao, tu ngay nao*. Tra loi o day, cham
   * `effective` bang DUNG ham cua phep dem va phep doc theo tai khoan.
   *
   * Mot `vehicleId` khong ton tai cho ra danh sach RONG, khong phai loi: day la mot phep DOC so noi,
   * va no khong tiet lo gi hon chinh danh sach tai khoan ma nguoi goi von doc duoc.
   */
  async listLinkHistoryForVehicle(vehicleId: string): Promise<TollAccountLinkListing> {
    return this.toListing(await this.repository.listLinksForVehicle(vehicleId));
  }

  /**
   * DEM so xe DANG nhan chi tra, cho TUNG tai khoan, trong MOT lan hoi.
   *
   * ======================================================================================
   * TON TAI VI MOT CON SO SAI DOC RA NHU MOT SU THAT VAN HANH
   * ======================================================================================
   *
   * Bang tai khoan tren man hinh muon hien con so nay o MOI dong. Neu man hinh tu dem, no chi co
   * trong tay doan noi cua tai khoan DANG CHON — va moi tai khoan con lai se hien `0`. Khong ai
   * doc `0` do nhu "chua tai du lieu"; nguoi ta doc no la "tai khoan nay chua noi xe nao", roi di
   * mo mot doan noi da ton tai.
   *
   * ======================================================================================
   * MOI TAI KHOAN DEU CO MOT HANG, KE CA TAI KHOAN KHONG CO DOAN NOI NAO
   * ======================================================================================
   *
   * Bang dem duoc gieo tu DANH SACH TAI KHOAN chu khong tu danh sach doan noi. Chi gieo tu doan
   * noi thi mot tai khoan chua noi xe nao se KHONG co hang — va nguoi goi lai phai tu quyet dinh
   * "khong co hang" nghia la `0` hay la "chua biet". Hai nghia do khac nhau, nen tang nay tra loi
   * dut khoat: `0` la mot cau tra loi, khong phai mot khoang trong.
   *
   * `onDate` do MAY CHU tinh theo mui gio nghiep vu cua khach. Mot trinh duyet dat lech mui gio
   * khong duoc phep doi nghia cua chu "dang".
   */
  async countEffectiveLinksByAccount(): Promise<readonly TollAccountLinkCount[]> {
    const onDate = toBusinessDate(this.now(), this.policy.timeZone);
    const [accounts, links] = await Promise.all([
      this.repository.listAccounts(null),
      this.repository.listAllLinks(),
    ]);

    const counts = new Map<string, number>(accounts.map((account) => [account.id, 0]));
    for (const link of links) {
      // `tollLinkEffectiveOn` chu khong `effectiveTo === null`: mot doan mo tu thang sau cung co
      // `effectiveTo` rong, va no CHUA nhan chi tra hom nay.
      if (!tollLinkEffectiveOn(link, onDate)) continue;
      const held = counts.get(link.accountId);
      // Doan noi tro toi mot tai khoan khong con trong danh sach thi bo qua — dem no vao se tao
      // ra mot hang cho mot tai khoan ma man hinh khong co dong nao de gan vao.
      if (held === undefined) continue;
      counts.set(link.accountId, held + 1);
    }

    return [...counts].map(([accountId, effectiveLinkCount]) => ({
      accountId,
      effectiveLinkCount,
      onDate,
    }));
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

  /**
   * MOT dinh nghia "dang hieu luc" cho MOI be mat doc doan noi — theo tai khoan va theo xe.
   *
   * `onDate` la ngay nghiep vu cua MAY CHU; man hinh noi ra moc nay thay vi tu lay dong ho trinh
   * duyet (xem khoi chu thich cua `listLinksForAccount`).
   */
  private toListing(links: readonly TollAccountVehicleLink[]): TollAccountLinkListing {
    const onDate = toBusinessDate(this.now(), this.policy.timeZone);
    return {
      onDate,
      links: links.map((link) => ({ ...link, effective: tollLinkEffectiveOn(link, onDate) })),
    };
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
