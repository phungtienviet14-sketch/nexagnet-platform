import { Inject, Injectable, Optional } from '@nestjs/common';
import { BusinessDateError, toBusinessDate } from '../business-date.js';
import { TRANSPORT_CLOCK } from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import { TRANSPORT_TOLL_POLICY, type TransportTollPolicy } from './toll-policy.js';
import type { TollProvider } from './toll-provider.port.js';
import {
  buildTollSpendReport,
  resolveTollSpendWindow,
  type TollSpendReport,
  type TollSpendWindow,
} from './toll-spend-report.js';
import { TollSpendReader } from './toll-spend.reader.js';
import { TransportTollCoreFacts } from './toll.ports.js';
import { TollRepository } from './toll.repository.js';
import type { TollTransactionCandidateRecord } from './toll.types.js';

/**
 * Mot dong nghi trung hiem khi co qua vai dong doi ung. Hai muoi la du de nguoi doi soat nhin; qua
 * muc do thi `truncated` noi ra rang con sot, thay vi mot bang dai vo tan.
 */
export const TOLL_DUPLICATE_PEER_LIMIT = 20;

export interface TollDuplicatePeer {
  readonly candidate: TollTransactionCandidateRecord;
  /** Nhan cua lan nap sinh ra dong doi ung — de nguoi doi soat mo dung tep ma doi chieu. */
  readonly importLabel: string | null;
}

export interface TollDuplicatePeerListing {
  readonly candidateId: string;
  /**
   * `false` = dong nay KHONG co dau van (bi tu choi luc doc), nen he thong KHONG DE XUAT duoc dong
   * doi ung nao. Do khac han "khong co dong trung" — va man hinh phai noi dung cau do.
   */
  readonly fingerprintAvailable: boolean;
  readonly peers: readonly TollDuplicatePeer[];
  /** `true` = con dong doi ung ngoai `TOLL_DUPLICATE_PEER_LIMIT` dong da tra ve. */
  readonly truncated: boolean;
}

/**
 * BE MAT DOC cua ke toan ETC — `#314` G8/G9. KHONG mot ham nao ghi.
 *
 * Tach khoi `TollService` vi hai ly do. Mot la ranh gioi: `TollService` so huu duong GHI (nap,
 * quyet), con tep nay chi TRA LOI cau hoi tren nhung gi da ghi. Hai la lich lam viec: `TollService`
 * va hai kho cua no dang duoc mot lane khac sua (#308), va mot be mat doc khong co ly do gi de va
 * cham voi lane do.
 *
 * Khong nhan `actor`, khong ghi kiem toan: doc khong doi mot su that nao. Va khong cham so quy lai
 * xe — ETC la CONG TY TRA (#229 §8).
 */
@Injectable()
export class TollReportService {
  constructor(
    private readonly reader: TollSpendReader,
    private readonly repository: TollRepository,
    private readonly core: TransportTollCoreFacts,
    @Inject(TRANSPORT_TOLL_POLICY) private readonly policy: TransportTollPolicy,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  /**
   * CHI PHI ETC THEO XE / KY.
   *
   * "Hom nay" la ngay nghiep vu cua MAY CHU theo mui gio khach (`INV-25`) — cung quy uoc voi phep
   * dem doan noi o `TollAccountService`. Bao cao tra ve ca moc do (`generatedOn`) de man hinh noi
   * duoc no da tinh vao ngay nao.
   */
  async spendReport(query: {
    readonly from: string | null;
    readonly to: string | null;
    readonly provider: TollProvider | null;
  }): Promise<TollSpendReport> {
    const today = toBusinessDate(this.now(), this.policy.timeZone);
    const window = this.windowOf(query, today);
    const [buckets, vehicles] = await Promise.all([
      this.reader.spendBuckets(window),
      this.core.listVehicles(),
    ]);
    return buildTollSpendReport({ window, generatedOn: today, buckets, vehicles });
  }

  /**
   * DONG DOI UNG cua mot dong — de nguoi doi soat chon DUNG MOT dong khi noi "dong nay trung".
   *
   * Tap doi ung la cac dong CUNG nha cung cap va CUNG dau van: dung tap ma phep phan loai da dung
   * de nghi trung. He thong KHONG chon ho — no chi dat cac ung vien canh nhau. `review()` van la
   * noi duy nhat mot quyet dinh duoc ghi.
   */
  async duplicatePeers(candidateId: string): Promise<TollDuplicatePeerListing> {
    const candidate = await this.repository.findCandidate(candidateId);
    if (!candidate) {
      throw TransportDomainError.notFound(
        'TOLL_CANDIDATE_NOT_FOUND',
        `Khong tim thay dong ${candidateId}`,
      );
    }
    if (candidate.parseStatus !== 'ACCEPTED' || candidate.fingerprint === null) {
      return {
        candidateId,
        fingerprintAvailable: candidate.fingerprint !== null,
        peers: [],
        truncated: false,
      };
    }

    // Xin THEM mot dong de biet con sot hay khong, ma khong phai dem ca bang.
    const ids = await this.reader.duplicatePeerIds({
      candidateId,
      provider: candidate.provider,
      fingerprint: candidate.fingerprint,
      limit: TOLL_DUPLICATE_PEER_LIMIT + 1,
    });
    const found = await Promise.all(
      ids.slice(0, TOLL_DUPLICATE_PEER_LIMIT).map((id) => this.repository.findCandidate(id)),
    );
    const peers = found.filter((peer): peer is TollTransactionCandidateRecord => peer !== null);

    const importIds = [...new Set(peers.map((peer) => peer.importId))];
    const imports = await Promise.all(importIds.map((id) => this.repository.findImport(id)));
    const labelOf = new Map(
      importIds.map((id, index) => [id, imports[index]?.sourceLabel ?? null]),
    );

    return {
      candidateId,
      fingerprintAvailable: true,
      peers: peers.map((peer) => ({
        candidate: peer,
        importLabel: labelOf.get(peer.importId) ?? null,
      })),
      truncated: ids.length > TOLL_DUPLICATE_PEER_LIMIT,
    };
  }

  private windowOf(
    query: {
      readonly from: string | null;
      readonly to: string | null;
      readonly provider: TollProvider | null;
    },
    today: string,
  ): TollSpendWindow {
    try {
      return resolveTollSpendWindow(query, today);
    } catch (error) {
      if (error instanceof BusinessDateError) {
        throw TransportDomainError.invalid('BUSINESS_DATE_INVALID', error.message);
      }
      throw error;
    }
  }

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }
}
