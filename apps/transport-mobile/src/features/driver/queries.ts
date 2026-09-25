import { useQuery } from '@tanstack/react-query';
import { canPerform, hasCapability } from '../../api/platform';
import { useBranding } from '../../branding/BrandingProvider';
import { useHttp, useSession } from '../../session/SessionProvider';
import { outboxScope } from '../../session/session-types';
import type {
  DriverFieldWork,
  DriverFuelRunView,
  DriverFuelSlipView,
  DriverFuelStationView,
  DriverFuelSupplierView,
  DriverFundStatement,
  DriverPayslipView,
  DriverSettlementSelfStatement,
  DriverTripView,
  ExpenseCatalogue,
} from './types';

/**
 * DOC CUA LAI XE — moi khoa BAT DAU bang `['me', <pham vi>]`.
 *
 * `['me']` la tien to hang doi lam moi sau moi lan dong bo (`OutboxProvider`): moc vua len may chu
 * thi man doc lai ngay. Phan tu thu hai la PHAM VI (may chu + nguoi dung) — bo nho dem song 24 gio,
 * va mot may dung chung khong duoc hien viec cua nguoi dang nhap truoc.
 */
function useScope(): string {
  const { session } = useSession();
  return session ? outboxScope(session) : 'anonymous';
}

export function useDriverGates() {
  const { descriptor, access } = useBranding();
  const tenant = descriptor?.tenant ?? null;
  const allowed = (capability: string, action: string): boolean =>
    hasCapability(tenant, capability) && canPerform(access, action);
  return {
    field: allowed('transport-checkpoint', 'transport.driver.self.checkpoint.record'),
    trips: allowed('transport-core', 'transport.driver.self.trip.read'),
    siteIntake: allowed('transport-site-intake', 'transport.driver.self.site_intake.propose'),
    siteIntakeConfirm: allowed(
      'transport-site-intake',
      'transport.driver.self.site_intake.confirm',
    ),
    fuelRead: allowed('transport-fuel', 'transport.driver.self.fuel.read'),
    fuelSubmit: allowed('transport-fuel', 'transport.driver.self.fuel.submit'),
    fund: allowed('transport-costing', 'transport.driver.self.fund.read'),
    expense: allowed('transport-costing', 'transport.driver.self.expense.record'),
    settlement: allowed('transport-workforce', 'transport.driver.self.settlement.read'),
    payslips: allowed('transport-workforce', 'transport.driver.self.payslip.read'),
    tracking: canPerform(access, 'transport.driver.self.tracking.start'),
  };
}

/** Man Hien truong cua web lam moi 30 giay — giu nhip do. */
const FIELD_REFRESH_MS = 30_000;

export function useFieldWork(enabled = true) {
  const http = useHttp();
  const scope = useScope();
  return useQuery({
    queryKey: ['me', scope, 'field-work'],
    enabled,
    refetchInterval: FIELD_REFRESH_MS,
    queryFn: () => http.get<DriverFieldWork>('/transport/me/field-work'),
  });
}

export function useMyTrips(enabled: boolean) {
  const http = useHttp();
  const scope = useScope();
  return useQuery({
    queryKey: ['me', scope, 'trips'],
    enabled,
    queryFn: () => http.get<readonly DriverTripView[]>('/transport/me/trips'),
  });
}

export function useFuelSlips(enabled: boolean) {
  const http = useHttp();
  const scope = useScope();
  return useQuery({
    queryKey: ['me', scope, 'fuel', 'slips'],
    enabled,
    queryFn: () => http.get<readonly DriverFuelSlipView[]>('/transport/me/fuel/slips'),
  });
}

export function useFuelRuns(enabled: boolean) {
  const http = useHttp();
  const scope = useScope();
  return useQuery({
    queryKey: ['me', scope, 'fuel', 'runs'],
    enabled,
    queryFn: () => http.get<readonly DriverFuelRunView[]>('/transport/me/fuel/runs'),
  });
}

export function useFuelSuppliers(enabled: boolean) {
  const http = useHttp();
  const scope = useScope();
  return useQuery({
    queryKey: ['me', scope, 'fuel', 'suppliers'],
    enabled,
    staleTime: 10 * 60_000,
    queryFn: () => http.get<readonly DriverFuelSupplierView[]>('/transport/me/fuel/suppliers'),
  });
}

export function useFuelStations(supplierId: string) {
  const http = useHttp();
  const scope = useScope();
  return useQuery({
    queryKey: ['me', scope, 'fuel', 'stations', supplierId],
    enabled: supplierId !== '',
    staleTime: 10 * 60_000,
    queryFn: () =>
      http.get<readonly DriverFuelStationView[]>('/transport/me/fuel/stations', {
        query: { supplierId },
      }),
  });
}

export function useMyFund(enabled: boolean) {
  const http = useHttp();
  const scope = useScope();
  return useQuery({
    queryKey: ['me', scope, 'fund'],
    enabled,
    queryFn: () => http.get<DriverFundStatement>('/transport/me/fund'),
  });
}

export function useMySettlement(enabled: boolean) {
  const http = useHttp();
  const scope = useScope();
  return useQuery({
    queryKey: ['me', scope, 'settlement'],
    enabled,
    queryFn: () => http.get<DriverSettlementSelfStatement>('/transport/me/settlement'),
  });
}

export function useMyPayslips(enabled: boolean) {
  const http = useHttp();
  const scope = useScope();
  return useQuery({
    queryKey: ['me', scope, 'payslips'],
    enabled,
    queryFn: () => http.get<readonly DriverPayslipView[]>('/transport/me/payslips'),
  });
}

export function useExpenseCatalogue(enabled: boolean) {
  const http = useHttp();
  const scope = useScope();
  return useQuery({
    queryKey: ['me', scope, 'expense-categories'],
    enabled,
    staleTime: 10 * 60_000,
    queryFn: () => http.get<ExpenseCatalogue>('/transport/me/expense-categories'),
  });
}
