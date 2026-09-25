import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useHttp } from '../../session/SessionProvider';
import type { OrderCompletionRow, WaitingAllowance } from '../office/decision-types';
import { useOfficeKey, useOfficeScope } from '../office/queries';
import type {
  RunJourneyView,
  RunLeg,
  TransportOrder,
  VehicleLocationHealth,
} from '../office/types';

/** DOC rieng cua giam doc — khoa `['director', <pham vi>, ...]`. */

export function useCloseOutQueue(enabled: boolean) {
  const http = useHttp();
  const queryKey = useOfficeKey('director', 'close-out-queue');
  return useQuery({
    queryKey,
    enabled,
    queryFn: async () =>
      (
        await http.get<{ readonly acceptances: readonly OrderCompletionRow[] }>(
          '/transport/commercial-acceptance',
          { query: { state: 'PENDING' } },
        )
      ).acceptances,
  });
}

export function usePendingAllowances(enabled: boolean) {
  const http = useHttp();
  const queryKey = useOfficeKey('director', 'waiting-allowances');
  return useQuery({
    queryKey,
    enabled,
    staleTime: 0,
    queryFn: () => http.get<readonly WaitingAllowance[]>('/transport/waiting-allowances/pending'),
  });
}

export function useOrders() {
  const http = useHttp();
  const queryKey = useOfficeKey('director', 'orders');
  return useQuery({
    queryKey,
    staleTime: 60_000,
    queryFn: () => http.get<readonly TransportOrder[]>('/transport/orders'),
  });
}

export function useOrder(id: string) {
  const http = useHttp();
  const orderKey = useOfficeKey('director', 'order', id);
  const legsKey = useOfficeKey('director', 'order-legs', id);
  const order = useQuery({
    queryKey: orderKey,
    queryFn: () => http.get<TransportOrder>(`/transport/orders/${encodeURIComponent(id)}`),
  });
  const legs = useQuery({
    queryKey: legsKey,
    queryFn: () => http.get<readonly RunLeg[]>(`/transport/orders/${encodeURIComponent(id)}/legs`),
  });
  return { order, legs };
}

export function useLocationHealth(vehicleId: string | null, enabled: boolean) {
  const http = useHttp();
  const queryKey = useOfficeKey('director', 'location-health', vehicleId);
  return useQuery({
    queryKey,
    enabled: enabled && vehicleId !== null,
    staleTime: 30_000,
    queryFn: () =>
      http.get<VehicleLocationHealth>(
        `/transport/vehicles/${encodeURIComponent(vehicleId ?? '')}/location-health`,
      ),
  });
}

export function useJourney(runCode: string | null) {
  const http = useHttp();
  const queryKey = useOfficeKey('director', 'journey', runCode);
  return useQuery({
    queryKey,
    enabled: runCode !== null,
    queryFn: () =>
      http.get<RunJourneyView>(`/transport/journey/runs/${encodeURIComponent(runCode ?? '')}`),
  });
}

/** Sau mot quyet dinh: doc lai moi thu cua giam doc + ho so de nghi chi (khoa `office`). */
export function useInvalidateDirector(): () => void {
  const queryClient = useQueryClient();
  const scope = useOfficeScope();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['director', scope] });
    void queryClient.invalidateQueries({ queryKey: ['office', scope, 'claim'] });
    void queryClient.invalidateQueries({ queryKey: ['accounting', scope] });
  }, [queryClient, scope]);
}
