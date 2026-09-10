import { randomUUID } from 'node:crypto';
import { storageUniqueViolation } from '../proof/proof-storage-conflict.js';
import type { UniqueIndexRef } from '../storage-conflict.js';
import type {
  Order,
  OrderStatus,
  RunAssignment,
  RunLeg,
  RunLegKind,
  RunLegStatus,
  TripOrderLink,
  TripRunLegLink,
  VehicleRun,
  VehicleRunStatus,
} from './movement.types.js';

/**
 * MA VONG CHAY la DUY NHAT toan he.
 *
 * `MovementService.createRun` da doc truoc bang `findRunByCode`, nhung mot phep kiem-roi-ghi co mot
 * khe hep giua hai buoc: hai yeu cau den cung luc deu doc thay "chua co" roi ca hai cung ghi. Chi
 * unique cua DB dong duoc khe do — va tang tren phai DICH duoc va cham do, neu khong nguoi dung
 * nhan `500` cho mot tinh huong ma cau tra loi dung la "ma nay da co roi".
 *
 * `#267` H3 dua bat bien chong lap cua no LEN chinh unique nay: ma vong chay cua mot lan nhan viec
 * tai dia diem A la mot bam tat dinh tu `(driverId, clientEventId)`.
 */
/**
 * KET QUA cua mot lan dong vong chay CO DIEU KIEN (`completeRunIfActive`).
 *
 * Hai truong, va ca hai deu can: `run` la su that SAU lan goi (de nguoi goi tra ve duoc ket qua
 * dung, du no thang hay thua), `transitioned` noi ai la nguoi da lam buoc chuyen.
 */
export interface RunCloseAttempt {
  readonly run: VehicleRun;
  /** `true` khi CHINH lan goi nay la lan ghi trang thai. */
  readonly transitioned: boolean;
}

export interface RunClosureCandidateQuery {
  /** Lan hoan thanh muon nhat phai da cu hon moc nay. */
  readonly completedBefore: Date;
  /**
   * Nguong nghi khach da khai, hoac `null`.
   *
   * `null` KHONG phai "khong loc gi": no nghia la khong con duong dong nao dua tren THOI GIAN, nen
   * ung vien phai la "co the dong duoc" chu khong chi "da xong viec" — xem chu thich cua
   * `listRunClosureCandidates`.
   */
  readonly idleHours: number | null;
  /** Nhan bai dang hoat dong, hoac `null` khi khach chua khai bai nao. */
  readonly depotLabel: string | null;
  readonly limit: number;
}

export const RUN_CODE: UniqueIndexRef = {
  indexName: 'TransportVehicleRun_code_key',
  model: 'TransportVehicleRun',
  column: 'code',
};

/* ----------------------------------------------------------------------------------------- *
 * DTO GHI. Quy uoc da co: `*.types.ts` giu mo hinh DOC, tep nay giu DTO GHI + cong + ban
 * trong-bo-nho.
 * ----------------------------------------------------------------------------------------- */

export interface CreateOrderInput {
  readonly code: string;
  readonly businessDate: string;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly customerId?: string | null;
  readonly cargoDescription?: string | null;
  readonly freightAmount?: number | null;
  readonly note?: string | null;
}

export interface UpdateOrderInput {
  readonly originLabel?: string;
  readonly destinationLabel?: string;
  readonly customerId?: string | null;
  readonly cargoDescription?: string | null;
  readonly freightAmount?: number | null;
  readonly note?: string | null;
}

export interface CancelOrderInput {
  readonly cancelledAt: Date;
  readonly cancellationReason: string;
}

export interface CreateRunInput {
  readonly code: string;
  readonly vehicleId: string;
  readonly businessDate: string;
  readonly note?: string | null;
}

export interface CancelRunInput {
  readonly cancelledAt: Date;
  readonly cancellationReason: string;
}

export interface CreateLegInput {
  readonly runId: string;
  readonly sequence: number;
  readonly kind: RunLegKind;
  readonly orderId: string | null;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly businessDate: string;
  readonly distanceKm?: number | null;
  /** #276 L6 — km DU KIEN. Khong bao gio ghi de len `distanceKm`. */
  readonly plannedDistanceKm?: number | null;
  readonly note?: string | null;
}

export interface AssignRunInput {
  readonly driverId: string;
  readonly effectiveFrom: Date;
  readonly assignedBy: string;
}

/** Ket qua mot lan doi lai xe: ban vua dong lai (neu co) va ban dang hieu luc. */
export interface RunAssignmentChange {
  readonly previous: RunAssignment | null;
  readonly current: RunAssignment;
}

/**
 * Mot lan chieu THUONG MAI: chuyen v1 -> DON v2 + lien ket, ghi TRON VEN trong mot giao dich.
 *
 * Tach khoi `ProjectTripInput` vi hai phep chieu tra loi hai cau hoi khac nhau va co dieu kien
 * khac nhau: phep chieu DIEU HANH doi mot chiec xe cua B (nen no tu choi `EXTERNAL_CARRIER`), phep
 * chieu THUONG MAI chi doi mot khach hang. Gop lam mot se lam chuyen thue nha xe ngoai khong co
 * duong nao co duoc nghia vu thuong mai cua no -- dung lo hong `#275` K5 dong lai.
 */
export interface ProjectTripOrderInput {
  readonly tripId: string;
  readonly projectedBy: string;
  readonly order: CreateOrderInput;
}

export interface TripOrderProjection {
  readonly link: TripOrderLink;
  readonly order: Order;
}

/** Mot lan chieu chuyen v1 -> v2, ghi TRON VEN trong mot giao dich. */
export interface ProjectTripInput {
  readonly tripId: string;
  readonly projectedBy: string;
  readonly order: CreateOrderInput | null;
  readonly run: CreateRunInput;
  /** Chang duoc chieu ra; `orderId` duoc dien sau khi don o tren duoc tao. */
  readonly leg: Omit<CreateLegInput, 'runId' | 'orderId'>;
}

export interface TripProjection {
  readonly link: TripRunLegLink;
  readonly run: VehicleRun;
  readonly leg: RunLeg;
  readonly order: Order | null;
}

/**
 * CONG LUU TRU cua mien van chuyen v2.
 *
 * KHONG co `delete` cho bat ky thuc the nao -- `GD-02` da chot huy THAY CHO xoa, va mot vong chay
 * bi xoa se lam moi con so km cua ky do khong tai lap duoc.
 */
export abstract class MovementRepository {
  abstract createOrder(input: CreateOrderInput): Promise<Order>;
  abstract updateOrder(id: string, patch: UpdateOrderInput): Promise<Order | null>;
  abstract findOrder(id: string): Promise<Order | null>;
  abstract findOrderByCode(code: string): Promise<Order | null>;
  abstract listOrders(): Promise<Order[]>;
  abstract setOrderStatus(id: string, status: OrderStatus, at: Date): Promise<Order | null>;
  abstract cancelOrder(id: string, input: CancelOrderInput): Promise<Order | null>;

  abstract createRun(input: CreateRunInput): Promise<VehicleRun>;
  abstract findRun(id: string): Promise<VehicleRun | null>;
  abstract findRunByCode(code: string): Promise<VehicleRun | null>;
  abstract listRuns(): Promise<VehicleRun[]>;
  /**
   * VONG CHAY GAN NHAT cua mot chiec xe — `#276` L3. Ke ca khi no da ket thuc.
   *
   * Tra ve ca vong chay da dong chu khong loc san, va do la co y: khau lap ke hoach phai PHAN BIET
   * duoc "xe nay chua co vong chay nao" voi "vong chay cu da dong roi". Hai tinh huong cho ra cung
   * mot ket qua (mot vong chay moi) nhung khac ly do, va `#276` L4 doi ghi ro rang he thong da
   * nhin thay lich su chu khong mo lai no.
   *
   * "Gan nhat" = `createdAt` lon nhat. Khong dung `businessDate`: hai vong chay cung ngay se hoa,
   * va thu tu tao la thu tu that.
   */
  abstract findLatestRunForVehicle(vehicleId: string): Promise<VehicleRun | null>;
  abstract setRunStatus(id: string, status: VehicleRunStatus, at: Date): Promise<VehicleRun | null>;
  /**
   * DONG vong chay — buoc chuyen CO DIEU KIEN, va la lop chan CUOI cung chong dong hai lan.
   *
   * `setRunStatus()` ghi theo KHOA CHINH: hai nguoi ghi song song deu thay `status = 'ACTIVE'`,
   * deu quyet dinh duoc phep dong, va ca hai deu ghi — ban sau ghi de `completedAt` cua ban truoc,
   * va so dau vet co hai dong `transport.run.close.system` cho mot lan dong. Do la mot cuoc dua
   * doc-roi-ghi, khong phai mot rang buoc.
   *
   * Ham nay chuyen phep kiem xuong chinh cau `UPDATE` (`WHERE status = 'ACTIVE'`), nen chi mot
   * nguoi ghi doi duoc trang thai. Nguoi thua nhan `transitioned: false` kem trang thai HIEN TAI —
   * mot ket qua binh thuong de hai worker cung chay mot luot quet khong sinh hai lan dong.
   *
   * `null` = khong tim thay vong chay. Phan biet duoc voi `transitioned: false` la ca diem.
   */
  abstract completeRunIfActive(id: string, at: Date): Promise<RunCloseAttempt | null>;
  abstract cancelRun(id: string, input: CancelRunInput): Promise<VehicleRun | null>;

  /**
   * UNG VIEN cho luot quet — `#293` R3.
   *
   * Tra ve mot TRANG GIOI HAN (`limit`) cac vong chay dang `ACTIVE` ma MOI chang deu da o trang
   * thai cuoi va lan hoan thanh MUON NHAT da cu hon `completedBefore`. Dieu kien nam trong cau truy
   * van chu khong nam trong bo nho: mot luot quet khoi phuc sau khi tien trinh chet phai tim lai
   * duoc dung tap do tu su that nguon, khong tu mot con tro song.
   *
   * Day la tap UNG VIEN, khong phai tap KET LUAN. Con ke hoach mo, con hang tren thung, con phien
   * cho — ba thu do khong nam trong hai bang nay, va `evaluateRunClosure()` moi la noi phan xu.
   *
   * Thu tu SAP XEP la tat dinh (`updatedAt`, roi `id`) de hai worker cung mot luot quet nhin thay
   * cung mot trang theo cung mot thu tu.
   *
   * ============================================================================================
   * VI SAO UNG VIEN PHAI LA "CO THE DONG DUOC", KHONG CHI "DA XONG VIEC"
   * ============================================================================================
   *
   * `take` chi lay MOT trang. Mot ung vien quet ma khong dong duoc se quay lai o luot sau voi
   * nguyen `updatedAt` cu, tuc no nam mai o dau trang va nhung vong chay phia sau khong bao gio
   * duoc nhin toi. Do la mot cach hong IM LANG, va no da duoc do bang mot bai kiem truoc khi sua.
   *
   * Truong hop nguy hiem nhat la nhung vong chay KHONG BAO GIO dong duoc bang thoi gian: khach
   * khong khai `closure.idleHours` thi mot chiec xe ket thuc viec o XA BAI se nam nguyen o trang
   * thai `holding` mai mai (`RunClosureFacts` co y lam dieu do — khong doan mot nguong khach chua
   * noi). Chung se chiem cho trong trang vinh vien.
   *
   * Nen khi khach CHUA khai nguong nghi, ung vien bi thu hep ve nhung vong chay CO THE dong duoc:
   * mot chang da hoan thanh ket thuc tai BAI XE dang hoat dong. Do la mot phep LOC THO (so sanh
   * chuoi, khong phai `sameSite()`), va no duoc phep sai theo huong BO SOT: mot vong chay ve bai
   * voi nhan bai lech khoang trang van duoc duong SU KIEN dong ngay; luot quet chi la luoi an toan
   * cho su kien da that lac, va no khong bao gio duoc phep dong bua mot vong chay chi vi doan sai.
   *
   * Khi khach CO khai nguong nghi thi moi vong chay het viec deu la ung vien that: chu so 0 o
   * `updatedAt` la moc thoi gian, va "cu hon nguong" la mot su that se den.
   */
  abstract listRunClosureCandidates(query: RunClosureCandidateQuery): Promise<VehicleRun[]>;

  abstract createLeg(input: CreateLegInput): Promise<RunLeg>;
  abstract findLeg(id: string): Promise<RunLeg | null>;
  abstract listLegs(runId: string): Promise<RunLeg[]>;
  abstract listLegsByOrder(orderId: string): Promise<RunLeg[]>;
  abstract setLegStatus(id: string, status: RunLegStatus, at: Date): Promise<RunLeg | null>;

  abstract assignRun(runId: string, input: AssignRunInput): Promise<RunAssignmentChange>;
  abstract listRunAssignments(runId: string): Promise<RunAssignment[]>;
  abstract activeRunAssignment(runId: string): Promise<RunAssignment | null>;
  /**
   * VONG CHAY CHUA KET THUC ma lai xe nay DANG cam — `#267` H3.
   *
   * Tra ve mot DANH SACH chu khong `VehicleRun | null`, va do la mot lua chon co y: mo hinh hom
   * nay KHONG cam mot lai xe cam hai vong chay chua ket thuc (khong unique nao noi dieu do), nen
   * mot chu ky `| null` se lang le giau mat truong hop thu hai. `#267` H3 doi phai NHIN THAY no de
   * tu choi tao them; giau di la cach chac chan nhat de mot ngay nao do tao ra cai thu ba.
   *
   * "DANG cam" = ban phan cong con hieu luc (`effectiveTo IS NULL`) VA vong chay chua o diem cuoi.
   * Mot vong chay da `COMPLETED`/`CANCELLED` khong chan ai lam gi nua.
   */
  abstract listOpenRunsForDriver(driverId: string): Promise<VehicleRun[]>;

  /**
   * DON THUONG MAI cua mot chuyen v1 -- duong tra loi KHONG di qua vong chay.
   *
   * `#275` K5 dua cau hoi nay len grain quyet dinh cua cong doi soat, nen no phai tra loi duoc ca
   * cho mot chuyen thue nha xe ngoai (thu khong bao gio co vong chay). Xem `TripOrderLink`.
   */
  abstract findOrderLink(tripId: string): Promise<TripOrderLink | null>;
  /**
   * CHIEU THUONG MAI: tao don + lien ket trong MOT giao dich, TAT DINH va LAP LAI DUOC.
   *
   * Goi lai tren mot chuyen da chieu tra ve chinh ban cu (`tripId` la khoa chinh cua lien ket).
   */
  abstract projectTripOrder(input: ProjectTripOrderInput): Promise<TripOrderProjection>;
  /**
   * CHANG cua NHIEU don trong mot lan -- hang cho ket thuc khong duoc goi N+1 lan.
   *
   * Cung ly le voi `findTripLinksByLegs`: mot hang cho hai muoi don se thanh hai muoi lan hoi neu
   * ky mot ham `byOrder(id)`, va cai gia do chi lo ra khi du lieu that du lon.
   */
  abstract listLegsByOrders(orderIds: readonly string[]): Promise<RunLeg[]>;

  abstract findTripLink(tripId: string): Promise<TripRunLegLink | null>;
  /**
   * TRA CUU NGUOC: tu CHANG ra CHUYEN. Nhan ca lo, khong nhan tung chang.
   *
   * `R8` can duong nay de quy chi phi `TX-03` (gan vao CHUYEN) ve grain CHANG. Nhan mot mang thay
   * vi mot ma la co y: mot vong chay muoi chang se thanh muoi lan hoi neu ky mot ham `byLeg(id)`,
   * va cai gia do roi dung vao bao cao — cho de ai cung goi trong mot vong lap.
   */
  abstract findTripLinksByLegs(legIds: readonly string[]): Promise<TripRunLegLink[]>;
  abstract findProjection(tripId: string): Promise<TripProjection | null>;
  /** Ghi ca bon hang (don tuy chon, vong chay, chang, lien ket) trong MOT giao dich. */
  abstract projectTrip(input: ProjectTripInput): Promise<TripProjection>;
}

/* ----------------------------------------------------------------------------------------- *
 * BAN TRONG BO NHO -- cuong che DUNG NHUNG bat bien ma ban Prisma cuong che, de che do
 * `PERSISTENCE=memory` khong bao gio de lot mot hang ma Postgres se tu choi.
 * ----------------------------------------------------------------------------------------- */

const iso = (value: Date): string => value.toISOString();

export class InMemoryMovementRepository extends MovementRepository {
  private readonly orders = new Map<string, Order>();
  private readonly runs = new Map<string, VehicleRun>();
  private readonly legs = new Map<string, RunLeg>();
  private readonly assignments = new Map<string, RunAssignment>();
  private readonly links = new Map<string, TripRunLegLink>();
  private readonly orderLinks = new Map<string, TripOrderLink>();

  async createOrder(input: CreateOrderInput): Promise<Order> {
    const now = iso(new Date());
    const order: Order = {
      id: randomUUID(),
      code: input.code,
      status: 'OPEN',
      businessDate: input.businessDate,
      customerId: input.customerId ?? null,
      originLabel: input.originLabel,
      destinationLabel: input.destinationLabel,
      cargoDescription: input.cargoDescription ?? null,
      freightAmount: input.freightAmount ?? null,
      currencyCode: 'VND',
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
      cancelledAt: null,
      cancellationReason: null,
    };
    this.orders.set(order.id, order);
    return order;
  }

  async updateOrder(id: string, patch: UpdateOrderInput): Promise<Order | null> {
    const current = this.orders.get(id);
    if (!current) return null;
    const next: Order = {
      ...current,
      originLabel: patch.originLabel ?? current.originLabel,
      destinationLabel: patch.destinationLabel ?? current.destinationLabel,
      customerId: patch.customerId === undefined ? current.customerId : patch.customerId,
      cargoDescription:
        patch.cargoDescription === undefined ? current.cargoDescription : patch.cargoDescription,
      freightAmount:
        patch.freightAmount === undefined ? current.freightAmount : patch.freightAmount,
      note: patch.note === undefined ? current.note : patch.note,
      updatedAt: iso(new Date()),
    };
    this.orders.set(id, next);
    return next;
  }

  async findOrder(id: string): Promise<Order | null> {
    return this.orders.get(id) ?? null;
  }

  async findOrderByCode(code: string): Promise<Order | null> {
    for (const order of this.orders.values()) if (order.code === code) return order;
    return null;
  }

  async listOrders(): Promise<Order[]> {
    return [...this.orders.values()].sort(
      (left, right) =>
        right.businessDate.localeCompare(left.businessDate) || left.code.localeCompare(right.code),
    );
  }

  async setOrderStatus(id: string, status: OrderStatus, at: Date): Promise<Order | null> {
    const current = this.orders.get(id);
    if (!current) return null;
    const next: Order = { ...current, status, updatedAt: iso(at) };
    this.orders.set(id, next);
    return next;
  }

  async cancelOrder(id: string, input: CancelOrderInput): Promise<Order | null> {
    const current = this.orders.get(id);
    if (!current) return null;
    const next: Order = {
      ...current,
      status: 'CANCELLED',
      cancelledAt: iso(input.cancelledAt),
      cancellationReason: input.cancellationReason,
      updatedAt: iso(input.cancelledAt),
    };
    this.orders.set(id, next);
    return next;
  }

  async createRun(input: CreateRunInput): Promise<VehicleRun> {
    // Ban trong bo nho cuong che CUNG bat bien voi Postgres. Khong co dong nay thi bai chong lap
    // cua `#267` H3 se XANH o che do `PERSISTENCE=prisma` va DO o che do `memory` — va che do
    // `memory` la mot duong chay that (demo, CI khong co CSDL), khong phai mot ban gia de test.
    for (const existing of this.runs.values()) {
      if (existing.code === input.code) throw storageUniqueViolation(RUN_CODE);
    }
    const now = iso(new Date());
    const run: VehicleRun = {
      id: randomUUID(),
      code: input.code,
      vehicleId: input.vehicleId,
      status: 'PLANNED',
      businessDate: input.businessDate,
      startedAt: null,
      completedAt: null,
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
      cancelledAt: null,
      cancellationReason: null,
    };
    this.runs.set(run.id, run);
    return run;
  }

  async findRun(id: string): Promise<VehicleRun | null> {
    return this.runs.get(id) ?? null;
  }

  async findRunByCode(code: string): Promise<VehicleRun | null> {
    for (const run of this.runs.values()) if (run.code === code) return run;
    return null;
  }

  async listRuns(): Promise<VehicleRun[]> {
    return [...this.runs.values()].sort(
      (left, right) =>
        right.businessDate.localeCompare(left.businessDate) || left.code.localeCompare(right.code),
    );
  }

  async findLatestRunForVehicle(vehicleId: string): Promise<VehicleRun | null> {
    let latest: VehicleRun | null = null;
    for (const run of this.runs.values()) {
      if (run.vehicleId !== vehicleId) continue;
      if (latest === null || run.createdAt > latest.createdAt) latest = run;
    }
    return latest;
  }

  async setRunStatus(id: string, status: VehicleRunStatus, at: Date): Promise<VehicleRun | null> {
    const current = this.runs.get(id);
    if (!current) return null;
    const next: VehicleRun = {
      ...current,
      status,
      startedAt: status === 'ACTIVE' ? iso(at) : current.startedAt,
      completedAt: status === 'COMPLETED' ? iso(at) : current.completedAt,
      updatedAt: iso(at),
    };
    this.runs.set(id, next);
    return next;
  }

  /**
   * Ban trong bo nho cua phep dong CO DIEU KIEN.
   *
   * `Map` cua Node la don luong, nen phep `get` roi `set` o day KHONG co khe ho giua hai buoc —
   * nhung no van phai kiem `status === 'ACTIVE'` y nhu ban Prisma. Ly do khong phai de chong dua
   * (khong co dua), ma de hai ban chay CUNG MOT LUAT: `PERSISTENCE=memory` la mot duong chay that,
   * va mot ban de lot mot lan dong thu hai se lam bai kiem dong thoi XANH o mot che do va DO o che
   * do kia.
   */
  async completeRunIfActive(id: string, at: Date): Promise<RunCloseAttempt | null> {
    const current = this.runs.get(id);
    if (!current) return null;
    if (current.status !== 'ACTIVE') return { run: current, transitioned: false };

    const next: VehicleRun = { ...current, status: 'COMPLETED', completedAt: iso(at), updatedAt: iso(at) };
    this.runs.set(id, next);
    return { run: next, transitioned: true };
  }

  async listRunClosureCandidates(query: RunClosureCandidateQuery): Promise<VehicleRun[]> {
    const threshold = iso(query.completedBefore);
    const candidates = [...this.runs.values()].filter((run) => {
      if (run.status !== 'ACTIVE') return false;
      const legs = this.legsOf(run.id);
      if (legs.length === 0) return false;

      let lastCompletedAt: string | null = null;
      for (const leg of legs) {
        if (leg.status === 'CANCELLED') continue;
        if (leg.status !== 'COMPLETED' || leg.completedAt === null) return false;
        if (lastCompletedAt === null || leg.completedAt > lastCompletedAt) {
          lastCompletedAt = leg.completedAt;
        }
      }
      if (lastCompletedAt === null || lastCompletedAt > threshold) return false;

      /*
       * PHEP LOC "CO THE DONG DUOC" — cung menh de voi ban Prisma, va cung ly do.
       *
       * Khach khong khai nguong nghi thi mot chiec xe xong viec o xa bai nam nguyen `holding` mai
       * mai. No khong duoc chiem mot cho trong trang: do la cach mot luot quet co tran bien thanh
       * mot luot quet BO SOT nhung vong chay phia sau, va bo sot do im lang.
       */
      if (query.idleHours === null) {
        if (query.depotLabel === null) return false;
        return legs.some(
          (leg) => leg.status === 'COMPLETED' && leg.destinationLabel === query.depotLabel,
        );
      }
      return true;
    });

    return candidates
      .sort(
        (left, right) =>
          left.updatedAt.localeCompare(right.updatedAt) || left.id.localeCompare(right.id),
      )
      .slice(0, query.limit);
  }

  private legsOf(runId: string): RunLeg[] {
    return [...this.legs.values()].filter((leg) => leg.runId === runId);
  }

  async cancelRun(id: string, input: CancelRunInput): Promise<VehicleRun | null> {
    const current = this.runs.get(id);
    if (!current) return null;
    const next: VehicleRun = {
      ...current,
      status: 'CANCELLED',
      cancelledAt: iso(input.cancelledAt),
      cancellationReason: input.cancellationReason,
      updatedAt: iso(input.cancelledAt),
    };
    this.runs.set(id, next);
    return next;
  }

  async createLeg(input: CreateLegInput): Promise<RunLeg> {
    const now = iso(new Date());
    const leg: RunLeg = {
      id: randomUUID(),
      runId: input.runId,
      sequence: input.sequence,
      kind: input.kind,
      status: 'PLANNED',
      // Cuong che cung bat bien voi `TransportRunLeg_empty_carries_no_order`: ban trong bo nho
      // KHONG duoc de lot mot hang ma Postgres se tu choi.
      orderId: input.kind === 'EMPTY' ? null : input.orderId,
      originLabel: input.originLabel,
      destinationLabel: input.destinationLabel,
      businessDate: input.businessDate,
      distanceKm: input.distanceKm ?? null,
      plannedDistanceKm: input.plannedDistanceKm ?? null,
      startedAt: null,
      completedAt: null,
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.legs.set(leg.id, leg);
    return leg;
  }

  async findLeg(id: string): Promise<RunLeg | null> {
    return this.legs.get(id) ?? null;
  }

  async listLegs(runId: string): Promise<RunLeg[]> {
    return [...this.legs.values()]
      .filter((leg) => leg.runId === runId)
      .sort((left, right) => left.sequence - right.sequence);
  }

  async listLegsByOrder(orderId: string): Promise<RunLeg[]> {
    return [...this.legs.values()]
      .filter((leg) => leg.orderId === orderId)
      .sort((left, right) => left.sequence - right.sequence);
  }

  async setLegStatus(id: string, status: RunLegStatus, at: Date): Promise<RunLeg | null> {
    const current = this.legs.get(id);
    if (!current) return null;
    const next: RunLeg = {
      ...current,
      status,
      startedAt: status === 'IN_TRANSIT' ? iso(at) : current.startedAt,
      completedAt: status === 'COMPLETED' ? iso(at) : current.completedAt,
      updatedAt: iso(at),
    };
    this.legs.set(id, next);
    return next;
  }

  async assignRun(runId: string, input: AssignRunInput): Promise<RunAssignmentChange> {
    const active = await this.activeRunAssignment(runId);
    if (active) {
      const closed: RunAssignment = { ...active, effectiveTo: iso(input.effectiveFrom) };
      this.assignments.set(closed.id, closed);
    }
    const current: RunAssignment = {
      id: randomUUID(),
      runId,
      driverId: input.driverId,
      effectiveFrom: iso(input.effectiveFrom),
      effectiveTo: null,
      assignedBy: input.assignedBy,
      createdAt: iso(new Date()),
    };
    this.assignments.set(current.id, current);
    return { previous: active, current };
  }

  async listRunAssignments(runId: string): Promise<RunAssignment[]> {
    return [...this.assignments.values()]
      .filter((entry) => entry.runId === runId)
      .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));
  }

  async activeRunAssignment(runId: string): Promise<RunAssignment | null> {
    for (const entry of this.assignments.values()) {
      if (entry.runId === runId && entry.effectiveTo === null) return entry;
    }
    return null;
  }

  async listOpenRunsForDriver(driverId: string): Promise<VehicleRun[]> {
    const runIds = [...this.assignments.values()]
      .filter((entry) => entry.driverId === driverId && entry.effectiveTo === null)
      .map((entry) => entry.runId);
    return [...new Set(runIds)]
      .map((runId) => this.runs.get(runId))
      .filter(
        (run): run is VehicleRun =>
          run !== undefined && run.status !== 'COMPLETED' && run.status !== 'CANCELLED',
      )
      .sort((left, right) => left.code.localeCompare(right.code));
  }

  async findTripLink(tripId: string): Promise<TripRunLegLink | null> {
    return this.links.get(tripId) ?? null;
  }

  async findOrderLink(tripId: string): Promise<TripOrderLink | null> {
    return this.orderLinks.get(tripId) ?? null;
  }

  async projectTripOrder(input: ProjectTripOrderInput): Promise<TripOrderProjection> {
    const existing = this.orderLinks.get(input.tripId);
    if (existing) {
      const order = this.orders.get(existing.orderId);
      // Khong the xay ra: lien ket chi duoc ghi cung luc voi don. Nem thay vi tra ve mot ban thu
      // hai -- mot lien ket tro toi hu vo la mot loi luu tru, khong phai mot lan chieu moi.
      if (!order) throw new Error(`TripOrderLink ${input.tripId} tro toi mot don khong ton tai`);
      return { link: existing, order };
    }

    const order = await this.createOrder(input.order);
    const link: TripOrderLink = {
      tripId: input.tripId,
      orderId: order.id,
      projectedBy: input.projectedBy,
      createdAt: iso(new Date()),
    };
    this.orderLinks.set(link.tripId, link);
    return { link, order };
  }

  async listLegsByOrders(orderIds: readonly string[]): Promise<RunLeg[]> {
    const wanted = new Set(orderIds);
    return [...this.legs.values()]
      .filter((leg) => leg.orderId !== null && wanted.has(leg.orderId))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  async findTripLinksByLegs(legIds: readonly string[]): Promise<TripRunLegLink[]> {
    const wanted = new Set(legIds);
    return [...this.links.values()].filter((link) => wanted.has(link.legId));
  }

  async findProjection(tripId: string): Promise<TripProjection | null> {
    const link = this.links.get(tripId);
    if (!link) return null;
    const leg = this.legs.get(link.legId);
    if (!leg) return null;
    const run = this.runs.get(leg.runId);
    if (!run) return null;
    return { link, run, leg, order: leg.orderId ? (this.orders.get(leg.orderId) ?? null) : null };
  }

  async projectTrip(input: ProjectTripInput): Promise<TripProjection> {
    const order = input.order ? await this.createOrder(input.order) : null;
    const run = await this.createRun(input.run);
    const leg = await this.createLeg({ ...input.leg, runId: run.id, orderId: order?.id ?? null });
    const link: TripRunLegLink = {
      tripId: input.tripId,
      legId: leg.id,
      projectedBy: input.projectedBy,
      createdAt: iso(new Date()),
    };
    this.links.set(link.tripId, link);
    /*
     * Phep chieu DIEU HANH cung ghi lien ket THUONG MAI khi no vua tao ra mot don. Neu khong, mot
     * chuyen noi bo se co hai duong tra loi cau hoi "don cua chuyen nay la don nao" (qua chang, va
     * qua lien ket) va hai duong do se lech nhau ngay lan dau ai do sua mot ben. MOT duong duy nhat
     * di qua `TripOrderLink`.
     */
    if (order) {
      this.orderLinks.set(input.tripId, {
        tripId: input.tripId,
        orderId: order.id,
        projectedBy: input.projectedBy,
        createdAt: iso(new Date()),
      });
    }
    return { link, run, leg, order };
  }
}
