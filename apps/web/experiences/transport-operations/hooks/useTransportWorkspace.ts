'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAuth } from '../../../components/auth/AuthGate';
import { useTenantRuntime } from '../../../lib/tenant-runtime-context';
import type { NavigationInput } from '../navigation';
import { canPerform, type TransportAction } from '../transport-actions';
import { transportApi } from '../transport-api';

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
      driverId !== null && allowed(input, 'transport-costing', 'transport.costing.driver_fund.read'),
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

export const toSectionQuery = <T,>(query: UseQueryResult<T>): SectionQuery<T> => ({
  data: query.data,
  // `isPending` + `fetchStatus === 'idle'` la dau hieu query bi `enabled: false` chan lai.
  isLoading: query.isPending && query.fetchStatus !== 'idle',
  isBlocked: query.isPending && query.fetchStatus === 'idle',
  errorMessage: query.error === null ? null : query.error.message,
  refetch: () => void query.refetch(),
});
