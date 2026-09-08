'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuth } from '../../../components/auth/AuthGate';
import { useTenantRuntime } from '../../../lib/tenant-runtime-context';
import type { NavigationInput } from '../navigation';
import { canPerform, type TransportAction } from '../transport-actions';
import { transportApi } from '../transport-api';
import type { FuelEntryInboxQuery, SettlementFlow } from '../transport-types';

/**
 * Duong DUY NHAT de mot khung nhin lay du lieu.
 *
 * MOT query cho MOT nguon, va CO Y khong gop lai: mot muc chet khong duoc lam trang mot muc dang
 * song. Do la ly do `b2b-sales-operations/hooks/useWorkspaceData.ts:10-20` neu ra, va o day no con
 * dung hon — bay muc vay quanh mot API khong co duong tong hop nao.
 *
 * Moi query deu bi CHAN o `enabled` theo nang luc + hanh dong, nen mot vai khong co quyen se khong
 * ban ra mot yeu cau chac chan bi 403. Do la chan LANG PHI, khong phai chan bao mat: cong that nam
 * o may chu.
 */

export function useNavigationInput(): NavigationInput {
  const tenant = useTenantRuntime();
  const { user } = useAuth();
  const role = user?.role ?? null;
  return useMemo(() => ({ capabilities: tenant.capabilities, role }), [tenant.capabilities, role]);
}

export const TRANSPORT_QUERY_KEYS = {
  trips: ['transport', 'trips'],
  vehicles: ['transport', 'vehicles'],
  drivers: ['transport', 'drivers'],
  assetStakeholders: ['transport', 'asset-ownership', 'stakeholders'],
  ownershipRegister: ['transport', 'asset-ownership', 'register'],
  myVehicles: ['transport', 'me', 'vehicles'],
  customers: ['transport', 'customers'],
  partners: ['transport', 'partners'],
  fuelSuppliers: ['transport', 'fuel', 'suppliers'],
  reconciliations: ['transport', 'fuel', 'reconciliations'],
  driverTrips: ['transport', 'me', 'trips'],
  driverFund: ['transport', 'me', 'fund'],
  driverFuel: ['transport', 'me', 'fuel'],
  driverPayslips: ['transport', 'me', 'payslips'],
  driverExpenseCategories: ['transport', 'me', 'expense-categories'],
  /** `TX-07b` — bang quyet toan cua chinh lai xe dang dang nhap. */
  driverSettlement: ['transport', 'me', 'settlement'],
  /** `TX-07b` — mot dong so du cho moi lai xe (be mat ke toan). */
  settlementBalances: ['transport', 'driver-settlement', 'balances'],
  orders: ['transport', 'orders'],
  runs: ['transport', 'runs'],
  expenseClaims: ['transport', 'expense-claims'],
  /** Lane G — MOT khoa cho CA bang: mot lan goi, mot khung nhin. */
  controlTower: ['transport', 'control-tower'],
  /** Lane G — sau con so tai chinh, cung mot lan doc. */
  financeSummary: ['transport', 'finance', 'summary'],
} as const;

/** Nang luc + hanh dong deu phai dat truoc khi ban mot yeu cau. */
const allowed = (
  input: NavigationInput,
  capability: string | null,
  action: TransportAction,
): boolean => {
  if (capability !== null && !(input.capabilities as readonly string[]).includes(capability)) {
    return false;
  }
  return canPerform(input.role, action);
};

export function useTrips(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.trips,
    queryFn: () => transportApi.trips.list(),
    enabled: allowed(input, 'transport-core', 'transport.trip.read'),
  });
}

/**
 * THAP DIEU HANH — mot `useQuery` cho CA bang (Lane G, #244).
 *
 * Khong tach lam ba hook cho bang/hang viec/doi xe du tep nay von theo luat "mot nguon mot hook":
 * luat do ton tai de mot nguon chet khong lam trang mot nguon con song, con o day CA BA den tu MOT
 * lan goi va may chu da tu xu ly viec mot nguon vang hay hong (`unavailableSources`). Tach ra chi
 * tao them ba anh chup lech nhau.
 *
 * `transport-core` la capability duy nhat can co: bang song trong do, va ba nguon con lai vang mat
 * mot cach co cong bo chu khong lam hong lan goi.
 */
export function useControlTower(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.controlTower,
    queryFn: () => transportApi.controlTower.view(),
    enabled: allowed(input, 'transport-core', 'transport.control_tower.read'),
  });
}

/**
 * BAO CAO BAN DO VONG CHAY (Lane N, #278 N5) — HAI hook, hai ma quyen.
 *
 * Day la ngoai le NGUOC voi `useControlTower`: o do mot lan goi la dung vi ba nguon deu nam sau
 * CUNG mot ma quyen. O day thi khong — toa do di sau `transport.location.history.read`, ma ke toan
 * KHONG co (`transport-actions.ts`). Gop hai lan goi lam mot se buoc may chu tra toa do duoi ma
 * quyen cua bao cao.
 *
 * `enabled` chi la phep tranh mot yeu cau chac chan 403; cong that van o may chu. Nho vay ke toan
 * mo bao cao ra thi khong ban lan goi do, con quan tri thi ban ca hai.
 */
export function useRunJourney(input: NavigationInput, runRef: string | null) {
  return useQuery({
    queryKey: ['transport', 'journey', 'run', runRef ?? 'none'],
    queryFn: () => transportApi.journey.run(runRef ?? ''),
    enabled: runRef !== null && allowed(input, 'transport-core', 'transport.run.read'),
    /* 404 la mot cau tra loi nghiep vu ("khong co vong chay do"), khong phai mot su co mang. */
    retry: false,
  });
}

export function useRunJourneyMap(input: NavigationInput, runRef: string | null) {
  return useQuery({
    queryKey: ['transport', 'journey', 'map', runRef ?? 'none'],
    queryFn: () => transportApi.journey.map(runRef ?? ''),
    enabled: runRef !== null && allowed(input, 'transport-core', 'transport.location.history.read'),
    retry: false,
  });
}

/**
 * BANG TAI CHINH — mot `useQuery` cho ca sau con so (Lane G, #244 G5).
 *
 * Dung `transport.settlement.report.read`: bang khong phoi mot su that nao ma quyen do chua cho
 * xem, nen no khong can mot ma quyen thu hai. Xem khoi chu thich cua `FinanceController`.
 */
export function useFinanceSummary(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.financeSummary,
    queryFn: () => transportApi.finance.summary(),
    enabled: allowed(input, 'transport-settlement', 'transport.settlement.report.read'),
  });
}

export function useVehicles(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.vehicles,
    queryFn: () => transportApi.fleet.vehicles(),
    enabled: allowed(input, 'transport-core', 'transport.vehicle.read'),
  });
}

export function useDrivers(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.drivers,
    queryFn: () => transportApi.fleet.drivers(),
    enabled: allowed(input, 'transport-core', 'transport.driver.read'),
  });
}

/* ------------------------------------------------------------------ *
 * `TX-08` SO HUU TAI SAN (#242 Lane E)
 * ------------------------------------------------------------------ */

export function useAssetStakeholders(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.assetStakeholders,
    queryFn: () => transportApi.assetOwnership.stakeholders(),
    enabled: allowed(input, 'transport-core', 'transport.asset_ownership.read'),
  });
}

export function useOwnershipRegister(input: NavigationInput, vehicleId: string | null) {
  return useQuery({
    queryKey: [...TRANSPORT_QUERY_KEYS.ownershipRegister, vehicleId],
    queryFn: () => transportApi.assetOwnership.register(vehicleId ?? ''),
    enabled:
      vehicleId !== null && allowed(input, 'transport-core', 'transport.asset_ownership.read'),
  });
}

/**
 * "Xe toi co co phan" — be mat CUA CHINH NGUOI DANG DANG NHAP.
 *
 * KHONG dung `allowed(...)` o day, va do la co y. `allowed` hoi `canPerform(role, action)`, ma
 * `transport.stakeholder.self.vehicle.read` KHONG duoc cap qua vai nao ca (xem
 * `STAKEHOLDER_SCOPE_ACTIONS`) — nen `allowed` se luon tra `false` va query se khong bao gio chay.
 *
 * Cau hoi dung o day khong phai "vai nay lam duoc gi", ma "nguoi nay co phai ben huu quan khong" —
 * va cau do CHI may chu tra loi duoc, tu mot hang `TransportAssetStakeholder.authUserId`. Nen dieu
 * kien duy nhat o phia man hinh la khach co bat `transport-core` hay khong; con lai de `403` cua
 * may chu noi. Doan truoc o client se hoac chan nham mot co dong that, hoac hua hen mot man hinh
 * ma may chu se tu choi.
 */
export function useMyStakeholderVehicles(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.myVehicles,
    queryFn: () => transportApi.stakeholderSelf.myVehicles(),
    enabled: (input.capabilities as readonly string[]).includes('transport-core'),
    retry: false,
  });
}

/* ------------------------------------------------------------------ *
 * MO HINH VAN CHUYEN v2 -- hai truc doc lap (`D-01`)
 * ------------------------------------------------------------------ */

export function useTransportOrders(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.orders,
    queryFn: () => transportApi.movement.orders(),
    enabled: allowed(input, 'transport-core', 'transport.order.read'),
  });
}

export function useVehicleRuns(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.runs,
    queryFn: () => transportApi.movement.runs(),
    enabled: allowed(input, 'transport-core', 'transport.run.read'),
  });
}

/** Chang cua MOT vong chay. Chi goi khi da MO mot vong chay, khong goi cho ca bang. */
export function useVehicleRunDetail(input: NavigationInput, runId: string | null) {
  return useQuery({
    queryKey: ['transport', 'runs', runId ?? 'none'],
    queryFn: () => transportApi.movement.run(runId as string),
    enabled: runId !== null && allowed(input, 'transport-core', 'transport.run.read'),
  });
}

/**
 * KM co hang vs km rong CUA MOT vong chay.
 *
 * May chu tinh, man hinh chi hien. Neu mot ngay nao do co mot phep cong km o tep nay thi hai
 * cach tinh se lech nhau -- va ban tren man hinh la ban khong ai doi chieu duoc.
 */
export function useRunDistance(input: NavigationInput, runId: string | null) {
  return useQuery({
    queryKey: ['transport', 'runs', runId ?? 'none', 'distance'],
    queryFn: () => transportApi.movement.distance(runId as string),
    enabled: runId !== null && allowed(input, 'transport-core', 'transport.run.read'),
  });
}

/** DE NGHI CHI cho ke toan duyet (`D-06`). */
export function useExpenseClaims(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.expenseClaims,
    queryFn: () => transportApi.claims.list(),
    enabled: allowed(input, 'transport-costing', 'transport.expense.claim.read'),
  });
}

export function useCustomers(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.customers,
    queryFn: () => transportApi.fleet.customers(),
    enabled: allowed(input, 'transport-core', 'transport.customer.read'),
  });
}

export function usePartners(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.partners,
    queryFn: () => transportApi.fleet.partners(),
    enabled: allowed(input, 'transport-core', 'transport.partner.read'),
  });
}

/**
 * Phan cong CUA MOT chuyen. Phai goi theo tung chuyen vi `Trip` khong mang phan cong dang hieu luc
 * — `Trip` chi tra ve khoa ngoai. Nen chi goi khi da MO mot chuyen, khong goi cho ca bang.
 */
export function useTripAssignments(input: NavigationInput, tripId: string | null) {
  return useQuery({
    queryKey: ['transport', 'trips', tripId, 'assignments'],
    queryFn: () => transportApi.trips.assignments(tripId as string),
    enabled: tripId !== null && allowed(input, 'transport-core', 'transport.trip.read'),
  });
}

export function useTripCost(input: NavigationInput, tripId: string | null) {
  return useQuery({
    queryKey: ['transport', 'costing', 'trips', tripId],
    queryFn: () => transportApi.costing.tripExpenses(tripId as string),
    enabled:
      tripId !== null && allowed(input, 'transport-costing', 'transport.costing.expense.read'),
  });
}

export function useTripFuelEntries(input: NavigationInput, tripId: string | null) {
  return useQuery({
    queryKey: ['transport', 'fuel', 'trips', tripId],
    queryFn: () => transportApi.fuel.tripEntries(tripId as string),
    enabled: tripId !== null && allowed(input, 'transport-fuel', 'transport.fuel.entry.read'),
  });
}

/**
 * MOT phieu do dau kem BANG CHUNG.
 *
 * Doc rieng thay vi lay tu danh sach: `GET /transport/fuel/trips/:id/entries` tra `FuelEntry[]`
 * KHONG kem anh, con `GET /transport/fuel/entries/:id` tra `{ entry, evidence[] }`. Ke toan can
 * nhin anh phieu TRUOC khi bam xac thuc, nen man hinh phai co duong doc that su mang `evidence`.
 */
export function useFuelEntryDetail(input: NavigationInput, entryId: string | null) {
  return useQuery({
    queryKey: ['transport', 'fuel', 'entries', entryId],
    queryFn: () => transportApi.fuel.entry(entryId as string),
    enabled: entryId !== null && allowed(input, 'transport-fuel', 'transport.fuel.entry.read'),
  });
}

export function useFundStatement(input: NavigationInput, driverId: string | null) {
  return useQuery({
    queryKey: ['transport', 'costing', 'fund', driverId],
    queryFn: () => transportApi.costing.fundStatement(driverId as string),
    enabled:
      driverId !== null &&
      allowed(input, 'transport-costing', 'transport.costing.driver_fund.read'),
  });
}

export function useFundPeriods(input: NavigationInput, driverId: string | null) {
  return useQuery({
    queryKey: ['transport', 'costing', 'fund', driverId, 'periods'],
    queryFn: () => transportApi.costing.fundPeriods(driverId as string),
    enabled:
      driverId !== null && allowed(input, 'transport-costing', 'transport.costing.period.read'),
  });
}

export function useFuelSuppliers(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.fuelSuppliers,
    queryFn: () => transportApi.fuel.suppliers(),
    enabled: allowed(input, 'transport-fuel', 'transport.fuel.entry.read'),
  });
}

/**
 * HOP THU PHIEU NHIEN LIEU cua CA DOI — #222 P1-B.
 *
 * `queryKey` mang CA BO LOC: hai bo loc khac nhau la hai cau hoi khac nhau, va dung chung mot o nho
 * se lam man hinh hien ket qua cua lan hoi truoc trong khi nguoi dung da doi dieu kien.
 *
 * Nam duoi tien to `['transport','fuel']` de moi lenh ghi cua man Nhien lieu (`invalidateQueries`
 * theo tien to do) tu dong lam moi hop thu — khong phai nho don le tung cho.
 */
export function useFuelInbox(input: NavigationInput, query: FuelEntryInboxQuery) {
  return useQuery({
    queryKey: ['transport', 'fuel', 'inbox', query],
    queryFn: () => transportApi.fuel.inbox(query),
    enabled: allowed(input, 'transport-fuel', 'transport.fuel.entry.read'),
  });
}

export function useReconciliations(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.reconciliations,
    queryFn: () => transportApi.fuel.reconciliations(),
    enabled: allowed(input, 'transport-fuel', 'transport.fuel.reconciliation.read'),
  });
}

export function useReconciliation(input: NavigationInput, id: string | null) {
  return useQuery({
    queryKey: ['transport', 'fuel', 'reconciliations', id],
    queryFn: () => transportApi.fuel.reconciliation(id as string),
    enabled: id !== null && allowed(input, 'transport-fuel', 'transport.fuel.reconciliation.read'),
  });
}

/* --- be mat lai xe: khong duong nao nhan `:driverId` --- */

export function useDriverTrips(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.driverTrips,
    queryFn: () => transportApi.me.trips(),
    enabled: allowed(input, 'transport-core', 'transport.driver.self.trip.read'),
  });
}

export function useDriverFund(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.driverFund,
    queryFn: () => transportApi.me.fund(),
    enabled: allowed(input, 'transport-costing', 'transport.driver.self.fund.read'),
  });
}

export function useDriverFuelSlips(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.driverFuel,
    queryFn: () => transportApi.me.fuelSlips(),
    enabled: allowed(input, 'transport-fuel', 'transport.driver.self.fuel.read'),
  });
}

/**
 * Cay xang ma LAI XE doc duoc. Gac bang hanh dong PHAM VI CUA CHINH MINH — `useFuelSuppliers` gac
 * bang `transport.fuel.entry.read`, nen voi vai lai xe no khong bao gio chay.
 */
export function useDriverFuelSuppliers(input: NavigationInput) {
  return useQuery({
    queryKey: ['transport', 'me', 'fuel', 'suppliers'],
    queryFn: () => transportApi.me.fuelSuppliers(),
    enabled: allowed(input, 'transport-fuel', 'transport.driver.self.fuel.submit'),
  });
}

export function useDriverPayslips(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.driverPayslips,
    queryFn: () => transportApi.me.payslips(),
    enabled: allowed(input, 'transport-workforce', 'transport.driver.self.payslip.read'),
  });
}

/**
 * `TX-07b` — bang quyet toan CUA CHINH LAI XE dang dang nhap.
 *
 * Khong tham so `driverId`: danh tinh den tu phien o may chu. Mot tham so o day se la duong de mot
 * lai xe doc bang cua dong nghiep bang cach doi mot chuoi tren URL.
 */
export function useDriverSettlement(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.driverSettlement,
    queryFn: () => transportApi.me.settlement(),
    enabled: allowed(input, 'transport-workforce', 'transport.driver.self.settlement.read'),
  });
}

/** `TX-07b` — mot dong so du cho moi lai xe dang lam viec (be mat ke toan). */
export function useSettlementBalances(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.settlementBalances,
    queryFn: () => transportApi.driverSettlement.balances(),
    enabled: allowed(input, 'transport-workforce', 'transport.driver_settlement.read'),
  });
}

/** `TX-07b` — bang cua MOT lai xe: cac thang, cac lan chi kem phan bo, canh bao cua so. */
export function useSettlementStatement(input: NavigationInput, driverId: string | null) {
  return useQuery({
    queryKey: ['transport', 'driver-settlement', 'drivers', driverId],
    queryFn: () => transportApi.driverSettlement.statement(driverId as string),
    enabled:
      driverId !== null &&
      allowed(input, 'transport-workforce', 'transport.driver_settlement.read'),
  });
}

/**
 * DANH MUC NHOM CHI PHI cua chinh lai xe (`#168 B4`).
 *
 * `staleTime` dai co chu dich: danh muc la CAU HINH cua khach, khong phai so lieu chay. Tai lai no
 * moi lan mo bieu mau la mot vong goi khong doi lay gi.
 */
export function useDriverExpenseCategories(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.driverExpenseCategories,
    queryFn: () => transportApi.me.expenseCategories(),
    enabled: allowed(input, 'transport-costing', 'transport.driver.self.expense.record'),
    staleTime: 5 * 60_000,
  });
}

/* --- `TX-05` quyet toan: CHI DOC, khong mot mutation nao --- */

/**
 * `asOf` la THAM SO, khong phai mac dinh im lang — no di thang vao `queryKey` de doi moc thi doc
 * lai, va de hai moc khac nhau khong dung chung mot o nho.
 */
export function useArAging(input: NavigationInput, asOf: string, customerId: string | null) {
  return useQuery({
    queryKey: ['transport', 'settlement', 'ar-aging', asOf, customerId],
    queryFn: () => transportApi.settlement.arAging(asOf, customerId),
    enabled: allowed(input, 'transport-settlement', 'transport.settlement.report.read'),
  });
}

export function useApByFlow(input: NavigationInput, flow: SettlementFlow) {
  return useQuery({
    queryKey: ['transport', 'settlement', 'ap', flow],
    queryFn: () => transportApi.settlement.apByFlow(flow),
    enabled: allowed(input, 'transport-settlement', 'transport.settlement.report.read'),
  });
}

export function usePartnerPosition(input: NavigationInput, partnerId: string | null) {
  return useQuery({
    queryKey: ['transport', 'settlement', 'partners', partnerId],
    queryFn: () => transportApi.settlement.partnerPosition(partnerId as string),
    enabled:
      partnerId !== null &&
      allowed(input, 'transport-settlement', 'transport.settlement.report.read'),
  });
}

/**
 * 404 la mot cau tra loi NGHIEP VU o day (chuyen chua co du lieu bien), khong phai mot su co. Nen
 * `retry: false`: thu lai ba lan mot cau tra loi dung chi lam man hinh cham di.
 */
export function useTripDirectMargin(input: NavigationInput, tripId: string | null) {
  return useQuery({
    queryKey: ['transport', 'settlement', 'direct-margin', tripId],
    queryFn: () => transportApi.settlement.tripDirectMargin(tripId as string),
    enabled:
      tripId !== null && allowed(input, 'transport-settlement', 'transport.settlement.report.read'),
    retry: false,
  });
}

export function useDirectMarginRollup(input: NavigationInput, tripIds: readonly string[]) {
  return useQuery({
    queryKey: ['transport', 'settlement', 'rollup', [...tripIds].sort().join(',')],
    queryFn: () => transportApi.settlement.directMarginRollup(tripIds),
    enabled:
      tripIds.length > 0 &&
      allowed(input, 'transport-settlement', 'transport.settlement.report.read'),
  });
}

/** Quyen RIENG: lich su SUA mot con so tien khac voi "con no bao nhieu". */
export function useDocumentChain(input: NavigationInput, originalId: string | null) {
  return useQuery({
    queryKey: ['transport', 'settlement', 'documents', originalId],
    queryFn: () => transportApi.settlement.documentChain(originalId as string),
    enabled:
      originalId !== null &&
      allowed(input, 'transport-settlement', 'transport.settlement.document.read'),
    retry: false,
  });
}

/* --- `TX-06` bao duong, giay to, canh bao --- */

export function useMaintenanceDue(input: NavigationInput) {
  return useQuery({
    queryKey: ['transport', 'maintenance', 'due'],
    queryFn: () => transportApi.assets.due(),
    enabled: allowed(input, 'transport-asset-compliance', 'transport.maintenance.plan.read'),
  });
}

export function useMaintenancePlans(input: NavigationInput) {
  return useQuery({
    queryKey: ['transport', 'maintenance', 'plans'],
    queryFn: () => transportApi.assets.plans(),
    enabled: allowed(input, 'transport-asset-compliance', 'transport.maintenance.plan.read'),
  });
}

export function useWorkOrders(input: NavigationInput) {
  return useQuery({
    queryKey: ['transport', 'maintenance', 'work-orders'],
    queryFn: () => transportApi.assets.workOrders(),
    enabled: allowed(input, 'transport-asset-compliance', 'transport.maintenance.plan.read'),
  });
}

export function useComplianceDocuments(input: NavigationInput) {
  return useQuery({
    queryKey: ['transport', 'compliance', 'documents'],
    queryFn: () => transportApi.assets.complianceDocuments(),
    enabled: allowed(input, 'transport-asset-compliance', 'transport.compliance.document.read'),
  });
}

export function useComplianceAlerts(input: NavigationInput) {
  return useQuery({
    queryKey: ['transport', 'compliance', 'alerts'],
    queryFn: () => transportApi.assets.complianceAlerts(),
    enabled: allowed(input, 'transport-asset-compliance', 'transport.compliance.document.read'),
  });
}

export function useFleetStatus(input: NavigationInput) {
  return useQuery({
    queryKey: ['transport', 'fleet-status'],
    queryFn: () => transportApi.assets.fleetStatus(),
    enabled: allowed(input, 'transport-asset-compliance', 'transport.fleet_status.read'),
  });
}

export function useOperationalAlerts(input: NavigationInput) {
  return useQuery({
    queryKey: ['transport', 'alerts'],
    queryFn: () => transportApi.assets.operationalAlerts(),
    enabled: allowed(input, 'transport-asset-compliance', 'transport.alerts.read'),
  });
}

/* --- `TX-07` luong --- */

export function usePayrollPeriods(input: NavigationInput) {
  return useQuery({
    queryKey: ['transport', 'payroll', 'periods'],
    queryFn: () => transportApi.payroll.periods(),
    enabled: allowed(input, 'transport-workforce', 'transport.payroll.period.read'),
  });
}

export function usePayrollRuns(input: NavigationInput, periodId: string | null) {
  return useQuery({
    queryKey: ['transport', 'payroll', 'periods', periodId, 'runs'],
    queryFn: () => transportApi.payroll.runs(periodId as string),
    enabled:
      periodId !== null && allowed(input, 'transport-workforce', 'transport.payroll.period.read'),
  });
}

export function useRunPayslips(input: NavigationInput, runId: string | null) {
  return useQuery({
    queryKey: ['transport', 'payroll', 'runs', runId, 'payslips'],
    queryFn: () => transportApi.payroll.payslipsOfRun(runId as string),
    enabled:
      runId !== null && allowed(input, 'transport-workforce', 'transport.payroll.period.read'),
  });
}

export function usePayslipDetail(input: NavigationInput, payslipId: string | null) {
  return useQuery({
    queryKey: ['transport', 'payroll', 'payslips', payslipId],
    queryFn: () => transportApi.payroll.payslip(payslipId as string),
    enabled:
      payslipId !== null && allowed(input, 'transport-workforce', 'transport.payroll.period.read'),
  });
}

/**
 * Cau tra loi cho mot query — gom lai de moi khung nhin khong tu dien dat lai bon trang thai.
 * `isBlocked` la truong hop rieng va quan trong: query bi chan tu dau, nen KHONG phai "dang tai".
 */
export interface SectionQuery<T> {
  readonly data: T | undefined;
  readonly isLoading: boolean;
  readonly isBlocked: boolean;
  readonly errorMessage: string | null;
  readonly refetch: () => void;
}

export const toSectionQuery = <T>(query: UseQueryResult<T>): SectionQuery<T> => ({
  data: query.data,
  // `isPending` + `fetchStatus === 'idle'` la dau hieu query bi `enabled: false` chan lai.
  isLoading: query.isPending && query.fetchStatus !== 'idle',
  isBlocked: query.isPending && query.fetchStatus === 'idle',
  errorMessage: query.error === null ? null : query.error.message,
  refetch: () => void query.refetch(),
});
