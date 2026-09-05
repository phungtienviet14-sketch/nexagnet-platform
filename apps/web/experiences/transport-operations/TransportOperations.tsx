'use client';

import { useCallback, useEffect, useState } from 'react';
import { ErrorState } from './components/SectionState';
import { DriverShell, roleLabelOf, TransportShell } from './components/TransportShell';
import { DriverSurface } from './driver/DriverSurface';
import { useNavigationInput } from './hooks/useTransportWorkspace';
import {
  buildNavigationUrl,
  findSection,
  navigationGroups,
  parseNavigationFromSearch,
  resolveNavigation,
  visibleDriverScreens,
  type DriverScreenId,
  type NavigationInput,
  type ResolvedNavigation,
  type TransportSectionId,
  type TransportSurface,
} from './navigation';
import { hasOperationsScope, operationsEmptyMessage } from './transport-actions';
import {
  ArApView,
  ExportsView,
  MaintenanceComplianceView,
  MarginView,
  PayrollView,
  SettlementView,
} from './views/AwaitingApiViews';
import { DriverFundView } from './views/DriverFundView';
import { FleetView } from './views/FleetView';
import { FuelView } from './views/FuelView';
import { OverviewView } from './views/OverviewView';
import { TripsView } from './views/TripsView';

/**
 * Be mat VAN HANH VAN TAI — `GD-23`.
 *
 * MOT experience, HAI be mat. `PG-01` cua nen tang chi cho mot tenant khai mot experience, va hop
 * dong mien §12 cam vá dieu do bang cach nhoi ca hai vao mot roi re nhanh theo VAI o tang dinh
 * tuyen. Nen be mat lai xe la mot DIA CHI RIENG (`?surface=driver`) co guard trong cung experience
 * nay, va moi payload cua no di qua kieu khung nhin rieng khong co truong doanh thu (`INV-09`).
 *
 * MOT duong duy nhat tra loi "dia chi nay nghia la gi" — `resolveNavigation`. Ca lien ket trong ung
 * dung lan dau trang deu di qua no, vi PR #111 cua b2b da chung minh dieu nguoc lai: khi bam trong
 * ung dung di duong khac voi khi mo tu dau trang, mot cau hoi co hai cau tra loi.
 */
const INITIAL: ResolvedNavigation = {
  surface: 'operations',
  section: 'overview',
  screen: 'home',
  selection: null,
};

const readNavigation = (input: NavigationInput): ResolvedNavigation =>
  typeof window === 'undefined' ? INITIAL : parseNavigationFromSearch(window.location.search, input);

export function TransportOperations() {
  const navigation = useNavigationInput();
  const [state, setState] = useState<ResolvedNavigation>(() => readNavigation(navigation));

  // Vai den SAU lan ve dau tien: `AuthGate` con dang doi `/auth/me`. Nen phai giai quyet lai dia
  // chi khi danh tinh doi — khong lam vay thi mot deep link toi muc chi Giam doc thay duoc se roi
  // ve mac dinh vinh vien du nguoi dung dung la Giam doc.
  useEffect(() => {
    setState((current) =>
      resolveNavigation(
        {
          surface: current.surface === 'driver' ? 'driver' : null,
          section: current.section,
          screen: current.screen,
          selection: current.selection,
        },
        null,
        navigation,
      ),
    );
  }, [navigation]);

  // Back/forward: doc lai tu chinh dia chi, khong doan tu trang thai truoc do.
  useEffect(() => {
    const onPopState = () => setState(readNavigation(navigation));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [navigation]);

  /**
   * Doi muc/man: `pushState` — nen Back la "ra khoi man hinh nay".
   *
   * Lich su duoc ghi NGOAI ham cap nhat cua `setState`. Ham cap nhat phai THUAN: React duoc phep
   * goi no nhieu lan cho cung mot lan dat trang thai (va o che do dev thi co tinh goi hai lan).
   * Ghi `pushState` ben trong do se day HAI muc lich su cho mot lan bam, va Back mot lan khong ra
   * khoi man hinh nua — bo E2E da bat dung loi nay.
   */
  const goTo = useCallback(
    (next: {
      readonly section?: TransportSectionId;
      readonly screen?: DriverScreenId;
      readonly surface?: TransportSurface;
    }) => {
      const surface = next.surface ?? state.surface;
      const resolved = resolveNavigation(
        {
          surface: surface === 'driver' ? 'driver' : null,
          section: next.section ?? state.section,
          screen: next.screen ?? state.screen,
          selection: state.selection,
        },
        { section: state.section, screen: state.screen },
        navigation,
      );
      window.history.pushState(null, '', buildNavigationUrl(resolved));
      setState(resolved);
    },
    [navigation, state],
  );

  /**
   * Chon mot dong TRONG mot muc: `replaceState` — nen Back la "ra khoi man hinh", khong phai mot
   * nut hoan tac cho tung lan bam dong. Cung ly do nhu tren: ghi lich su nam ngoai ham cap nhat.
   */
  const selectWithin = useCallback(
    (selection: string | null) => {
      const resolved = resolveNavigation(
        {
          surface: state.surface === 'driver' ? 'driver' : null,
          section: state.section,
          screen: state.screen,
          selection,
        },
        { section: state.section, screen: state.screen },
        navigation,
      );
      window.history.replaceState(null, '', buildNavigationUrl(resolved));
      setState(resolved);
    },
    [navigation, state],
  );

  const driverScreens = visibleDriverScreens(navigation);

  if (state.surface === 'driver') {
    return (
      <DriverShell
        screens={driverScreens}
        activeScreen={state.screen}
        onNavigate={(screen) => goTo({ surface: 'driver', screen })}
        onLeave={
          hasOperationsScope(navigation.role)
            ? () => goTo({ surface: 'operations', section: 'overview' })
            : null
        }
      >
        <DriverSurface screen={state.screen} />
      </DriverShell>
    );
  }

  const groups = navigationGroups(navigation);
  const active = findSection(state.section);

  return (
    <TransportShell
      groups={groups}
      activeSection={state.section}
      activeTitle={active?.label ?? 'Vận hành vận tải'}
      roleLabel={roleLabelOf(navigation.role)}
      driverScreens={driverScreens}
      onNavigate={(section) => goTo({ section })}
    >
      {groups.length === 0 ? (
        <ErrorState message={operationsEmptyMessage(navigation.role)} />
      ) : (
        <SectionBody section={state.section} selection={state.selection} onSelect={selectWithin} />
      )}
    </TransportShell>
  );
}

function SectionBody({
  section,
  selection,
  onSelect,
}: {
  readonly section: TransportSectionId;
  readonly selection: string | null;
  readonly onSelect: (selection: string | null) => void;
}) {
  switch (section) {
    case 'overview':
      return <OverviewView />;
    case 'trips':
      return <TripsView selection={selection} onSelect={onSelect} />;
    case 'fleet':
      return <FleetView />;
    case 'driver-fund':
      return <DriverFundView />;
    case 'fuel':
      return <FuelView />;
    case 'settlement':
      return <SettlementView />;
    case 'margin':
      return <MarginView />;
    case 'ar-ap':
      return <ArApView />;
    case 'exports':
      return <ExportsView />;
    // Hai muc duoi hien theo dung nang luc khach bat (`transport-asset-compliance` /
    // `transport-workforce` — co that trong `CapabilityId` tu khi T6 vao `main`). Man hinh cua
    // chung chua noi vao read model cua may chu; do la viec cua T7D (#170).
    case 'maintenance':
      return <MaintenanceComplianceView />;
    case 'payroll':
      return <PayrollView />;
  }
}
