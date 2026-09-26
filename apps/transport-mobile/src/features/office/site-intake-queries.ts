import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { useHttp } from '../../session/SessionProvider';
import type { PlaceSearchResponse } from '../driver/types';
import { useOfficeAccess, useOfficeKey, useOfficeScope } from './queries';
import {
  EXCEPTION_ACTION,
  REVIEW_COMPLETE_ACTION,
  REVIEW_READ_ACTION,
  reviewSearchProblem,
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

/**
 * Dia diem giao DA BIET (hang rao dang hoat dong) — doc tu CUNG nguon ma lenh `complete` doi chieu
 * mot `KNOWN_PLACE`, qua CUNG ma quyen `.review.complete`. Khong dung `/transport/places/known` cua
 * man tao don: nguon do con giu hang rao cua dia diem da nghi, ma lenh nay se tu choi.
 */
export function useKnownPlaces(enabled: boolean) {
  const http = useHttp();
  const queryKey = useOfficeKey('office', 'site-intake-destinations');
  return useQuery({
    queryKey,
    enabled,
    staleTime: 5 * 60_000,
    queryFn: () => http.get<KnownPlacesResponse>(`${BASE}/destinations`),
  });
}

/** Mot lan tim — `query` la DUNG chuoi da gui (lenh `complete` tim lai bang chinh no). */
export interface ReviewSearchResult {
  readonly query: string;
  readonly response: PlaceSearchResponse;
}

export interface ReviewDestinationSearch {
  readonly busy: boolean;
  /** Chuoi chua gui duoc (qua ngan/dai) — noi truoc, khong goi may chu. */
  readonly problem: string | null;
  /** Loi mang / 403 / 404 — hien bang `ErrorBlock`, bam lai la tim lai. */
  readonly error: unknown;
  readonly result: ReviewSearchResult | null;
}

const NO_SEARCH: ReviewDestinationSearch = {
  busy: false,
  problem: null,
  error: null,
  result: null,
};

/**
 * TIM DIEM GIAO THEO TEN cho van phong — chi DOC, `POST` vi chuoi tim co the la dia chi kho cua
 * khach (#379 khong dua no vao chuoi truy van).
 *
 * Moi lan tim mang mot so thu tu: ket qua cua lan tim CU ve sau lan moi bi bo, khong de hang cua
 * chuoi cu hien duoi o nhap da doi. Cau chu + hang chon duoc la viec cua `reviewSearchOutcome`.
 */
export function useReviewDestinationSearch() {
  const http = useHttp();
  const [search, setSearch] = useState<ReviewDestinationSearch>(NO_SEARCH);
  const latest = useRef(0);

  const run = useCallback(
    async (raw: string) => {
      latest.current += 1;
      const ticket = latest.current;
      const problem = reviewSearchProblem(raw);
      if (problem !== null) {
        setSearch({ ...NO_SEARCH, problem });
        return;
      }
      const query = raw.trim();
      setSearch({ ...NO_SEARCH, busy: true });
      try {
        const response = await http.post<PlaceSearchResponse>(`${BASE}/destinations/search`, {
          query,
        });
        if (ticket === latest.current) setSearch({ ...NO_SEARCH, result: { query, response } });
      } catch (error) {
        if (ticket === latest.current) setSearch({ ...NO_SEARCH, error });
      }
    },
    [http],
  );

  const clear = useCallback(() => {
    latest.current += 1;
    setSearch(NO_SEARCH);
  }, []);

  return { search, run, clear };
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
