import NetInfo from '@react-native-community/netinfo';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { ApiError } from './api/errors';

/**
 * DU LIEU DOC TU MAY CHU — react-query, noi voi VONG DOI cua dien thoai:
 *   · mat mang -> dung goi (NetInfo), co mang lai -> doc lai;
 *   · ung dung quay lai tien canh -> doc lai (AppState), vi lai xe/giam doc mo lai app sau 2 tieng
 *     thi so lieu 2 tieng truoc khong duoc hien nhu so lieu bay gio.
 * Khong thu lai loi PHAN QUYET (403/400/404/409): hoi lai y het van ra y het.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 24 * 60 * 60 * 1000,
        retry: (failureCount, error) =>
          failureCount < 2 &&
          (!(error instanceof ApiError) || error.isRetryable) &&
          !(error instanceof ApiError && error.kind === 'UNAUTHENTICATED'),
        networkMode: 'offlineFirst',
      },
      mutations: { retry: false, networkMode: 'always' },
    },
  });
}

let wired = false;

export function wireQueryToDevice(): void {
  if (wired || Platform.OS === 'web') return;
  wired = true;
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    }),
  );
  AppState.addEventListener('change', (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active');
  });
}
