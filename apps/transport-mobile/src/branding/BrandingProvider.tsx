import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  DEFAULT_TIME_ZONE,
  fetchAccess,
  fetchClientDescriptor,
  type AccessView,
  type ClientDescriptor,
} from '../api/platform';
import { makeHttp, useSession } from '../session/SessionProvider';

/**
 * THUONG HIEU + NANG LUC + QUYEN cua doanh nghiep dang dung — doc tu may chu, luu dem 24 gio de
 * mo ung dung ngoai tuyen van co ten doanh nghiep va mui gio dung.
 */
interface BrandingState {
  readonly descriptor: ClientDescriptor | null;
  readonly access: AccessView | null;
  readonly productName: string;
  readonly brandColor: string | null;
  readonly timeZone: string;
  readonly loaded: boolean;
}

const BrandingContext = createContext<BrandingState>({
  descriptor: null,
  access: null,
  productName: 'Nexagent Transport',
  brandColor: null,
  timeZone: DEFAULT_TIME_ZONE,
  loaded: false,
});

export function BrandingProvider({ children }: { readonly children: ReactNode }) {
  const { serverUrl, http, session } = useSession();

  const descriptorQuery = useQuery({
    queryKey: ['platform', 'descriptor', serverUrl],
    enabled: serverUrl !== null,
    staleTime: 60 * 60 * 1000,
    queryFn: () => fetchClientDescriptor(makeHttp(serverUrl as string, () => null)),
  });

  const accessQuery = useQuery({
    queryKey: ['platform', 'access', serverUrl, session?.user.id, session?.user.role],
    enabled: http !== null,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchAccess(http!),
  });

  const value = useMemo<BrandingState>(() => {
    const descriptor = descriptorQuery.data ?? null;
    const branding = descriptor?.tenant?.branding;
    return {
      descriptor,
      access: accessQuery.data ?? null,
      productName: branding?.productName ?? 'Nexagent Transport',
      brandColor: branding?.themeColor ?? null,
      timeZone: descriptor?.tenant?.transport?.timeZone ?? DEFAULT_TIME_ZONE,
      loaded: descriptorQuery.isFetched,
    };
  }, [descriptorQuery.data, descriptorQuery.isFetched, accessQuery.data]);

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): BrandingState {
  return useContext(BrandingContext);
}
