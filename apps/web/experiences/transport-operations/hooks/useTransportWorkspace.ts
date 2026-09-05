'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuth } from '../../../components/auth/AuthGate';
import { useTenantRuntime } from '../../../lib/tenant-runtime-context';
import type { NavigationInput } from '../navigation';
import { canPerform, type TransportAction } from '../transport-actions';
import { transportApi } from '../transport-api';
import type { SettlementFlow } from '../transport-types';

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
  customers: ['transport', 'customers'],
  partners: ['transport', 'partners'],
  fuelSuppliers: ['transport', 'fuel', 'suppliers'],
  reconciliations: ['transport', 'fuel', 'reconciliations'],
  driverTrips: ['transport', 'me', 'trips'],
  driverFund: ['transport', 'me', 'fund'],
  driverFuel: ['transport', 'me', 'fuel'],
  driverPayslips: ['transport', 'me', 'payslips'],
  driverExpenseCategories: ['transport', 'me', 'expense-categories'],
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
 * — xem `api-gaps.ts#trip-has-no-names`. Nen chi goi khi da MO mot chuyen, khong goi cho ca bang.
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

export function useDriverPayslips(input: NavigationInput) {
  return useQuery({
    queryKey: TRANSPORT_QUERY_KEYS.driverPayslips,
    queryFn: () => transportApi.me.payslips(),
    enabled: allowed(input, 'transport-workforce', 'transport.driver.self.payslip.read'),
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
