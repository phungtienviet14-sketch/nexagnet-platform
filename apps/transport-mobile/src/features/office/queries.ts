import { useQuery, type QueryKey } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { canPerform, hasCapability } from '../../api/platform';
import { useBranding } from '../../branding/BrandingProvider';
import { useHttp, useSession } from '../../session/SessionProvider';
import { outboxScope } from '../../session/session-types';
import { makeIdempotencyKey } from './idempotency';
import type { ControlTowerView, Customer, Driver, FinanceSummaryView, Vehicle } from './types';

/**
 * DOC CHUNG cua van phong — react-query + `useHttp()`.
 *
 * Khoa bat dau bang `['director' | 'accounting' | 'office', <pham vi>]`, voi pham vi = may chu +
 * nguoi dung (cung quy uoc `outboxScope`): dang xuat roi tai khoan khac dang nhap tren CUNG may thi
 * khong bao gio thay trong mot khac so lieu cua nguoi truoc tu bo nho dem 24 gio.
 */
export type OfficeArea = 'director' | 'accounting' | 'office';

export function useOfficeScope(): string {
  const { session } = useSession();
  return session ? outboxScope(session) : 'anon';
}

export function useOfficeKey(area: OfficeArea, ...rest: readonly unknown[]): QueryKey {
  const scope = useOfficeScope();
  return [area, scope, ...rest];
}

/**
 * Quyen de AN nut/khoi — KHONG phai cong. May chu tra 403 moi la cong that, va ly do cua no phai
 * hien ra nguyen van. May chu cu (chua co `/transport/access`) -> hien het, de may chu quyet.
 */
export function useOfficeAccess(): {
  readonly can: (action: string) => boolean;
  readonly has: (capability: string) => boolean;
} {
  const { access, descriptor } = useBranding();
  const tenant = descriptor?.tenant ?? null;
  return {
    can: (action) => canPerform(access, action),
    has: (capability) => hasCapability(tenant, capability),
  };
}

/** Khoa chong ghi trung MOI — goi dung MOT lan khi mo to truot/phieu (xem `idempotency.ts`). */
export function newIdempotencyKey(scope: string): string {
  return makeIdempotencyKey(scope, randomUUID());
}

/**
 * Doc lai khi man hinh DUOC CHON lai (doi tab) neu so lieu da cu hon `maxAgeMs`. Khong doc lien tuc:
 * thap dieu hanh ton mot lan goi cho MOI vong chay o may chu.
 */
export function useRefetchOnFocus(
  refetch: () => unknown,
  dataUpdatedAt: number,
  maxAgeMs = 60_000,
): void {
  const state = useRef({ refetch, dataUpdatedAt });
  useEffect(() => {
    state.current = { refetch, dataUpdatedAt };
  }, [refetch, dataUpdatedAt]);
  useFocusEffect(
    useCallback(() => {
      const { refetch: run, dataUpdatedAt: at } = state.current;
      if (at > 0 && Date.now() - at > maxAgeMs) void run();
    }, [maxAgeMs]),
  );
}

export function useControlTower(enabled = true) {
  const http = useHttp();
  const queryKey = useOfficeKey('director', 'control-tower');
  return useQuery({
    queryKey,
    enabled,
    staleTime: 60_000,
    queryFn: () => http.get<ControlTowerView>('/transport/control-tower', { timeoutMs: 45_000 }),
  });
}

export function useFinanceSummary(enabled: boolean) {
  const http = useHttp();
  const queryKey = useOfficeKey('office', 'finance-summary');
  return useQuery({
    queryKey,
    enabled,
    staleTime: 60_000,
    queryFn: () => http.get<FinanceSummaryView>('/transport/finance/summary'),
  });
}

const MASTER_STALE_MS = 5 * 60_000;

export function useDrivers(enabled = true) {
  const http = useHttp();
  const queryKey = useOfficeKey('office', 'drivers');
  return useQuery({
    queryKey,
    enabled,
    staleTime: MASTER_STALE_MS,
    queryFn: () => http.get<readonly Driver[]>('/transport/drivers'),
  });
}

export function useVehicles(enabled = true) {
  const http = useHttp();
  const queryKey = useOfficeKey('office', 'vehicles');
  return useQuery({
    queryKey,
    enabled,
    staleTime: MASTER_STALE_MS,
    queryFn: () => http.get<readonly Vehicle[]>('/transport/vehicles'),
  });
}

export function useCustomers(enabled = true) {
  const http = useHttp();
  const queryKey = useOfficeKey('office', 'customers');
  return useQuery({
    queryKey,
    enabled,
    staleTime: MASTER_STALE_MS,
    queryFn: () => http.get<readonly Customer[]>('/transport/customers'),
  });
}

/** Ten lai xe doc duoc thay cho `driverId` — khong bao gio hien id ky thuat. */
export function driverNameOf(
  drivers: readonly Driver[] | undefined,
  driverId: string | null,
): string {
  if (driverId === null) return 'Chưa phân công lái xe';
  return drivers?.find((driver) => driver.id === driverId)?.fullName ?? 'Lái xe chưa đọc được tên';
}
