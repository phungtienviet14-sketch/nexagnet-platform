import type { BusinessDate } from '../business-date.js';
import { addBusinessDays } from '../business-date.js';
import type { ExpenseFundingSource } from '../costing/driver-fund-ledger.js';
import type { FuelReviewReason } from '../fuel/fuel-lifecycle.js';
import {
  computeConsumption,
  exceedsConsumptionNorm,
  litersToUnits,
} from '../fuel/fuel-quantity.js';
import type { TripKind, TripStatus } from '../trips/trip-lifecycle.js';
import type { DemoMonthDataset } from './demo-dataset.js';

/**
 * BO DU LIEU -> KE HOACH GHI. Mot ham THUAN, khong cham DB, khong doc dong ho.
 *
 * ---------------------------------------------------------------------------
 * VI SAO TACH "KE HOACH" RA KHOI "GHI".
 *
 * Toan bo phan kho cua mot thang van hanh mau nam o cho tinh: dong ho odo phai tang dan hop ly,
 * tieu hao phai ra con so nguoi doc tin duoc, cong no phai qua han vi LICH chu khong vi mot co.
 * Neu nhung phep tinh do nam xen giua cac lenh `prisma.create`, thi cach duy nhat de kiem chung
 * la dung mot Postgres that — va mot bo test can Postgres se khong chay o may cua nguoi sua no.
 *
 * Tach ra, `buildDemoPlan()` kiem duoc bang mot bai test thuong: cho vao mot bo du lieu, doi chieu
 * tung con so di ra. Tang ghi ben duoi chi con mot viec: chep ke hoach vao bang.
 *
 * ---------------------------------------------------------------------------
 * MOC NGAY LA THAM SO, KHONG PHAI `new Date()`.
 *
 * Cung mot moc cho ra cung mot ke hoach, tung dong — do la nghia cua "tat dinh" ma #90 doi hoi.
 * Nhung moc do KHONG bi dong cung trong goi khach: mot bo du lieu dong cung ngay thang chi dung
 * duoc mot lan roi hong dan, va "giay to sap het han" se thanh "da het han het" sau mot thang.
 */

export interface DemoPlanContext {
  /** Ngay nghiep vu lam moc. Moi `day` trong goi khach la do lech so voi ngay nay. */
  readonly anchor: BusinessDate;
  /** Dinh muc L/100km theo hang xe — tu `policies.transportFuel.consumption`. */
  readonly consumptionNorms: Readonly<Record<string, number>>;
  /** Vuot dinh muc bao nhieu phan tram thi danh dau can kiem tra. */
  readonly consumptionTolerancePercent: number;
}

export interface PlannedVehicle {
  readonly ref: string;
  readonly registrationPlate: string;
  readonly vehicleClass: string;
  readonly allowedPayloadKg: number;
  /** Odo CUOI KY — bang odo dau ky cong quang duong moi chuyen cua xe do. */
  readonly currentOdoKm: number;
}

export interface PlannedDriver {
  readonly ref: string;
  readonly fullName: string;
  readonly phone: string;
  readonly licenceClass: string;
  readonly licenceExpiry: BusinessDate;
  readonly login: string;
  /** Xe phu trach thuong xuyen — sinh mot ban gan dang hieu luc. */
  readonly vehicleRef: string | null;
}

export interface PlannedCustomer {
  readonly ref: string;
  readonly name: string;
  readonly phone: string;
  readonly address: string;
  readonly taxCode: string;
  readonly paymentTermDays: number;
  readonly creditLimit: number;
}

export interface PlannedSupplier {
  readonly ref: string;
  readonly name: string;
  readonly code: string;
  readonly phone: string;
  readonly address: string;
  readonly taxCode: string;
}

export interface PlannedPartner {
  readonly ref: string;
  readonly name: string;
  readonly phone: string;
  readonly roles: readonly ('CARRIER' | 'ORDER_REFERRER')[];
}

export interface PlannedCommissionRule {
  readonly ref: string;
  readonly partnerRef: string;
  readonly calcKind: 'PERCENTAGE' | 'FIXED';
  readonly rateBasisPoints: number | null;
  readonly fixedAmount: number | null;
  readonly effectiveFrom: BusinessDate;
}

export interface PlannedExpense {
  readonly categoryCode: string;
  readonly amount: number;
  readonly fundedBy: ExpenseFundingSource;
}

export interface PlannedFuelEntry {
  /** Khoa tat dinh trong pham vi ke hoach — tang ghi doi no thanh id that. */
  readonly key: string;
  readonly supplierRef: string;
  readonly litersUnits: number;
  readonly amount: number;
  readonly odometerKm: number;
  readonly previousOdometerKm: number | null;
  readonly consumptionUnits: number | null;
  readonly reviewReasons: readonly FuelReviewReason[];
  /** So tien ma BANG KE ghi cho lan do nay — `null` = bang ke khong co dong nao. */
  readonly statementAmount: number | null;
}

export interface PlannedTrip {
  /** Ma kich ban cua #90 — `null` voi cac chuyen nen. */
  readonly scenarioId: string | null;
  readonly code: string;
  readonly kind: TripKind;
  readonly status: TripStatus;
  readonly businessDate: BusinessDate;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly cargoDescription: string;
  readonly distanceKm: number;
  readonly freightAmount: number;
  readonly customerRef: string;
  readonly vehicleRef: string | null;
  readonly driverRef: string | null;
  readonly carrierRef: string | null;
  readonly referrerRef: string | null;
  /** Gia phai tra nha xe — chi voi `EXTERNAL_CARRIER`. */
  readonly carrierCost: number | null;
  readonly advance: number;
  readonly returned: number;
  readonly expenses: readonly PlannedExpense[];
  readonly fuelEntries: readonly PlannedFuelEntry[];
  readonly receivable: 'CURRENT' | 'OVERDUE' | 'PAID' | null;
  /** Han thanh toan = ngay nghiep vu + dieu khoan cua khach. `null` khi chua ghi doanh thu. */
  readonly dueDate: BusinessDate | null;
}

export interface PlannedStatementLine {
  readonly key: string;
  readonly rowNumber: number;
  readonly vehicleRef: string;
  readonly vehiclePlateRaw: string;
  readonly businessDate: BusinessDate;
  readonly litersUnits: number;
  readonly amount: number;
  readonly invoiceNo: string;
  /** Khoa phieu ma dong nay mo ta — `null` voi dong mo coi (bang ke co, phieu khong). */
  readonly fuelEntryKey: string | null;
}

export interface PlannedStatement {
  readonly supplierRef: string;
  readonly periodStart: BusinessDate;
  readonly periodEnd: BusinessDate;
  readonly sourceRef: string;
  readonly lines: readonly PlannedStatementLine[];
}

export interface PlannedMaintenancePlan {
  readonly ref: string;
  readonly vehicleRef: string;
  readonly name: string;
  readonly triggerKind: 'ODOMETER' | 'CALENDAR' | 'ODOMETER_OR_CALENDAR';
  readonly intervalKm: number | null;
  readonly intervalDays: number | null;
  readonly baselineOdoKm: number;
  readonly baselineDate: BusinessDate;
}

export interface PlannedWorkOrder {
  readonly vehicleRef: string;
  readonly planRef: string | null;
  readonly description: string;
  readonly openedDate: BusinessDate;
  readonly openedOdoKm: number;
  readonly status: 'OPEN' | 'COMPLETED' | 'CANCELLED';
  readonly completedDate: BusinessDate | null;
  readonly completedOdoKm: number | null;
  readonly costAmount: number | null;
}

export interface PlannedComplianceDocument {
  readonly subjectKind: 'VEHICLE' | 'DRIVER' | 'COMPANY';
  readonly subjectRef: string | null;
  readonly documentType: string;
  readonly documentNo: string;
  readonly validFrom: BusinessDate;
  readonly validTo: BusinessDate;
}

export interface PlannedPayrollPeriod {
  readonly label: string;
  readonly startDate: BusinessDate;
  readonly endDate: BusinessDate;
  readonly manualComponents: readonly {
    readonly driverRef: string;
    readonly kind: 'EARNING' | 'DEDUCTION';
    readonly label: string;
    readonly amount: number;
    readonly note: string | null;
  }[];
}

export interface DemoPlan {
  readonly anchor: BusinessDate;
  readonly vehicles: readonly PlannedVehicle[];
  readonly drivers: readonly PlannedDriver[];
  readonly customers: readonly PlannedCustomer[];
  readonly suppliers: readonly PlannedSupplier[];
  readonly partners: readonly PlannedPartner[];
  readonly commissionRules: readonly PlannedCommissionRule[];
  readonly trips: readonly PlannedTrip[];
  readonly statements: readonly PlannedStatement[];
  readonly maintenancePlans: readonly PlannedMaintenancePlan[];
  readonly workOrders: readonly PlannedWorkOrder[];
  readonly complianceDocuments: readonly PlannedComplianceDocument[];
  readonly payroll: PlannedPayrollPeriod;
}

/** Lam tron ve boi cua 1.000 dong — con so tam ung/chi phi that khong bao gio le den hang don vi. */
const roundToThousand = (amount: number): number => Math.round(amount / 1000) * 1000;

/**
 * DO LECH TIEU HAO cua tung lan do dau — mot vong lap CO DINH, khong phai so ngau nhien.
 *
 * Moi lan do dau deu dung dinh muc se cho mot cot tieu hao phang li — dieu khong doanh nghiep nao
 * co, va la thu dau tien lam mot ban demo trong nhu du lieu bia. Sau muc do lech nay tao ra do tan
 * mac that. Muc cuoi (`22`) VUOT dung sai 15% co chu dich: mot doi xe that luon co vai lan do dau
 * can nguoi nhin lai, va man hinh "phieu can kiem tra" cua ban demo phai co gi de hien.
 */
const CONSUMPTION_VARIATION_PERCENT = [-6, -3, 0, 4, 7, 22] as const;

const pick = <T>(items: readonly T[], index: number): T => {
  const value = items[((index % items.length) + items.length) % items.length];
  /* c8 ignore next -- items luon khong rong (zod `.min(1)`); nhanh nay chi de TypeScript yen tam. */
  if (value === undefined) throw new Error('danh sach rong khong chon duoc phan tu');
  return value;
};

/**
 * XAY KE HOACH GHI tu bo du lieu mau.
 *
 * Thu tu cac buoc khong tuy y: chuyen phai duoc dung va SAP THEO NGAY truoc khi tinh dong ho odo,
 * vi odo la mot dai luong CONG DON — tinh no theo thu tu xuat hien trong tep JSON se cho mot dong
 * ho nhay qua nhay lai, va moi phep tinh tieu hao dua tren no thanh vo nghia.
 */
export function buildDemoPlan(dataset: DemoMonthDataset, context: DemoPlanContext): DemoPlan {
  const at = (dayOffset: number): BusinessDate => addBusinessDays(context.anchor, dayOffset);

  const vehicleByRef = new Map(dataset.vehicles.map((vehicle) => [vehicle.ref, vehicle]));
  const routeByRef = new Map(dataset.routes.map((route) => [route.ref, route]));
  const customerByRef = new Map(dataset.customers.map((customer) => [customer.ref, customer]));
  const driverByVehicle = new Map(
    dataset.drivers
      .filter((driver) => driver.vehicle !== null)
      .map((driver) => [driver.vehicle as string, driver]),
  );
  const statementDeltaByCode = new Map(
    dataset.scenarioTrips
      .filter((trip) => trip.fuel?.case === 'MISMATCH')
      .map((trip) => [trip.code, trip.fuel?.statementDeltaVnd ?? 0]),
  );

  const drivers: PlannedDriver[] = dataset.drivers.map((driver) => ({
    ref: driver.ref,
    fullName: driver.name,
    phone: driver.phone,
    licenceClass: driver.licenceClass,
    licenceExpiry: at(driver.licenceExpiryDay),
    login: driver.login,
    vehicleRef: driver.vehicle,
  }));

  // ---------------------------------------------------------------------------
  // 1. CHUYEN — kich ban co ten truoc, roi nen cua thang.
  // ---------------------------------------------------------------------------

  interface DraftTrip {
    readonly scenarioId: string | null;
    readonly code: string;
    readonly kind: TripKind;
    readonly status: TripStatus;
    readonly businessDate: BusinessDate;
    readonly routeRef: string;
    readonly customerRef: string;
    readonly vehicleRef: string | null;
    readonly driverRef: string | null;
    readonly carrierRef: string | null;
    readonly referrerRef: string | null;
    readonly cargoDescription: string;
    readonly advance: number;
    readonly returned: number;
    readonly expenses: readonly PlannedExpense[];
    readonly receivable: 'CURRENT' | 'OVERDUE' | 'PAID' | null;
    /** `litersUnits: null` = suy tu dinh muc; ca truong `fuel` vang mat = chuyen khong do dau. */
    readonly fuel:
      | {
          readonly supplierRef: string;
          readonly litersUnits: number | null;
          readonly case: 'MATCH' | 'MISMATCH' | 'AMBIGUOUS' | 'NONE';
        }
      | undefined;
  }

  const drafts: DraftTrip[] = dataset.scenarioTrips.map((trip) => ({
    scenarioId: trip.id,
    code: trip.code,
    kind: trip.kind,
    status: trip.status,
    businessDate: at(trip.day),
    routeRef: trip.route,
    customerRef: trip.customer,
    vehicleRef: trip.vehicle,
    driverRef: trip.driver,
    carrierRef: trip.carrier ?? null,
    referrerRef: trip.referrer ?? null,
    cargoDescription: trip.cargo,
    advance: trip.advanceVnd ?? 0,
    returned: trip.returnVnd ?? 0,
    expenses: (trip.expenses ?? []).map((expense) => ({
      categoryCode: expense.category,
      amount: expense.amountVnd,
      fundedBy: expense.fundedBy,
    })),
    receivable: trip.receivable,
    fuel:
      trip.fuel === null || trip.fuel === undefined
        ? undefined
        : {
            supplierRef: trip.fuel.supplier,
            litersUnits: litersToUnits(trip.fuel.liters),
            case: trip.fuel.case,
          },
  }));

  const { fill } = dataset;
  const span = Math.max(1, fill.tripCount - 1);
  for (let index = 0; index < fill.tripCount; index += 1) {
    const kind = pick(fill.kindCycle, index);
    const route = pick(dataset.routes, index);
    const vehicle = kind === 'EXTERNAL_CARRIER' ? null : pick(dataset.vehicles, index);
    const driver = vehicle === null ? null : (driverByVehicle.get(vehicle.ref) ?? null);
    const dayOffset = fill.firstDay + Math.round((index * (fill.lastDay - fill.firstDay)) / span);
    const advance =
      vehicle === null ? 0 : roundToThousand((route.freightVnd * fill.advanceRatePercent) / 100);
    const toll = roundToThousand((route.freightVnd * fill.tollRatePercent) / 100);

    drafts.push({
      scenarioId: null,
      code: `${fill.codePrefix}${fill.codeStart + index}`,
      kind,
      status: 'RECONCILED',
      businessDate: at(dayOffset),
      routeRef: route.ref,
      customerRef: pick(dataset.customers, index).ref,
      vehicleRef: vehicle?.ref ?? null,
      driverRef: driver?.ref ?? null,
      carrierRef: kind === 'EXTERNAL_CARRIER' ? pick(fill.carrierCycle, index) : null,
      referrerRef:
        kind === 'PARTNER_REFERRED_INTERNAL_RUN' ? pick(fill.referrerCycle, index) : null,
      cargoDescription: 'Hàng ghép',
      advance,
      returned: 0,
      expenses:
        vehicle === null
          ? []
          : [{ categoryCode: 'Phí cầu đường', amount: toll, fundedBy: 'DRIVER_FUND' }],
      receivable: 'CURRENT',
      fuel:
        vehicle !== null && index % fill.fuelEveryNthTrip === 0
          ? {
              supplierRef: pick(dataset.fuelSuppliers, index).ref,
              litersUnits: null,
              case: 'MATCH',
            }
          : undefined,
    });
  }

  /**
   * SAP THEO NGAY roi theo MA CHUYEN.
   *
   * Ma chuyen la khoa phu de hai chuyen cung ngay khong bao gio doi cho nhau giua hai lan chay.
   * `Array.prototype.sort` on dinh trong moi engine hien dai, nhung dua vao tinh on dinh do la dua
   * vao THU TU XUAT HIEN TRONG TEP — tuc mot lan sap xep lai goi khach se lam doi ca dong ho odo.
   */
  const ordered = [...drafts].sort((left, right) =>
    left.businessDate === right.businessDate
      ? left.code.localeCompare(right.code)
      : left.businessDate.localeCompare(right.businessDate),
  );

  // ---------------------------------------------------------------------------
  // 2. DONG HO ODO — cong don theo tung xe, ket thuc DUNG o so goi khach khai.
  // ---------------------------------------------------------------------------

  /** Chuyen chua chay (`PLANNED`) hoac da huy khong lam dong ho nhich len. */
  const moves = (status: TripStatus): boolean => status !== 'PLANNED' && status !== 'CANCELLED';

  const distanceByVehicle = new Map<string, number>();
  for (const trip of ordered) {
    if (trip.vehicleRef === null || !moves(trip.status)) continue;
    const route = routeByRef.get(trip.routeRef);
    /* c8 ignore next -- zod da kiem moi ma tuyen. */
    if (route === undefined) continue;
    distanceByVehicle.set(
      trip.vehicleRef,
      (distanceByVehicle.get(trip.vehicleRef) ?? 0) + route.distanceKm,
    );
  }

  const odoCursor = new Map<string, number>();
  for (const vehicle of dataset.vehicles) {
    odoCursor.set(vehicle.ref, vehicle.odoKm - (distanceByVehicle.get(vehicle.ref) ?? 0));
  }

  /** Odo cua lan DO DAU truoc do cua chinh xe do — goc de tinh tieu hao (`INV-06`). */
  const lastFillOdo = new Map<string, number>();

  const trips: PlannedTrip[] = [];
  const statementLinesBySupplier = new Map<string, PlannedStatementLine[]>();
  let fuelSequence = 0;

  for (const trip of ordered) {
    const route = routeByRef.get(trip.routeRef);
    /* c8 ignore next -- zod da kiem moi ma tuyen; nhanh nay khong den duoc tu mot goi hop le. */
    if (route === undefined) throw new Error(`Tuyen khong ton tai: ${trip.routeRef}`);

    let odometerKm: number | null = null;
    if (trip.vehicleRef !== null && moves(trip.status)) {
      const next = (odoCursor.get(trip.vehicleRef) ?? 0) + route.distanceKm;
      odoCursor.set(trip.vehicleRef, next);
      odometerKm = next;
    }

    const fuelEntries: PlannedFuelEntry[] = [];
    if (trip.fuel !== undefined && trip.vehicleRef !== null && odometerKm !== null) {
      const vehicle = vehicleByRef.get(trip.vehicleRef);
      /* c8 ignore next -- zod da kiem moi ma xe. */
      if (vehicle === undefined) throw new Error(`Xe khong ton tai: ${trip.vehicleRef}`);

      const previousOdometerKm = lastFillOdo.get(trip.vehicleRef) ?? null;
      const norm = context.consumptionNorms[vehicle.class] ?? null;

      /**
       * LIT PHAI PHU QUANG DUONG KE TU LAN DO TRUOC, khong phai quang duong cua rieng chuyen nay.
       *
       * Tieu hao duoc tinh giua HAI LAN DO DAU lien tiep (`INV-06`), nen mot binh dau chi du cho
       * mot chuyen trong khi dong ho da di ba chuyen se cho ra mot con so tieu hao thap den muc vo
       * ly — va no se vo ly O MOI XE, tuc bao cao tieu hao cua ban demo thanh rac.
       */
      const distanceSinceFill =
        previousOdometerKm === null ? route.distanceKm : odometerKm - previousOdometerKm;
      const variation = pick(CONSUMPTION_VARIATION_PERCENT, fuelSequence);
      const litersUnits =
        trip.fuel.litersUnits ??
        (norm === null
          ? Math.round(distanceSinceFill * 200)
          : Math.round((distanceSinceFill * norm * 10 * (100 + variation)) / 100));

      const consumption = computeConsumption({ litersUnits, odometerKm, previousOdometerKm });
      const aboveNorm = exceedsConsumptionNorm(
        consumption.consumptionUnits,
        norm,
        context.consumptionTolerancePercent,
      );
      const amount = Math.round((litersUnits * dataset.fuel.pricePerLiterVnd) / 1000);
      const key = `FUEL-${trip.code}`;
      fuelSequence += 1;

      const reviewReasons: FuelReviewReason[] = [
        ...consumption.reviewReasons,
        ...(aboveNorm ? (['CONSUMPTION_ABOVE_NORM'] as const) : []),
      ];

      const base: PlannedFuelEntry = {
        key,
        supplierRef: trip.fuel.supplierRef,
        litersUnits,
        amount,
        odometerKm,
        previousOdometerKm,
        consumptionUnits: consumption.consumptionUnits,
        reviewReasons,
        statementAmount: amount,
      };

      if (trip.fuel.case === 'MISMATCH') {
        fuelEntries.push({
          ...base,
          statementAmount: amount + (statementDeltaByCode.get(trip.code) ?? 0),
        });
      } else if (trip.fuel.case === 'NONE') {
        fuelEntries.push({ ...base, statementAmount: null });
      } else if (trip.fuel.case === 'AMBIGUOUS') {
        /**
         * HAI PHIEU, MOT DONG BANG KE.
         *
         * Lai xe do hai lan cung ngay tai cung cay xang voi cung so tien (hai nua binh), con bang
         * ke chi hien mot dong. May KHONG duoc phep tu chon phieu nao — `runFuelMatching` tra ve
         * `AMBIGUOUS_CANDIDATES` va day ca cum cho nguoi quyet (`GD-09`). Day la mot tinh huong ke
         * toan that su gap, va la ly do man hinh doi soat co nut chon phieu.
         */
        fuelEntries.push({ ...base, statementAmount: amount });
        fuelEntries.push({ ...base, key: `${key}-B`, statementAmount: null });
      } else {
        fuelEntries.push(base);
      }

      lastFillOdo.set(trip.vehicleRef, odometerKm);
    }

    const customer = customerByRef.get(trip.customerRef);
    /* c8 ignore next -- zod da kiem moi ma khach hang. */
    if (customer === undefined) throw new Error(`Khach hang khong ton tai: ${trip.customerRef}`);

    trips.push({
      scenarioId: trip.scenarioId,
      code: trip.code,
      kind: trip.kind,
      status: trip.status,
      businessDate: trip.businessDate,
      originLabel: route.origin,
      destinationLabel: route.destination,
      cargoDescription: trip.cargoDescription,
      distanceKm: route.distanceKm,
      freightAmount: route.freightVnd,
      customerRef: trip.customerRef,
      vehicleRef: trip.vehicleRef,
      driverRef: trip.driverRef,
      carrierRef: trip.carrierRef,
      referrerRef: trip.referrerRef,
      carrierCost: trip.kind === 'EXTERNAL_CARRIER' ? route.carrierCostVnd : null,
      advance: trip.advance,
      returned: trip.returned,
      expenses: trip.expenses,
      fuelEntries,
      receivable: trip.receivable,
      dueDate:
        trip.receivable === null
          ? null
          : addBusinessDays(trip.businessDate, customer.paymentTermDays),
    });

    for (const entry of fuelEntries) {
      if (entry.statementAmount === null) continue;
      const vehicle = vehicleByRef.get(trip.vehicleRef as string);
      /* c8 ignore next -- mot phieu dau luon gan mot xe. */
      if (vehicle === undefined) throw new Error(`Xe khong ton tai: ${trip.vehicleRef}`);
      const bucket = statementLinesBySupplier.get(entry.supplierRef) ?? [];
      bucket.push({
        key: `LINE-${entry.key}`,
        rowNumber: bucket.length + 1,
        vehicleRef: vehicle.ref,
        vehiclePlateRaw: vehicle.plate,
        businessDate: trip.businessDate,
        litersUnits: entry.litersUnits,
        amount: entry.statementAmount,
        invoiceNo: `HD-${entry.key}`,
        fuelEntryKey: entry.key,
      });
      statementLinesBySupplier.set(entry.supplierRef, bucket);
    }
  }

  // ---------------------------------------------------------------------------
  // 3. BANG KE — mot ky mot cay xang, cong mot dong MO COI cho cay xang dau tien.
  // ---------------------------------------------------------------------------

  const periodStart = at(fill.firstDay);
  const periodEnd = at(fill.lastDay);

  const statements: PlannedStatement[] = dataset.fuelSuppliers.map((supplier, index) => {
    const lines = [...(statementLinesBySupplier.get(supplier.ref) ?? [])];

    /**
     * MOT DONG KHONG CO PHIEU NAO DOI UNG — `STATEMENT_LINE_ONLY`.
     *
     * Day la truong hop thuong gap NHAT trong doi soat that: cay xang ghi mot lan do ma khong lai
     * xe nao khai phieu. Mot ban demo khong co dong nay chi trung bay duong hanh phuc, con man hinh
     * "chenh lech cho xu ly" — thu ma ke toan song cung — se trong rong.
     */
    if (index === 0) {
      const vehicle = pick(dataset.vehicles, 1);
      lines.push({
        key: `LINE-ORPHAN-${supplier.ref}`,
        rowNumber: lines.length + 1,
        vehicleRef: vehicle.ref,
        vehiclePlateRaw: vehicle.plate,
        businessDate: at(fill.lastDay - 1),
        litersUnits: 45_000,
        amount: Math.round((45_000 * dataset.fuel.pricePerLiterVnd) / 1000),
        invoiceNo: `HD-ORPHAN-${supplier.ref}`,
        fuelEntryKey: null,
      });
    }

    return {
      supplierRef: supplier.ref,
      periodStart,
      periodEnd,
      sourceRef: `bang-ke-${supplier.code.toLowerCase()}-${periodStart}.csv`,
      lines: lines.map((line, position) => ({ ...line, rowNumber: position + 1 })),
    };
  });

  return {
    anchor: context.anchor,
    vehicles: dataset.vehicles.map((vehicle) => ({
      ref: vehicle.ref,
      registrationPlate: vehicle.plate,
      vehicleClass: vehicle.class,
      allowedPayloadKg: vehicle.payloadKg,
      currentOdoKm: vehicle.odoKm,
    })),
    drivers,
    customers: dataset.customers.map((customer) => ({
      ref: customer.ref,
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      taxCode: customer.taxCode,
      paymentTermDays: customer.paymentTermDays,
      creditLimit: customer.creditLimitVnd,
    })),
    suppliers: dataset.fuelSuppliers.map((supplier) => ({
      ref: supplier.ref,
      name: supplier.name,
      code: supplier.code,
      phone: supplier.phone,
      address: supplier.address,
      taxCode: supplier.taxCode,
    })),
    partners: dataset.partners.map((partner) => ({
      ref: partner.ref,
      name: partner.name,
      phone: partner.phone,
      roles: partner.roles,
    })),
    commissionRules: dataset.commissionRules.map((rule) => ({
      ref: rule.ref,
      partnerRef: rule.partner,
      calcKind: rule.calcKind,
      rateBasisPoints: rule.rateBasisPoints ?? null,
      fixedAmount: rule.fixedAmountVnd ?? null,
      effectiveFrom: at(rule.effectiveFromDay),
    })),
    trips,
    statements,
    maintenancePlans: dataset.maintenancePlans.map((plan) => ({
      ref: plan.ref,
      vehicleRef: plan.vehicle,
      name: plan.name,
      triggerKind: plan.triggerKind,
      intervalKm: plan.intervalKm,
      intervalDays: plan.intervalDays,
      baselineOdoKm: plan.baselineOdoKm,
      baselineDate: at(plan.baselineDay),
    })),
    workOrders: dataset.workOrders.map((order) => ({
      vehicleRef: order.vehicle,
      planRef: order.plan,
      description: order.description,
      openedDate: at(order.openedDay),
      openedOdoKm: order.openedOdoKm,
      status: order.status,
      completedDate: order.completedDay === null ? null : at(order.completedDay),
      completedOdoKm: order.completedOdoKm,
      costAmount: order.costVnd,
    })),
    complianceDocuments: dataset.complianceDocuments.map((doc) => ({
      subjectKind: doc.subjectKind,
      subjectRef: doc.subject,
      documentType: doc.documentType,
      documentNo: doc.documentNo,
      validFrom: at(doc.validFromDay),
      validTo: at(doc.validToDay),
    })),
    payroll: {
      label: dataset.payroll.label,
      startDate: at(dataset.payroll.startDay),
      endDate: at(dataset.payroll.endDay),
      manualComponents: dataset.payroll.manualComponents.map((component) => ({
        driverRef: component.driver,
        kind: component.kind,
        label: component.label,
        amount: component.amountVnd,
        note: component.note ?? null,
      })),
    },
  };
}
