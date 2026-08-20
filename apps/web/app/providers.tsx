'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { BrandingProvider } from '../lib/branding';
import type { PublicTenantDescriptor } from '../lib/tenant-runtime';
import { TenantRuntimeProvider } from '../lib/tenant-runtime-context';

export function Providers({ tenant, children }: { tenant: PublicTenantDescriptor; children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <TenantRuntimeProvider value={tenant}>
        <BrandingProvider value={tenant.branding}>{children}</BrandingProvider>
      </TenantRuntimeProvider>
    </QueryClientProvider>
  );
}
