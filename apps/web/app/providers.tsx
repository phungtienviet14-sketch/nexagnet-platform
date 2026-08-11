'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { BrandingProvider, type Branding } from '../lib/branding';

export function Providers({ branding, children }: { branding: Branding; children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <BrandingProvider value={branding}>{children}</BrandingProvider>
    </QueryClientProvider>
  );
}
