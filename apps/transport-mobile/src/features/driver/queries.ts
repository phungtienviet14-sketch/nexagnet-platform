import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { canPerform, hasCapability } from '../../api/platform';
import { useBranding } from '../../branding/BrandingProvider';
import { useHttp, useSession } from '../../session/SessionProvider';
import { outboxScope } from '../../session/session-types';
import type {
  DriverFieldWork,
  DriverIntakeView,
  DriverFuelRunView,
  DriverFuelSlipView,
  DriverFuelStationView,
  DriverFuelSupplierView,
  DriverFundStatement,
  DriverPayslipView,
  DriverSettlementSelfStatement,
  DriverTripView,
  ExpenseCatalogue,
  KnownPlacesResponse,
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

/**
 * `#398`: lan nhan chuyen CON MO cua chinh lai xe — man Viec dua lai buoc "Giao tới đâu?". Chi DOC;
 * lenh nhan chuyen khong di qua day va khong bao gio vao hang doi ngoai tuyen.
 */
export function useOpenIntake(enabled: boolean) {
  const http = useHttp();
  const scope = useScope();
  return useQuery({
    queryKey: ['me', scope, 'site-intake', 'open'],
    enabled,
    refetchInterval: FIELD_REFRESH_MS,
    queryFn: async () =>
      (
        await http.get<{ readonly intake: DriverIntakeView | null }>(
          '/transport/me/site-intake/open',
        )
      ).intake,
  });
}

/** Dia diem giao DA BIET (hang rao dang hoat dong) — cung nguon voi man tao don cua van phong. */
export function useIntakeDestinations(enabled: boolean) {
  const http = useHttp();
  const scope = useScope();
  return useQuery({
    queryKey: ['me', scope, 'site-intake', 'destinations'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: () => http.get<KnownPlacesResponse>('/transport/me/site-intake/destinations'),
  });
}

/** Sau khi nhan chuyen: doc lai MOI thu cua lai xe (viec hien truong, lan nhan chuyen con mo...). */
export function useInvalidateDriver(): () => Promise<void> {
  const queryClient = useQueryClient();
  const scope = useScope();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['me', scope] }),
    [queryClient, scope],
  );
}
