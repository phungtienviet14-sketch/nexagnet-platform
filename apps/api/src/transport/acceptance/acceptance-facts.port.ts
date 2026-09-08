import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../business-date.js';
import { CounterpartyRepository } from '../counterparty/counterparty.repository.js';
import { MovementRepository } from '../movement/movement.repository.js';
import type { VehicleRunStatus } from '../movement/movement.types.js';

/**
 * BA CUA SO tu `transport-acceptance` nhin ra ngoai. Ca ba deu CHI DOC.
 *
 * ============================================================================================
 * `NO_CROSS_CONTEXT_REPOSITORY_WRITE` GIU BANG KIEU, KHONG BANG KY LUAT
 * ============================================================================================
 *
 * Cung khuon `settlement.ports.ts` da chay: mien nay khong duoc tiem `MovementRepository` hay
 * `CounterpartyRepository` vao tang dich vu, no duoc tiem ba cong duoi day — va khong cong nao co
 * mot ham GHI.
 *
 * O day dieu do quan trong hon o cho khac. `#268` I3 dat ra mot bat bien tach nhiem vu:
 *
 *     Ke toan DUOC duyet nghiem thu
 *     nhung KHONG duoc sua moc/chung cu/chung tu ma chinh ho dang nghiem thu
 *
 * Cach re nhat de tuan thu la ky luat, va ky luat khong song sot qua sau lan sua cua sau nguoi.
 * Cach dat la CAU TRUC: dich vu nghiem thu khong CAM duoc mot cai but nao de ma viet nham.
 */

/** Su that ve mot vong chay ma truc nghiem thu can — KHONG co gia cuoc, KHONG co toa do. */
export interface AcceptanceRunFacts {
  readonly id: string;
  readonly code: string;
  readonly status: VehicleRunStatus;
  readonly vehicleId: string;
  readonly businessDate: BusinessDate;
  readonly completedAt: string | null;
}

/**
 * CUA SO doc vong chay.
 *
 * `listCompletedRuns()` chu khong `list()`: hang cho nghiem thu chi co nghia voi nhung vong chay da
 * chay xong, va loc o day thay vi o tang doc lam cho cong "chua chay xong thi chua co gi de nghiem
 * thu" duoc phat bieu MOT lan chu khong lap lai o moi truy van.
 */
export abstract class AcceptanceMovementFacts {
  abstract findRun(runId: string): Promise<AcceptanceRunFacts | null>;
  abstract listCompletedRuns(): Promise<AcceptanceRunFacts[]>;
  /**
   * VONG CHAY cua mot CHUYEN v1, qua phep chieu da duoc chap nhan.
   *
   * `TransportTripRunLegLink` co khoa chinh la `tripId` va `legId` la `@unique`, nen duong nay
   * cho ra TOI DA MOT vong chay — khong phai mot danh sach. Do la mot su that cua mo hinh, khong
   * phai mot gia dinh: xem khoi chu thich cua bang do trong `schema.prisma`.
   *
   * `null` co HAI nghia, va ca hai deu la `null` mot cach trung thuc:
   *   · chuyen chua tung duoc chieu sang mo hinh v2 (chuyen v1 thuan tuy);
   *   · chuyen thue xe ngoai — `planTripProjection` TU CHOI chieu, vi xe khong phai cua B.
   *
   * Tang goi phai xu ly `null` thanh mot quyet dinh CO TEN, khong duoc lang le di qua.
   */
  abstract findRunForTrip(tripId: string): Promise<AcceptanceRunFacts | null>;
}

interface RunRow {
  readonly id: string;
  readonly code: string;
  readonly status: VehicleRunStatus;
  readonly vehicleId: string;
  readonly businessDate: string;
  readonly completedAt: string | null;
}

const toRunFacts = (run: RunRow): AcceptanceRunFacts => ({
  id: run.id,
  code: run.code,
  status: run.status,
  vehicleId: run.vehicleId,
  businessDate: run.businessDate as BusinessDate,
  completedAt: run.completedAt,
});

@Injectable()
export class AcceptanceMovementFactsAdapter extends AcceptanceMovementFacts {
  constructor(private readonly movement: MovementRepository) {
    super();
  }

  async findRun(runId: string): Promise<AcceptanceRunFacts | null> {
    const run = await this.movement.findRun(runId);
    return run ? toRunFacts(run) : null;
  }

  async listCompletedRuns(): Promise<AcceptanceRunFacts[]> {
    const runs = await this.movement.listRuns();
    return runs.filter((run) => run.status === 'COMPLETED').map(toRunFacts);
  }

  async findRunForTrip(tripId: string): Promise<AcceptanceRunFacts | null> {
    const link = await this.movement.findTripLink(tripId);
    if (!link) return null;

    const leg = await this.movement.findLeg(link.legId);
    if (!leg) return null;

    return this.findRun(leg.runId);
  }
}

/** Phap nhan ben A ton tai hay khong — mot cau hoi, mot cau tra loi. */
export abstract class AcceptanceCounterpartyFacts {
  abstract exists(counterpartyId: string): Promise<boolean>;
}

@Injectable()
export class AcceptanceCounterpartyFactsAdapter extends AcceptanceCounterpartyFacts {
  constructor(private readonly counterparties: CounterpartyRepository) {
    super();
  }

  async exists(counterpartyId: string): Promise<boolean> {
    return (await this.counterparties.find(counterpartyId)) !== null;
  }
}

/**
 * CHUNG TU VAN HANH cua mot vong chay — cong HEP, CHI DOC, va co y HEP.
 *
 * ============================================================================================
 * VI SAO CONG NAY TON TAI TRUOC KHI CO THU DE CAM VAO
 * ============================================================================================
 *
 * `#243` F2 so huu chung tu van hanh (`GATE_PASS`, `LOADING_SLIP`, `WEIGH_TICKET`,
 * `DELIVERY_RECEIPT`) va no CHUA vao `main` — do la mot su that da do, khong phai mot phong doan.
 * `#223` so huu vong doi tep va cung chua vao.
 *
 * `#268` I2 chi dung cach duy nhat trung thuc de di tiep:
 *
 *     *"Before #243 F2 lands: I may implement the acceptance domain core against a narrow
 *     read-only document/evidence port; do not create a temporary Transport document table."*
 *
 * Nen day la cai cong do. Khi F2 vao `main`, thu duy nhat phai doi la MOT dong buoc adapter trong
 * `transport-acceptance.module.ts` — khong mot luat mien nao, khong mot bang nao, khong mot bai
 * test nghiep vu nao.
 *
 * ============================================================================================
 * HAI CAU HOI, KHONG PHAI MOT
 * ============================================================================================
 *
 * `belongingTo` hoi *"nhung khoa NAY co thuoc ve vong chay KIA khong"* — do la cong chong chung cu
 * cua nguoi khac (bai I7 so 4). No KHONG hoi "khoa nay co ton tai khong": biet mot ma tep khong
 * bao gio la du de dung no lam can cu nghiem thu, va do dung la khac biet ma `#268` I2 doi
 * (*"knowing an opaque file ID must not be enough"*).
 *
 * `countFor` phuc vu hang cho: nguoi truc can biet mot vong chay CO chung tu hay khong TRUOC khi
 * mo no ra.
 */
export abstract class AcceptanceEvidenceFacts {
  /**
   * Loc `refs` con dung nhung khoa THUC SU thuoc vong chay nay va con hieu luc.
   *
   * Tra ve tap con chu khong `boolean`: tang goi can biet CAI NAO bi loai de noi lai cho nguoi
   * dung, va mot `false` chung se lam ho phai thu bo tung khoa mot.
   */
  abstract belongingTo(runId: string, refs: readonly string[]): Promise<readonly string[]>;
  abstract countFor(runId: string): Promise<number>;
}

/**
 * ADAPTER MAC DINH khi chua co mo hinh chung tu van hanh nao tren `main`.
 *
 * FAIL-CLOSED, va do la cau tra loi dung: khong khoa nao thuoc ve mot vong chay nao, nen moi lan
 * duyet theo can cu `DOCUMENT` deu bi tu choi bang `ACCEPTANCE_EVIDENCE_NOT_FOR_RUN`. Duong
 * `EXTERNAL_PHYSICAL_CONFIRMATION` van di duoc — va do la duong DUNG cho hom nay, vi hom nay B
 * that su chi co ban giay.
 *
 * Cai KHONG duoc lam o day: tra ve `refs` nguyen ven de "cho no chay duoc". Lam vay se bien mot
 * khoa bat ky nguoi dung go vao thanh mot can cu nghiem thu hop le — tuc dung cai lo hong ma bai
 * I7 so 4 va so 5 ton tai de chan.
 */
@Injectable()
export class NoOperationalDocumentsAdapter extends AcceptanceEvidenceFacts {
  async belongingTo(): Promise<readonly string[]> {
    return [];
  }

  async countFor(): Promise<number> {
    return 0;
  }
}
