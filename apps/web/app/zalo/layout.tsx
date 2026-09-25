import { loadTenantConfig, toPublicTenantDescriptor } from '@netviet/tenant';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { hasZaloIntegration } from '../../lib/tenant-runtime';

/** Do not mount the vendor-specific operator surface unless this tenant selected it. */
export default function ZaloOperatorLayout({ children }: { children: ReactNode }) {
  const tenant = toPublicTenantDescriptor(loadTenantConfig());
  if (!hasZaloIntegration(tenant)) notFound();
  return children;
}
