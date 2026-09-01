'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { OrderView } from '@netviet/shared';
import { api } from '../../../lib/api';
import { settingsApi, type ReadinessView, type SettingsSummary } from '../../../lib/settings';
import type { ChannelSignal } from '../workspace/alerts';

/**
 * BA NGUON cua khong gian lam viec — va CO Y de chung roi nhau.
 *
 * Mot `useQuery` cho moi nguon, khong gop thanh mot lan goi chung. Ly do la ly do cua Issue #107
 * §7 va Issue #110 doi lai mot lan nua: mot muc chet khong duoc phep lam trang mot muc khac. Neu
 * `/messages` loi ma cau "COD chưa sẵn sàng" cung bien mat theo, thi man hinh dang noi doi ve
 * mot thu no van biet ro.
 *
 * `staleTime` khac nhau vi ba nguon doi voi TOC DO KHAC NHAU: dong tin nhan doi tung phut, cong
 * go-live va cau hinh van hanh doi theo ngay. Hoi lai cau hinh moi lan chuyen tab chi lam cham
 * man hinh ma khong doi lay thong tin nao moi.
 */

export const WORKSPACE_QUERY_KEYS = {
  messages: ['b2b', 'messages'] as const,
  readiness: ['b2b', 'readiness'] as const,
  summary: ['b2b', 'settings-summary'] as const,
};

const SLOW_MOVING_MS = 60_000;

export function useMessageStream(): UseQueryResult<OrderView[]> {
  return useQuery({ queryKey: WORKSPACE_QUERY_KEYS.messages, queryFn: api.messages });
}

export function useReadiness(): UseQueryResult<ReadinessView> {
  return useQuery({
    queryKey: WORKSPACE_QUERY_KEYS.readiness,
    queryFn: settingsApi.readiness,
    staleTime: SLOW_MOVING_MS,
  });
}

/**
 * Cau hinh van hanh — nguon cua tin hieu kenh va cua nguong tu dong gui.
 *
 * `settingsApi.summary()` KHONG bao gio nem: khi `/settings/summary` hong no tu lui ve mot ban
 * ghep tu cac endpoint cu va ha `availability` xuong `fallback`/`unavailable` (xem
 * `fetchFallbackSummary` trong lib/settings.ts). Nghia la o day khong co trang thai "loi" —
 * co mot trang thai DEGRADED, va chinh no la thu muc Cảnh báo phai doc ra thanh mot dong.
 */
export function useOperationalSummary(): UseQueryResult<SettingsSummary> {
  return useQuery({
    queryKey: WORKSPACE_QUERY_KEYS.summary,
    queryFn: settingsApi.summary,
    staleTime: SLOW_MOVING_MS,
  });
}

/** Chi lay DUNG nam truong can cho canh bao — khong mang ca `summary` (co `zcaChatId`) di xa. */
export function toChannelSignal(summary: SettingsSummary | undefined): ChannelSignal | null {
  if (!summary) return null;
  return {
    availability: summary.availability,
    channelMode: summary.channelMode,
    zcaState: summary.zcaState,
  };
}

/** Nguong so luong duoc tu dong gui, hoac `null` khi chua doc duoc / khach khong bat ban hang. */
export function toAutoConfirmThreshold(summary: SettingsSummary | undefined): number | null {
  const automation = summary?.orderAutomation ?? null;
  if (!automation || !automation.enabled) return null;
  return automation.maxAutoConfirmQuantity;
}
