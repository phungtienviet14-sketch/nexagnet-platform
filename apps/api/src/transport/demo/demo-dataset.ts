import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadTenantConfig, tenantDir } from '@netviet/tenant';
import { z } from 'zod';
import { MONEY_MAX_AMOUNT } from '../money.js';

/**
 * HINH DANG cua bo du lieu "thang van hanh mau" (T8/#90).
 *
 * BO DU LIEU NAM TRONG GOI KHACH, HINH DANG CUA NO NAM O DAY. Do la duong bien cua quyet dinh
 * kien truc #6: `apps/` khong duoc mang ten mot khach nao, nen khong mot bien so, mot ten lai xe
 * hay mot tuyen duong nao xuat hien trong tep nay — chi cac RANG BUOC ma mot bo du lieu nhu vay
 * phai thoa. Doi bo du lieu la sua goi khach; doi hinh dang la sua o day.
 *
 * `.strict()` O MOI CAP, va do la mot lua chon chu khong phai thoi quen. Mot goi mau go sai mot
 * ten truong (`advanceVnd` -> `advance`) ma zod bo qua se gieo ra mot thang lam viec THIEU tam
 * ung — va khong ai phat hien, vi mot con so nho hon van la mot con so hop ly. Fail-fast bien loi
 * do thanh mot dong bao loi ngay luc gieo.
 */

const nonEmpty = z.string().trim().min(1);
const ref = z
  .string()
  .trim()
  .regex(/^[A-Z]{2}\d{2}$/, 'ma tham chieu phai co dang HAI CHU HOA + HAI SO, vd XE01');

/** Tien: SO NGUYEN DONG (`GD-03`). Khong am — chieu nam o ngu nghia cua truong. */
const vnd = z.number().int().min(0).max(MONEY_MAX_AMOUNT);

/**
 * DO LECH NGAY, khong phai ngay lich.
 *
 * Toan bo tep goi khach chi noi "cach moc bao nhieu ngay". Mot bo du lieu dong cung ngay thang se
 * dung DUNG MOT LAN roi hong dan: sang thang sau, moi giay to "sap het han" thanh "da het han",
 * va bang dieu khien cua ban demo hien mot mau do khong ai giai thich duoc.
 *
 * Khoang +-4000 ngay du cho giay to co hieu luc nhieu nam ma van chan duoc mot so vo nghia.
 */
const dayOffset = z.number().int().min(-4000).max(4000);

/** So lit: chuoi thap phan toi da 3 chu so — dung thang do chinh xac cua cot `Decimal(12,3)`. */
const litersText = z
  .string()
  .trim()
  .regex(/^\d{1,9}(?:\.\d{1,3})?$/, 'so lit phai la chuoi thap phan toi da 3 chu so');

const vehicleSchema = z
  .object({
    ref,
    plate: nonEmpty.max(20),
    class: nonEmpty.max(60),
    payloadKg: z.number().int().positive().max(100_000),
    odoKm: z.number().int().min(0).max(9_999_999),
  })
  .strict();

const driverSchema = z
  .object({
    ref,
    name: nonEmpty.max(120),
    phone: nonEmpty.max(20),
    licenceClass: nonEmpty.max(10),
    licenceExpiryDay: dayOffset,
    /** Xe phu trach thuong xuyen. `null` = lai xe du bi, chua gan xe nao. */
    vehicle: ref.nullable(),
    /** Ten dang nhap se duoc tao va noi vao `TransportDriver.authUserId`. */
    login: nonEmpty.max(60),
  })
  .strict();

const customerSchema = z
  .object({
    ref,
    name: nonEmpty.max(200),
    phone: nonEmpty.max(20),
    taxCode: nonEmpty.max(20),
    address: nonEmpty.max(300),
    paymentTermDays: z.number().int().min(0).max(365),
    creditLimitVnd: vnd,
  })
  .strict();

const fuelSupplierSchema = z
  .object({
    ref,
    name: nonEmpty.max(200),
    code: nonEmpty.max(40),
    phone: nonEmpty.max(20),
    taxCode: nonEmpty.max(20),
    address: nonEmpty.max(300),
  })
  .strict();

/**
 * VT-054 — mot doi tac mang NHIEU vai. `roles` la mot mang, khong phai mot cot loai doi tac, va
 * bo du lieu mau phai co it nhat mot doi tac mang ca hai vai, neu khong man hinh doi tac cua ban
 * demo trong nhu the mo hinh XOR ma VT-054 da co y tranh.
 */
const partnerSchema = z
  .object({
    ref,
    name: nonEmpty.max(200),
    phone: nonEmpty.max(20),
    roles: z.array(z.enum(['CARRIER', 'ORDER_REFERRER'])).min(1),
  })
  .strict();

const routeSchema = z
  .object({
    ref,
    origin: nonEmpty.max(120),
    destination: nonEmpty.max(120),
    distanceKm: z.number().int().positive().max(5_000),
    freightVnd: vnd,
    /** Gia phai tra nha xe khi chuyen duoc thue ngoai. */
    carrierCostVnd: vnd,
  })
  .strict();

const commissionRuleSchema = z
  .object({
    ref,
    partner: ref,
    calcKind: z.enum(['PERCENTAGE', 'FIXED']),
    rateBasisPoints: z.number().int().min(0).max(10_000).optional(),
    fixedAmountVnd: vnd.optional(),
    effectiveFromDay: dayOffset,
  })
  .strict()
  .refine(
    (rule) =>
      rule.calcKind === 'PERCENTAGE'
        ? rule.rateBasisPoints !== undefined
        : rule.fixedAmountVnd !== undefined,
    'luat PERCENTAGE phai co rateBasisPoints, luat FIXED phai co fixedAmountVnd',
  );

const expenseSchema = z
  .object({
    category: nonEmpty.max(60),
    amountVnd: vnd,
    fundedBy: z.enum(['DRIVER_FUND', 'COMPANY_DIRECT']),
  })
  .strict();

/**
 * BON KET CUC DOI SOAT ma mot phieu dau co the mang, va ly do phai co du ca bon.
 *
 *   · `MATCH`     — bang ke co dong khop; duong hanh phuc.
 *   · `MISMATCH`  — co dong nhung lech qua dung sai `GD-08` -> `OUT_OF_TOLERANCE`.
 *   · `AMBIGUOUS` — hai dong bang ke cung xe/cung ngay/cung so tien -> may KHONG duoc tu chon.
 *   · `NONE`      — phieu khong co dong nao trong ky bang ke -> `FUEL_ENTRY_ONLY`.
 *
 * Mot ban demo chi co `MATCH` chung minh dung mot dieu: rang phan mem cong duoc hai so bang nhau.
 * Ba ket cuc con lai la cho ke toan that su lam viec, nen chung phai co mat trong du lieu mau.
 */
const fuelSchema = z
  .object({
    supplier: ref,
    liters: litersText,
    case: z.enum(['MATCH', 'MISMATCH', 'AMBIGUOUS', 'NONE']),
    /** Chi cho `MISMATCH`: bang ke ghi cao hon phieu bao nhieu dong. */
    statementDeltaVnd: z.number().int().min(-MONEY_MAX_AMOUNT).max(MONEY_MAX_AMOUNT).optional(),
  })
  .strict();

/**
 * KET CUC CONG NO KHACH — `null` khi chuyen chua den buoc ghi nhan doanh thu.
 *
 * `OVERDUE` duoc dat bang mot NGAY NGHIEP VU QUA KHU cong voi dieu khoan thanh toan cua khach,
 * khong bang mot co `isOverdue`: qua han la mot HE QUA cua lich, va mot ban demo dat co truc tiep
 * se hien "qua han" tren mot chung tu con han — dieu dau tien ke toan nhin ra.
 */
const receivableSchema = z.enum(['CURRENT', 'OVERDUE', 'PAID']);

const scenarioTripSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^DEMO-[A-Z-]+$/, 'ma kich ban phai co dang DEMO-...'),
    code: nonEmpty.max(40),
    kind: z.enum(['OWN_DIRECT', 'EXTERNAL_CARRIER', 'PARTNER_REFERRED_INTERNAL_RUN']),
    status: z.enum(['PLANNED', 'IN_TRANSIT', 'DELIVERED', 'RECONCILED', 'CANCELLED']),
    route: ref,
    vehicle: ref.nullable(),
    driver: ref.nullable(),
    customer: ref,
    carrier: ref.optional(),
    referrer: ref.optional(),
    day: dayOffset,
    cargo: nonEmpty.max(200),
    advanceVnd: vnd.optional(),
    returnVnd: vnd.optional(),
    expenses: z.array(expenseSchema).optional(),
    fuel: fuelSchema.nullable().optional(),
    receivable: receivableSchema.nullable(),
  })
  .strict()
  .refine(
    (trip) => (trip.kind === 'EXTERNAL_CARRIER' ? trip.carrier !== undefined : true),
    'chuyen EXTERNAL_CARRIER phai chi ra nha xe',
  )
  .refine(
    (trip) => (trip.kind === 'PARTNER_REFERRED_INTERNAL_RUN' ? trip.referrer !== undefined : true),
    'chuyen PARTNER_REFERRED_INTERNAL_RUN phai chi ra doi tac mang don',
  );

/**
 * NEN cua thang — phan lam cho ban demo trong nhu mot doanh nghiep dang chay chu khong nhu mot
 * bang trong voi muoi ba dong mau.
 *
 * KHONG CO SO NGAU NHIEN. Moi chuyen duoc suy ra tu CHI SO cua no bang phep chia lay du, nen hai
 * lan gieo cung moc ngay cho ra hai bo du lieu giong het nhau tung dong. `#90` doi hoi "kich ban
 * tat dinh, khong phai mot hat giong ngau nhien" — mot `seed` co dinh van la ngau nhien, no chi
 * lap lai duoc chung nao thuat toan sinh so khong doi.
 */
const fillSchema = z
  .object({
    note: nonEmpty.optional(),
    tripCount: z.number().int().min(0).max(500),
    codePrefix: nonEmpty.max(20),
    codeStart: z.number().int().min(0),
    firstDay: dayOffset,
    lastDay: dayOffset,
    kindCycle: z
      .array(z.enum(['OWN_DIRECT', 'EXTERNAL_CARRIER', 'PARTNER_REFERRED_INTERNAL_RUN']))
      .min(1),
    carrierCycle: z.array(ref).min(1),
    referrerCycle: z.array(ref).min(1),
    advanceRatePercent: z.number().int().min(0).max(100),
    tollRatePercent: z.number().int().min(0).max(100),
    fuelEveryNthTrip: z.number().int().min(1).max(50),
  })
  .strict()
  .refine((fill) => fill.firstDay <= fill.lastDay, 'firstDay phai truoc lastDay');

const maintenancePlanSchema = z
  .object({
    ref,
    vehicle: ref,
    name: nonEmpty.max(200),
    triggerKind: z.enum(['ODOMETER', 'CALENDAR', 'ODOMETER_OR_CALENDAR']),
    intervalKm: z.number().int().positive().max(1_000_000).nullable(),
    intervalDays: z.number().int().positive().max(3_650).nullable(),
    baselineOdoKm: z.number().int().min(0).max(9_999_999),
    baselineDay: dayOffset,
  })
  .strict();

const workOrderSchema = z
  .object({
    vehicle: ref,
    plan: ref.nullable(),
    description: nonEmpty.max(300),
    openedDay: dayOffset,
    openedOdoKm: z.number().int().min(0).max(9_999_999),
    status: z.enum(['OPEN', 'COMPLETED', 'CANCELLED']),
    completedDay: dayOffset.nullable(),
    completedOdoKm: z.number().int().min(0).max(9_999_999).nullable(),
    costVnd: vnd.nullable(),
  })
  .strict()
  .refine(
    (order) => (order.status === 'COMPLETED' ? order.completedDay !== null : true),
    'lenh sua da hoan tat phai co ngay hoan tat',
  );

const complianceDocumentSchema = z
  .object({
    subjectKind: z.enum(['VEHICLE', 'DRIVER', 'COMPANY']),
    subject: ref.nullable(),
    documentType: z.enum([
      'VEHICLE_INSPECTION',
      'VEHICLE_INSURANCE',
      'VEHICLE_TRANSPORT_BADGE',
      'DRIVER_LICENCE',
      'COMPANY_TRANSPORT_LICENSE',
      'CONDITIONAL_CARGO_PERMIT',
    ]),
    documentNo: nonEmpty.max(60),
    validFromDay: dayOffset,
    validToDay: dayOffset,
  })
  .strict()
  .refine((doc) => doc.validFromDay < doc.validToDay, 'validFromDay phai truoc validToDay')
  .refine(
    (doc) => (doc.subjectKind === 'COMPANY' ? doc.subject === null : doc.subject !== null),
    'giay to cua CONG TY khong gan doi tuong; giay to cua XE/LAI XE thi phai gan',
  );

const payrollSchema = z
  .object({
    label: nonEmpty.max(200),
    startDay: dayOffset,
    endDay: dayOffset,
    manualComponents: z.array(
      z
        .object({
          driver: ref,
          kind: z.enum(['EARNING', 'DEDUCTION']),
          label: nonEmpty.max(200),
          amountVnd: vnd,
          note: nonEmpty.max(300).optional(),
        })
        .strict(),
    ),
  })
  .strict()
  .refine((period) => period.startDay <= period.endDay, 'startDay phai truoc endDay');

export const demoMonthDatasetSchema = z
  .object({
    version: z.literal(1),
    note: nonEmpty.optional(),
    fuel: z.object({ pricePerLiterVnd: vnd }).strict(),
    vehicles: z.array(vehicleSchema).min(1),
    drivers: z.array(driverSchema).min(1),
    customers: z.array(customerSchema).min(1),
    fuelSuppliers: z.array(fuelSupplierSchema).min(1),
    partners: z.array(partnerSchema).min(1),
    routes: z.array(routeSchema).min(1),
    commissionRules: z.array(commissionRuleSchema),
    scenarioTrips: z.array(scenarioTripSchema).min(1),
    fill: fillSchema,
    maintenancePlans: z.array(maintenancePlanSchema),
    workOrders: z.array(workOrderSchema),
    complianceDocuments: z.array(complianceDocumentSchema),
    payroll: payrollSchema,
  })
  .strict()
  .superRefine((dataset, ctx) => {
    /**
     * MOI MA THAM CHIEU PHAI TRO VAO MOT THU CO THAT — kiem o day, khong o luc ghi.
     *
     * Mot `"vehicle": "XE99"` go nham se lam lan gieo chet giua chung neu chi phat hien luc tra
     * cuu: cac bang truoc do da ghi xong, va lan chay sau thay DB khong rong nen bo qua — de lai
     * mot thang van hanh CUT DUOI ma khong dau hieu nao. Kiem tron ven TRUOC khi cham vao DB la
     * cach duy nhat de "gieo hoac khong gieo" van la mot lua chon nhi phan.
     */
    const known = (items: readonly { ref: string }[]): ReadonlySet<string> =>
      new Set(items.map((item) => item.ref));

    const vehicles = known(dataset.vehicles);
    const drivers = known(dataset.drivers);
    const customers = known(dataset.customers);
    const suppliers = known(dataset.fuelSuppliers);
    const partners = known(dataset.partners);
    const routes = known(dataset.routes);
    const plans = known(dataset.maintenancePlans);

    const mustExist = (
      set: ReadonlySet<string>,
      value: string | null | undefined,
      path: (string | number)[],
      label: string,
    ): void => {
      if (value === null || value === undefined) return;
      if (!set.has(value)) {
        ctx.addIssue({ code: 'custom', path, message: `${label} khong ton tai: ${value}` });
      }
    };

    dataset.drivers.forEach((driver, index) => {
      mustExist(vehicles, driver.vehicle, ['drivers', index, 'vehicle'], 'xe');
    });

    dataset.commissionRules.forEach((rule, index) => {
      mustExist(partners, rule.partner, ['commissionRules', index, 'partner'], 'doi tac');
    });

    dataset.scenarioTrips.forEach((trip, index) => {
      const at = (field: string): (string | number)[] => ['scenarioTrips', index, field];
      mustExist(routes, trip.route, at('route'), 'tuyen');
      mustExist(vehicles, trip.vehicle, at('vehicle'), 'xe');
      mustExist(drivers, trip.driver, at('driver'), 'lai xe');
      mustExist(customers, trip.customer, at('customer'), 'khach hang');
      mustExist(partners, trip.carrier, at('carrier'), 'nha xe');
      mustExist(partners, trip.referrer, at('referrer'), 'doi tac mang don');
      mustExist(suppliers, trip.fuel?.supplier, at('fuel'), 'cay xang');
    });

    dataset.fill.carrierCycle.forEach((partner, index) => {
      mustExist(partners, partner, ['fill', 'carrierCycle', index], 'nha xe');
    });
    dataset.fill.referrerCycle.forEach((partner, index) => {
      mustExist(partners, partner, ['fill', 'referrerCycle', index], 'doi tac mang don');
    });

    dataset.maintenancePlans.forEach((plan, index) => {
      mustExist(vehicles, plan.vehicle, ['maintenancePlans', index, 'vehicle'], 'xe');
    });
    dataset.workOrders.forEach((order, index) => {
      mustExist(vehicles, order.vehicle, ['workOrders', index, 'vehicle'], 'xe');
      mustExist(plans, order.plan, ['workOrders', index, 'plan'], 'ke hoach bao duong');
    });
    dataset.complianceDocuments.forEach((doc, index) => {
      if (doc.subjectKind === 'COMPANY') return;
      const set = doc.subjectKind === 'VEHICLE' ? vehicles : drivers;
      mustExist(set, doc.subject, ['complianceDocuments', index, 'subject'], 'doi tuong');
    });
    dataset.payroll.manualComponents.forEach((component, index) => {
      mustExist(
        drivers,
        component.driver,
        ['payroll', 'manualComponents', index, 'driver'],
        'lai xe',
      );
    });

    /** Ma chuyen trung nhau se dung o `TransportTrip.code @unique` — bao truoc thay vi bao sau. */
    const codes = new Set<string>();
    dataset.scenarioTrips.forEach((trip, index) => {
      if (codes.has(trip.code)) {
        ctx.addIssue({
          code: 'custom',
          path: ['scenarioTrips', index, 'code'],
          message: `ma chuyen bi trung: ${trip.code}`,
        });
      }
      codes.add(trip.code);
    });
  });

export type DemoMonthDataset = z.infer<typeof demoMonthDatasetSchema>;
export type DemoScenarioTrip = DemoMonthDataset['scenarioTrips'][number];
export type DemoVehicle = DemoMonthDataset['vehicles'][number];
export type DemoDriver = DemoMonthDataset['drivers'][number];
export type DemoRoute = DemoMonthDataset['routes'][number];

export class DemoDatasetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DemoDatasetError';
  }
}

/**
 * DUONG DAN bo du lieu mau cua goi khach dang chay — `null` khi goi khong khai.
 *
 * `null` KHONG phai loi: ba goi khach that deu khong khai muc nay, va do la cau tra loi dung cho
 * ho. Ben goi quyet dinh phai lam gi voi `null`, vi cau tra loi khac nhau theo duong goi (buoc
 * gieo luc deploy thi bo qua trong im lang, mot lenh gieo go tay thi phai bao).
 */
export function demoDatasetPath(): string | null {
  const relative = loadTenantConfig().bootstrap.transportDemo?.path;
  return relative === undefined ? null : join(tenantDir(), relative);
}

/** Doc + kiem bo du lieu mau. Nem `DemoDatasetError` neu goi khach khong khai hoac tep hong. */
export function loadDemoMonthDataset(): DemoMonthDataset {
  const path = demoDatasetPath();
  if (path === null) {
    throw new DemoDatasetError(
      'Goi khach khong khai `bootstrap.transportDemo` — khong co thang van hanh mau de gieo.',
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new DemoDatasetError(
      `Khong doc duoc ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const parsed = demoMonthDatasetSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(goc)'}: ${issue.message}`)
      .join('; ');
    throw new DemoDatasetError(`Bo du lieu mau ${path} khong hop le — ${detail}`);
  }
  return parsed.data;
}
