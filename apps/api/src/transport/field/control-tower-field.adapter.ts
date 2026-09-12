import { Inject, Injectable, Optional } from '@nestjs/common';
import { ControlTowerFieldFacts } from '../control-tower/control-tower-facts.port.js';
import {
  DEFAULT_DOCUMENT_REQUIREMENT_POLICY,
  TRANSPORT_DOCUMENT_POLICY,
  missingDocumentTypes,
  type DocumentRequirementPolicy,
} from '../document/document-lifecycle.js';
import { OperationalDocumentRepository } from '../document/document.repository.js';
import type { OperationalDocumentType } from '../document/document.types.js';
import { WaitingAllowanceRepository } from '../waiting/allowance.repository.js';
import { WaitingSessionRepository } from '../waiting/waiting.repository.js';

/**
 * NGUON HIEN TRUONG cho thap dieu hanh — `#279` O11.
 *
 * ============================================================================================
 * DAY LA BA CHO TRONG MA LANE N DA DAT SAN TEN
 * ============================================================================================
 *
 * `control-tower.types.ts` viet truoc `#279` da co:
 *
 *   · cot `WAITING` nam tren bang, RONG, kem `AWAITING_WAITING_SESSION_SOURCE`;
 *   · `DRIVER_WAITING_ALLOWANCE_AWAITING_APPROVAL` trong `PENDING_ACTION_QUEUE_KINDS`;
 *   · `DELIVERY_PROOF_DOCUMENT_MISSING` trong cung danh sach do.
 *
 * Adapter nay dien ca ba. Khong mot ma nao cua Lane N bi doi ten; ba muc chi chuyen tu "chua theo
 * doi duoc" sang "co that".
 *
 * ============================================================================================
 * KHONG MOT SO TIEN NAO DI QUA DAY
 * ============================================================================================
 *
 * `countPendingAllowances()` tra ve mot con SO, khong tra ve hang. Thap dieu hanh la man hinh cua
 * nguoi truc, khong phai cua ke toan — mang so tien phu cap cua mot con nguoi len do se bien mot
 * bang dieu hanh thanh mot bang luong, voi mot bang phan quyen khac han.
 */
@Injectable()
export class ControlTowerFieldFactsAdapter extends ControlTowerFieldFacts {
  constructor(
    private readonly waiting: WaitingSessionRepository,
    private readonly allowances: WaitingAllowanceRepository,
    private readonly documents: OperationalDocumentRepository,
    @Optional()
    @Inject(TRANSPORT_DOCUMENT_POLICY)
    private readonly policy: DocumentRequirementPolicy = DEFAULT_DOCUMENT_REQUIREMENT_POLICY,
  ) {
    super();
  }

  async listOpenWaitingLegIds(): Promise<ReadonlySet<string>> {
    return new Set((await this.waiting.listOpen()).map((session) => session.legId));
  }

  async countPendingAllowances(): Promise<number> {
    return (await this.allowances.listByStatus('PENDING')).length;
  }

  /**
   * CHANG DA GIAO XONG ma con thieu chung tu bat buoc.
   *
   * "Da giao xong" doc tu chinh chung tu chu khong tu moc, va do la co y: mot chang chua giao xong
   * thi chua den luc doi bien nhan, va bao "thieu bien nhan" o do la mot canh bao GIA — mot canh
   * bao gia lam nguoi ta thoi doc canh bao.
   *
   * Nen dieu kien la: chang DA co it nhat mot chung tu (tuc da co viec o do), va con thieu mot loai
   * bat buoc. Mot chang chua ai chup gi khong len hang viec — no chua bat dau.
   */
  async listLegsMissingRequiredDocuments(): Promise<ReadonlySet<string>> {
    if (this.policy.requiredOnLoadedLeg.length === 0) return new Set();

    const missing = new Set<string>();
    for (const [legId, types] of await this.documentTypesByLeg()) {
      if (missingDocumentTypes(this.policy, types).length > 0) missing.add(legId);
    }
    return missing;
  }

  /**
   * Loai chung tu CON HIEU LUC theo chang.
   *
   * Doc qua `listOpen()` cua kho phien cho la khong du — mot chang khong he phai cho van can bien
   * nhan. Nen o day di qua chinh kho chung tu, va chi gom nhung chang DA co it nhat mot to.
   */
  private async documentTypesByLeg(): Promise<
    ReadonlyMap<string, readonly OperationalDocumentType[]>
  > {
    const byLeg = new Map<string, OperationalDocumentType[]>();
    for (const document of await this.documents.listActiveWithLeg()) {
      if (document.legId === null) continue;
      byLeg.set(document.legId, [...(byLeg.get(document.legId) ?? []), document.type]);
    }
    return byLeg;
  }
}
