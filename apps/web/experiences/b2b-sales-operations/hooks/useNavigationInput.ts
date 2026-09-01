'use client';

import { useMemo } from 'react';
import { useAuth } from '../../../components/auth/AuthGate';
import { useTenantRuntime } from '../../../lib/tenant-runtime-context';
import type { NavigationInput } from '../navigation';

/**
 * AI DANG NHIN — mot cau tra loi, dung chung cho ca be mat.
 *
 * Vo va cac trang con deu can dung mot cap (nang luc goi khach, vai tro nguoi dang xem) de tra
 * loi cau "co di duoc toi muc do khong". Dung tay ghep lai o tung cho la cach chac chan de mot
 * cho quen mat mot ve — va do la kieu khiem khuyet vua chan PR #111: mot duong vao dung luat,
 * mot duong vao khong.
 *
 * `role === null` khi CHUA BIET (che do khong phien). Y nghia cua no da duoc dinh o
 * `NavigationInput`: khong giau muc nao, vi giau di se ngu y mot quyen han khong ton tai.
 */
export function useNavigationInput(): NavigationInput {
  const tenant = useTenantRuntime();
  const { user } = useAuth();
  return useMemo(
    () => ({ capabilities: tenant.capabilities, role: user?.role ?? null }),
    [tenant.capabilities, user?.role],
  );
}
