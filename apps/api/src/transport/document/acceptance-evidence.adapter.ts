import { Injectable } from '@nestjs/common';
import { AcceptanceEvidenceFacts } from '../acceptance/acceptance-facts.port.js';
import { OperationalDocumentRepository } from './document.repository.js';

/**
 * CONG CHUNG TU cua Lane K, duoc buoc THAT — `#275` K2 + `#279` O2.
 *
 * ============================================================================================
 * DAY LA DONG MA LANE K DA HEN TRUOC
 * ============================================================================================
 *
 * `acceptance-facts.port.ts` viet nguyen van:
 *
 *     *"Khi O/P vao `main`, thu duy nhat phai doi la MOT dong buoc adapter trong
 *       `transport-acceptance.module.ts` — khong mot luat mien nao, khong mot bang nao, khong mot
 *       bai test nghiep vu nao."*
 *
 * Adapter nay la ban thay the cho `NoOperationalDocumentsAdapter` (fail-closed, tra ve rong cho
 * moi cau hoi). No song o thu muc CUA MIEN NAY chu khong o thu muc cua Lane K, va phep dang ky
 * provider di cung `transport-checkpoint` o `app-composition.ts` — cung quy uoc voi
 * `ControlTowerCheckpointFactsAdapter`.
 *
 * ============================================================================================
 * `belongingTo` LOC, KHONG XAC NHAN SU TON TAI
 * ============================================================================================
 *
 * Cau hoi la *"nhung khoa NAY co thuoc ve DON KIA khong"*, khong phai *"khoa nay co ton tai
 * khong"*. Do chinh la khac biet `#275` K2 doi (*"Do not let a raw storage locator satisfy the
 * gate"*), va no chan dung ba lo hong ma `#279` O13 bai 8 va `#275` K8 bai 6-8 ton tai de chan:
 *
 *   · mot ma tep bat ky nguoi dung go vao KHONG bien thanh can cu — no khong nam trong ket qua;
 *   · mot chung tu cua DON KHAC khong thoa man don nay — `orderId` duoc so tren hang that;
 *   · mot chung tu DA BIA MO khong con thoa man gi — `status` phai la `ACTIVE`.
 *
 * Cai thu ba la dieu `#279` O2 goi ten: *"withdrawn/quarantined file cannot silently satisfy a
 * later acceptance decision"*.
 *
 * ============================================================================================
 * KHOA LA `documentId`, KHONG PHAI `fileId`
 * ============================================================================================
 *
 * Va do la mot lua chon co y. `fileId` la ma cua mot TEP; `documentId` la ma cua mot CHUNG TU
 * NGHIEP VU — mot to giay co loai, co don, co nguoi ghi, co vong doi. Mot lan nghiem thu dua vao
 * "to bien nhan giao hang cua don nay", khong dua vao "tep so 47".
 *
 * Nho vay khi `#287` vao `main`, KHONG mot dong nao o day phai doi: chung tu van la chung tu, chi
 * co `fileId` ben trong no chuyen tu `null` sang mot ma that.
 */
@Injectable()
export class OperationalDocumentAcceptanceEvidenceAdapter extends AcceptanceEvidenceFacts {
  constructor(private readonly documents: OperationalDocumentRepository) {
    super();
  }

  async belongingTo(orderId: string, refs: readonly string[]): Promise<readonly string[]> {
    if (refs.length === 0) return [];
    const mine = new Set(
      (await this.documents.listForOrder(orderId))
        .filter((document) => document.status === 'ACTIVE')
        .map((document) => document.id),
    );
    return refs.filter((ref) => mine.has(ref));
  }

  /**
   * Dem cho hang cho nghiem thu — nguoi truc can biet mot don CO chung tu hay khong TRUOC khi mo
   * no ra. Chi dem hang con HIEU LUC: mot to da bia mo khong con la mot chung tu cua don do.
   */
  async countFor(orderId: string): Promise<number> {
    const documents = await this.documents.listForOrder(orderId);
    return documents.filter((document) => document.status === 'ACTIVE').length;
  }
}
