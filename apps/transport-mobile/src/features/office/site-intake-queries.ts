import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useHttp } from '../../session/SessionProvider';
import { useOfficeAccess, useOfficeKey, useOfficeScope } from './queries';
import {
  EXCEPTION_ACTION,
  REVIEW_COMPLETE_ACTION,
  REVIEW_READ_ACTION,
  SITE_INTAKE_CAPABILITY,
} from './site-intake-review';
import type {
  BindableOrderView,
  DriverOrderActivityView,
  KnownPlacesResponse,
  OrderIntakeSourceView,
  SiteIntakeReviewView,
} from './types';

/**
 * DOC viec tai xe nhan truc tiep (`#398`) — MOT ban ghi may chu cho moi be mat: hang "Cần xử lý" cua
 * giam doc, "Cần duyệt" cua ke toan, ban tin "Đơn mới từ tài xế" va dong nguon tren chi tiet don.
 * Khong co kho thu hai tren may: moi lenh ghi xong thi doc lai tu may chu.
 */
const BASE = '/transport/site-intakes';

/** Quyen de AN khoi/nut — may chu van la cong that (403 hien nguyen van). */
export function useSiteIntakeGates() {
  const { can, has } = useOfficeAccess();
  const on = has(SITE_INTAKE_CAPABILITY);
  return {
    read: on && can(REVIEW_READ_ACTION),
    complete: on && can(REVIEW_COMPLETE_ACTION),
    exception: on && can(EXCEPTION_ACTION),
  };
}

export function useSiteIntakeReview(intakeId: string | null) {
  const http = useHttp();
  const queryKey = useOfficeKey('office', 'site-intake', intakeId);
  return useQuery({
    queryKey,
    enabled: intakeId !== null,
    staleTime: 0,
    queryFn: () => http.get<SiteIntakeReviewView>(`${BASE}/${encodeURIComponent(intakeId ?? '')}`),
  });
}

/** Dia diem da biet (hang rao) — cung nguon voi man tao don (#379). */
export function useKnownPlaces(enabled: boolean) {
  const http = useHttp();
  const queryKey = useOfficeKey('office', 'known-places');
  return useQuery({
    queryKey,
    enabled,
    staleTime: 5 * 60_000,
    queryFn: () => http.get<KnownPlacesResponse>('/transport/places/known'),
  });
}

/** Don OPEN chua lap ke hoach — NGUOI chon mot, may chu khong xep hang, khong doan. */
export function useBindableOrders(intakeId: string | null, enabled: boolean) {
  const http = useHttp();
  const queryKey = useOfficeKey('office', 'site-intake', intakeId, 'bindable-orders');
  return useQuery({
    queryKey,
    enabled: enabled && intakeId !== null,
    staleTime: 0,
    queryFn: () =>
      http.get<readonly BindableOrderView[]>(
        `${BASE}/${encodeURIComponent(intakeId ?? '')}/bindable-orders`,
      ),
  });
}

/** "ĐƠN MỚI TỪ TÀI XẾ" trong 24 gio — ban tin, khong vao hang viec can quyet. */
export function useDriverOrderActivity(enabled: boolean) {
  const http = useHttp();
  const queryKey = useOfficeKey('director', 'site-intake-activity');
  return useQuery({
    queryKey,
    enabled,
    staleTime: 60_000,
    queryFn: () =>
      http.get<readonly DriverOrderActivityView[]>(`${BASE}/activity`, { query: { hours: 24 } }),
  });
}

/** Nguon cua mot don. 404 = don khong den tu duong nay — man KHONG ve gi, khong bao loi. */
export function useOrderIntakeSource(orderId: string, enabled: boolean) {
  const http = useHttp();
  const queryKey = useOfficeKey('director', 'order-source', orderId);
  return useQuery({
    queryKey,
    enabled: enabled && orderId !== '',
    queryFn: () =>
      http.get<OrderIntakeSourceView>(`${BASE}/by-order/${encodeURIComponent(orderId)}`),
  });
}

/** Viec CHUA DU cho ke toan — cung ban ghi ma giam doc thay trong "Cần xử lý". */
export function usePendingSiteIntakes(enabled: boolean) {
  const http = useHttp();
  const queryKey = useOfficeKey('accounting', 'site-intakes');
  return useQuery({
    queryKey,
    enabled,
    queryFn: () =>
      http.get<readonly SiteIntakeReviewView[]>(BASE, { query: { status: 'PENDING' } }),
  });
}

/** Sau mot lenh: doc lai CHINH viec do + thap dieu hanh + ban tin + hang ke toan. */
export function useInvalidateSiteIntake(): () => void {
  const queryClient = useQueryClient();
  const scope = useOfficeScope();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['office', scope, 'site-intake'] });
    void queryClient.invalidateQueries({ queryKey: ['director', scope] });
    void queryClient.invalidateQueries({ queryKey: ['accounting', scope] });
  }, [queryClient, scope]);
}
