'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useReducer } from 'react';
import { api } from '../../../lib/api';
import {
  failureFor,
  isActionRunning,
  orderActionReducer,
  pendingKindFor,
  readableFailure,
  IDLE_ORDER_ACTION_STATE,
  type OrderActionKind,
} from '../workspace/action-state';
import { WORKSPACE_QUERY_KEYS } from './useWorkspaceData';

/**
 * BA THAO TAC GHI cua khong gian lam viec, noi voi API DA CO — Issue #110 §Duyệt & gửi.
 *
 * Khong endpoint nao duoc them cho U-UI1: `approve`, `reject` va `sales-handoff/complete` da ton
 * tai va da co `@Roles('SALE','MANAGER','ADMIN')` tren `OrdersController`. Quyen THAT nam o do —
 * man hinh nay khong tu cuong che gi, va cung khong gia vo cuong che (xem
 * `NAVIGATION_ENFORCEMENT_NOTE`).
 *
 * Luat "mot lan bam tai mot thoi diem" va "loi o lai tren man hinh" nam trong `action-state.ts`,
 * co test rieng. Hook nay chi noi may cua ay voi mang va voi bo nho dem.
 */

const ACTION_CALL: Readonly<Record<OrderActionKind, (reference: string) => Promise<unknown>>> = {
  approve: (reference) => api.approve(reference),
  reject: (reference) => api.reject(reference),
  'complete-handoff': (reference) => api.completeSalesHandoff(reference),
};

export interface OrderActions {
  readonly run: (reference: string, kind: OrderActionKind) => void;
  readonly dismissFailure: (reference: string) => void;
  readonly isRunning: boolean;
  readonly pendingKind: (reference: string) => OrderActionKind | null;
  readonly failure: (reference: string) => string | null;
}

export function useOrderActions(): OrderActions {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(orderActionReducer, IDLE_ORDER_ACTION_STATE);

  const run = useCallback(
    (reference: string, kind: OrderActionKind) => {
      // Cong chong bam trung nam o CA HAI phia: reducer bo qua su kien `start` khi dang ban, va
      // o day ta khong goi mang neu no da bo qua. Kiem tra o day thoi thi mot lan render cham
      // van lot duoc hai lan goi.
      if (isActionRunning(state)) return;
      dispatch({ type: 'start', reference, kind });
      void ACTION_CALL[kind](reference)
        .then(async () => {
          dispatch({ type: 'succeeded', reference });
          // Chi lam moi DONG TIN. Cong go-live va cau hinh van hanh khong doi vi mot lan duyet,
          // va hoi lai chung o day chi tra tien mang cho mot cau tra loi y het cu.
          await queryClient.invalidateQueries({ queryKey: WORKSPACE_QUERY_KEYS.messages });
        })
        .catch((error: unknown) => {
          dispatch({ type: 'failed', reference, message: readableFailure(error) });
        });
    },
    [queryClient, state],
  );

  const dismissFailure = useCallback((reference: string) => {
    dispatch({ type: 'dismiss', reference });
  }, []);

  return {
    run,
    dismissFailure,
    isRunning: isActionRunning(state),
    pendingKind: (reference) => pendingKindFor(state, reference),
    failure: (reference) => failureFor(state, reference),
  };
}
