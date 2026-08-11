'use client';

import type { TenantConfig } from '@netviet/tenant';
import { createContext, useContext, type ReactNode } from 'react';

/**
 * Chuoi thuong hieu cua khach dang chay. Truoc Dot B1 chung nam THANG trong ma nguon app
 * (`layout.tsx`, `TopBar.tsx`, `Composer.tsx`, `SettingsShell.tsx`) — doi khach la phai sua app.
 *
 * Duong di: `app/layout.tsx` (server component) doc goi khach bang `@netviet/tenant` roi truyen
 * xuong day. Import kieu o tren la TYPE-ONLY nen `node:fs` cua goi tenant khong lot vao bundle
 * trinh duyet.
 */
export type Branding = TenantConfig['branding'] & { shortName: string };

const BrandingContext = createContext<Branding | null>(null);

export function BrandingProvider({ value, children }: { value: Branding; children: ReactNode }) {
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): Branding {
  const branding = useContext(BrandingContext);
  // Nem thay vi tra chuoi mac dinh: mot chuoi mac dinh o day se lang le hien sai ten khach.
  if (!branding) throw new Error('useBranding() phai nam trong <BrandingProvider>');
  return branding;
}
