import { useQuery } from '@tanstack/react-query';
import { useHttp } from '../../session/SessionProvider';
import type { ExpenseClaim, WaitingAllowance } from '../office/decision-types';
import { useOfficeKey } from '../office/queries';
import type { CustomerArSummary, DriverSettlementBalance, FuelEntryPage } from './types';

/** DOC cua ke toan — khoa `['accounting', <pham vi>, ...]`. */

export function usePendingClaims(enabled: boolean) {
  const http = useHttp();
  const queryKey = useOfficeKey('accounting', 'claims');
  return useQuery({
    queryKey,
    enabled,
    queryFn: () =>
      http.get<readonly ExpenseClaim[]>('/transport/expense-claims', {
        query: { status: 'PENDING_REVIEW' },
      }),
  });
}

export function useFuelInbox(enabled: boolean) {
  const http = useHttp();
  const queryKey = useOfficeKey('accounting', 'fuel', 'DECLARED');
  return useQuery({
    queryKey,
    enabled,
    queryFn: () =>
      http.get<FuelEntryPage>('/transport/fuel/entries', {
        query: { verification: 'DECLARED', limit: 50 },
      }),
  });
}

export function usePendingAllowanceList(enabled: boolean) {
  const http = useHttp();
  const queryKey = useOfficeKey('accounting', 'allowances');
  return useQuery({
    queryKey,
    enabled,
    queryFn: () => http.get<readonly WaitingAllowance[]>('/transport/waiting-allowances/pending'),
  });
}

export function useArSummary(asOf: string, enabled: boolean) {
  const http = useHttp();
  const queryKey = useOfficeKey('accounting', 'ar-summary', asOf);
  return useQuery({
    queryKey,
    enabled,
    queryFn: () =>
      http.get<CustomerArSummary>('/transport/customer-ar/summary', { query: { asOf } }),
  });
}

export function useDriverBalances(enabled: boolean) {
  const http = useHttp();
  const queryKey = useOfficeKey('accounting', 'driver-balances');
  return useQuery({
    queryKey,
    enabled,
    queryFn: async () =>
      (
        await http.get<{ readonly balances: readonly DriverSettlementBalance[] }>(
          '/transport/driver-settlement/balances',
        )
      ).balances,
  });
}
