import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../business-date.js';
import { CounterpartyRepository } from '../counterparty/counterparty.repository.js';
import { MovementRepository } from '../movement/movement.repository.js';
import type { OrderStatus } from '../movement/movement.types.js';

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
 * O day dieu do quan trong hon o cho khac. `#275` K3 dat ra mot bat bien tach nhiem vu:
 *
 *     Ke toan DUOC quyet ket thuc don
 *     nhung KHONG duoc sua moc/chung cu/chung tu ma chinh ho dang xem
 *
 * Cach re nhat de tuan thu la ky luat, va ky luat khong song sot qua sau lan sua cua sau nguoi.
 * Cach dat la CAU TRUC: dich vu ket thuc don khong CAM duoc mot cai but nao de ma viet nham.
 */

/**
 * Su that ve mot DON ma truc ket thuc can — KHONG co gia cuoc, KHONG co toa do.
 *
 * `freightAmount` CO Y vang mat. `#275` K4 doi hang cho hien "receipt/evidence summary" chu khong
 * doi hien tien; mang doanh thu vao day se bien mot man hinh nghiem thu thanh mot bao cao cong no —
 * hai be mat, hai quyen.
 */
export interface AcceptanceOrderFacts {
  readonly id: string;
  readonly code: string;
  readonly status: OrderStatus;
  readonly customerId: string | null;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly businessDate: BusinessDate;
}

/**
 * NGU CANH DIEU HANH cua mot don — vong chay nao dang cho no, xe nao.
 *
 * `#275` K4: *"Run may be visible only as advanced/debug context, not required input."* Kieu nay
 * ton tai RIENG, khong nhap vao `AcceptanceOrderFacts`, chinh vi the: mot don khong co vong chay
 * nao (thue nha xe ngoai, hoac chua dieu xe) van la mot don ket thuc duoc, va cau truc phai noi ra
 * dieu do thay vi de mot truong `runCode: string` bat buoc am chi dieu nguoc lai.
 */
export interface AcceptanceOrderContext {
  readonly orderId: string;
  readonly runCode: string | null;
  readonly vehicleId: string | null;
}

/**
 * CUA SO doc DON.
 *
 * `listCompletableOrders()` chu khong `listOrders()`: hang cho ket thuc chi co nghia voi nhung don
 * da giao xong, va loc o day thay vi o tang doc lam cho cong "chua giao xong thi chua co gi de ket
 * thuc" duoc phat bieu MOT lan chu khong lap lai o moi truy van.
 *
 * `findOrderForTrip()` la duong ma CONG DOI SOAT di: nguon quyet toan hom nay co khoa la mot
 * `TransportTrip` v1, va cau hoi "don thuong mai cua nguon nay la don nao" phai tra loi duoc MA
 * KHONG di qua vong chay. Do la ca diem cua `#275` K5 — mot chuyen thue nha xe ngoai khong bao gio
 * co vong chay, nhung no van co mot nghia vu thuong mai voi khach.
 */
export abstract class AcceptanceMovementFacts {
  abstract findOrder(orderId: string): Promise<AcceptanceOrderFacts | null>;
  abstract findOrderForTrip(tripId: string): Promise<AcceptanceOrderFacts | null>;
  abstract listCompletableOrders(): Promise<AcceptanceOrderFacts[]>;
  /** Ngu canh dieu hanh cho CA LO don — hang cho khong duoc goi N+1 lan. */
  abstract contextForOrders(
    orderIds: readonly string[],
  ): Promise<readonly AcceptanceOrderContext[]>;
}

interface OrderRow {
  readonly id: string;
  readonly code: string;
  readonly status: OrderStatus;
  readonly customerId: string | null;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly businessDate: string;
}

const toOrderFacts = (order: OrderRow): AcceptanceOrderFacts => ({
  id: order.id,
  code: order.code,
  status: order.status,
  customerId: order.customerId,
  originLabel: order.originLabel,
  destinationLabel: order.destinationLabel,
  businessDate: order.businessDate as BusinessDate,
});

@Injectable()
export class AcceptanceMovementFactsAdapter extends AcceptanceMovementFacts {
  constructor(private readonly movement: MovementRepository) {
    super();
  }

  async findOrder(orderId: string): Promise<AcceptanceOrderFacts | null> {
    const order = await this.movement.findOrder(orderId);
    return order ? toOrderFacts(order) : null;
  }

  /**
   * `TransportTripOrderLink` co khoa chinh la `tripId` va `orderId` la `@unique`, nen duong nay cho
   * ra TOI DA MOT don — khong phai mot danh sach. Do la mot su that cua mo hinh, khong phai mot gia
   * dinh: xem khoi chu thich cua bang do trong `schema.prisma`.
   *
   * `null` co nghia DUY NHAT: chuyen nay chua co nghia vu thuong mai nao duoc khai. Tang goi phai
   * xu ly no thanh mot quyet dinh CO TEN va DONG CONG — `#275` K5 cam de no thanh mot duong vong.
   */
  async findOrderForTrip(tripId: string): Promise<AcceptanceOrderFacts | null> {
    const link = await this.movement.findOrderLink(tripId);
    if (!link) return null;
    return this.findOrder(link.orderId);
  }

  async listCompletableOrders(): Promise<AcceptanceOrderFacts[]> {
    const orders = await this.movement.listOrders();
    return orders.filter((order) => order.status === 'FULFILLED').map(toOrderFacts);
  }

  async contextForOrders(orderIds: readonly string[]): Promise<readonly AcceptanceOrderContext[]> {
    if (orderIds.length === 0) return [];

    const legs = await this.movement.listLegsByOrders(orderIds);
    if (legs.length === 0) return [];

    const runs = new Map((await this.movement.listRuns()).map((run) => [run.id, run]));

    /*
     * Mot don co the trai tren NHIEU chang (chuyen tai, ghep xe) — xem chu thich cua
     * `TransportRunLeg`. Ngu canh lay chang DAU TIEN theo thu tu on dinh: no chi de nguoi truc nhan
     * ra viec, khong tham gia vao mot quyet dinh nao. Gop nhieu vong chay vao mot o se lam mot dong
     * hang cho dai ra ma khong tra loi them cau hoi nao.
     */
    const seen = new Set<string>();
    const rows: AcceptanceOrderContext[] = [];
    for (const leg of legs) {
      if (leg.orderId === null || seen.has(leg.orderId)) continue;
      seen.add(leg.orderId);
      const run = runs.get(leg.runId) ?? null;
      rows.push({
        orderId: leg.orderId,
        runCode: run?.code ?? null,
        vehicleId: run?.vehicleId ?? null,
      });
    }
    return rows;
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
 * CHUNG TU VAN HANH cua mot DON — cong HEP, CHI DOC, va co y HEP.
 *
 * ============================================================================================
 * VI SAO CONG NAY TON TAI TRUOC KHI CO THU DE CAM VAO
 * ============================================================================================
 *
 * `#243`/Lane O so huu chung tu van hanh (`GATE_PASS`, `LOADING_SLIP`, `WEIGH_TICKET`,
 * `DELIVERY_RECEIPT`) va no CHUA vao `main` — do la mot su that da do, khong phai mot phong doan.
 * `#223`/Lane P so huu vong doi tep va cung chua vao.
 *
 * `#275` K2 chi dung cach duy nhat trung thuc de di tiep:
 *
 *     *"Support the existing fail-closed evidence seam: accepted `DELIVERY_RECEIPT` File ID when
 *     Lane O/P source exists; explicit auditable `EXTERNAL_PHYSICAL_CONFIRMATION` when the paper is
 *     physically handled but no digital File exists yet."*
 *
 * Nen day la cai cong do. Khi O/P vao `main`, thu duy nhat phai doi la MOT dong buoc adapter trong
 * `transport-acceptance.module.ts` — khong mot luat mien nao, khong mot bang nao, khong mot bai
 * test nghiep vu nao.
 *
 * ============================================================================================
 * HAI CAU HOI, KHONG PHAI MOT
 * ============================================================================================
 *
 * `belongingTo` hoi *"nhung khoa NAY co thuoc ve DON KIA khong"* — do la cong chong chung cu cua
 * don khac (`#275` K8 bai 6: *"Order A evidence cannot complete Order B"*). No KHONG hoi "khoa nay
 * co ton tai khong": biet mot ma tep khong bao gio la du de dung no lam can cu, va do dung la khac
 * biet ma `#275` K2 doi (*"Do not let a raw storage locator satisfy the gate"*).
 *
 * `countFor` phuc vu hang cho: nguoi truc can biet mot don CO chung tu hay khong TRUOC khi mo no ra.
 */
export abstract class AcceptanceEvidenceFacts {
  /**
   * Loc `refs` con dung nhung khoa THUC SU thuoc don nay va con hieu luc.
   *
   * Tra ve tap con chu khong `boolean`: tang goi can biet CAI NAO bi loai de noi lai cho nguoi
   * dung, va mot `false` chung se lam ho phai thu bo tung khoa mot.
   */
  abstract belongingTo(orderId: string, refs: readonly string[]): Promise<readonly string[]>;
  abstract countFor(orderId: string): Promise<number>;
}

/**
 * ADAPTER MAC DINH khi chua co mo hinh chung tu van hanh nao tren `main`.
 *
 * FAIL-CLOSED, va do la cau tra loi dung: khong khoa nao thuoc ve mot don nao, nen moi lan ket thuc
 * theo can cu `DOCUMENT` deu bi tu choi bang `ACCEPTANCE_EVIDENCE_NOT_FOR_ORDER`. Duong
 * `EXTERNAL_PHYSICAL_CONFIRMATION` van di duoc — va do la duong DUNG cho hom nay, vi hom nay B
 * that su chi co ban giay.
 *
 * Cai KHONG duoc lam o day: tra ve `refs` nguyen ven de "cho no chay duoc". Lam vay se bien mot
 * khoa bat ky nguoi dung go vao thanh mot can cu hop le — tuc dung cai lo hong ma `#275` K8 bai 6,
 * 7 va 8 ton tai de chan.
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
