'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { PublicTenantDescriptor } from './tenant-runtime';

const TenantRuntimeContext = createContext<PublicTenantDescriptor | null>(null);

export function TenantRuntimeProvider({
  value,
  children,
}: {
  value: PublicTenantDescriptor;
  children: ReactNode;
}) {
  return <TenantRuntimeContext.Provider value={value}>{children}</TenantRuntimeContext.Provider>;
}

export function useTenantRuntime(): PublicTenantDescriptor {
  const tenant = useContext(TenantRuntimeContext);
  if (!tenant) throw new Error('useTenantRuntime() phai nam trong <TenantRuntimeProvider>');
  return tenant;
}
