'use client';

import { useQuery } from '@tanstack/react-query';
import { transportApi } from '../transport-api';

/**
 * VIEC DUOC DIEU cho o khai phieu dau cua lai xe — `#364` (`GET /transport/me/fuel/runs`).
 *
 * Tep RIENG chu khong them vao `useTransportWorkspace.ts`: tuyen nay thuoc `transport-fuel`, gac bang
 * chinh quyen nop phieu (`transport.driver.self.fuel.submit`), va man Nhien lieu la noi DUY NHAT dung
 * no. `enabled` do ben goi dat — man khai phieu chi goi khi lai xe duoc phep nop.
 */
export const driverFuelRunsQueryKey = ['transport', 'me', 'fuel', 'runs'] as const;

export function useDriverFuelRuns(enabled: boolean) {
  return useQuery({
    queryKey: driverFuelRunsQueryKey,
    queryFn: () => transportApi.me.fuelRuns(),
    enabled,
  });
}
