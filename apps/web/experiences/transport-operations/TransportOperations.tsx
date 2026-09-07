'use client';

import { useCallback, useEffect, useState } from 'react';
import { ErrorState } from './components/SectionState';
import { DriverShell, roleLabelOf, TransportShell } from './components/TransportShell';
import { DriverSurface } from './driver/DriverSurface';
import { useNavigationInput } from './hooks/useTransportWorkspace';
import {
  buildDriverUrl,
  buildNavigationUrl,
  EMPTY_TRIP_FILTER_QUERY,
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
  type TripFilterQuery,
} from './navigation';
import { hasOperationsScope, operationsEmptyMessage } from './transport-actions';
import { DriverFundView } from './views/DriverFundView';
import { ExpenseClaimsView } from './views/ExpenseClaimsView';
import { ExportsView } from './views/ExportsView';
import { MaintenanceComplianceView } from './views/MaintenanceView';
import { DriverSettlementView } from './views/DriverSettlementView';
import { MovementView } from './views/MovementView';
import { PayrollView } from './views/PayrollView';
import { ArApView, MarginView, SettlementView } from './views/SettlementViews';
import { FleetView } from './views/FleetView';
import { FuelView } from './views/FuelView';
import { ControlTowerView } from './views/ControlTowerView';
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
  tripFilter: EMPTY_TRIP_FILTER_QUERY,
};

const readNavigation = (input: NavigationInput): ResolvedNavigation =>
  typeof window === 'undefined'
    ? INITIAL
    : parseNavigationFromSearch(window.location.search, input);

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
          tripFilter: current.tripFilter,
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
          // Doi muc thi `resolveNavigation` tu bo bo loc di — cung luat voi lua chon (#222 P2 §3).
          tripFilter: state.tripFilter,
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
   *
   * LUA CHON VA BO LOC DOI TRONG CUNG MOT LAN GOI, khong phai hai. Man Chuyen xe bam mot dong thi
   * vua chon chuyen do vua dat ma chuyen vao o tim kiem; goi `selectWithin` roi `filterWithin` se
   * SAI: ca hai `useCallback` deu dong lai tren `state` cua CUNG mot lan ve, nen loi goi thu hai
   * ghi de ket qua cua loi goi thu nhat va lua chon quay ve gia tri cu.
   */
  const selectWithin = useCallback(
    (selection: string | null, tripFilter?: TripFilterQuery) => {
      const resolved = resolveNavigation(
        {
          surface: state.surface === 'driver' ? 'driver' : null,
          section: state.section,
          screen: state.screen,
          selection,
          tripFilter: tripFilter ?? state.tripFilter,
        },
        { section: state.section, screen: state.screen },
        navigation,
      );
      window.history.replaceState(null, '', buildNavigationUrl(resolved));
      setState(resolved);
    },
    [navigation, state],
  );

  /**
   * DOI BO LOC — `replaceState`, cung ly le voi `selectWithin` (#222 P2).
   *
   * KHONG `pushState`: mot o tim kiem day mot muc lich su cho MOI KY TU go vao, va Back se thanh
   * nut xoa tung chu. Nguoi dung mong Back la "ra khoi man hinh nay", va chinh yeu cau §2 cua #222
   * ("Back/Forward restores prior filter state") duoc dap ung boi cac moc lich su THAT — doi muc,
   * hoac mot dia chi duoc mo tu ngoai — chu khong boi tung phim.
   */
  const filterWithin = useCallback(
    (tripFilter: TripFilterQuery) => {
      const resolved = resolveNavigation(
        {
          surface: state.surface === 'driver' ? 'driver' : null,
          section: state.section,
          screen: state.screen,
          selection: state.selection,
          tripFilter,
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
        <ErrorState
          message={operationsEmptyMessage(navigation.role)}
          // Cau chu noi "Hãy dùng đường 'Mở màn hình lái xe'" — nen duong do phai o NGAY DAY.
          // Trong thanh ben thi o 1440px no co that, con o 390px thanh ben da gap lai, va 390px
          // moi la thiet bi cua lai xe.
          action={
            driverScreens.length === 0 ? undefined : (
              <a className="tx-btn" href={buildDriverUrl('home')}>
                Mở màn hình lái xe →
              </a>
            )
          }
        />
      ) : (
        <SectionBody
          section={state.section}
          selection={state.selection}
          onSelect={selectWithin}
          tripFilter={state.tripFilter}
          onTripFilterChange={filterWithin}
        />
      )}
    </TransportShell>
  );
}

function SectionBody({
  section,
  selection,
  onSelect,
  tripFilter,
  onTripFilterChange,
}: {
  readonly section: TransportSectionId;
  readonly selection: string | null;
  /** Bo loc di kem la TUY CHON — chi man Chuyen xe dat no cung luc voi lua chon. */
  readonly onSelect: (selection: string | null, tripFilter?: TripFilterQuery) => void;
  readonly tripFilter: TripFilterQuery;
  readonly onTripFilterChange: (filter: TripFilterQuery) => void;
}) {
  switch (section) {
    case 'overview':
      return <OverviewView />;
    case 'control-tower':
      return <ControlTowerView />;
    case 'trips':
      return (
        <TripsView
          selection={selection}
          onSelect={onSelect}
          filter={tripFilter}
          onFilterChange={onTripFilterChange}
        />
      );
    case 'movement':
      return <MovementView />;
    case 'fleet':
      return <FleetView />;
    case 'driver-fund':
      return <DriverFundView />;
    case 'expense-claims':
      return <ExpenseClaimsView />;
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
    // `transport-workforce`) va nay doc thang read model cua may chu — T7D (#170) da noi chung vao.
    case 'maintenance':
      return <MaintenanceComplianceView />;
    case 'payroll':
      return <PayrollView />;
    // `TX-07b` (#237) — chi tien cho lai xe. Cung capability voi man Luong, nhung mot ma quyen
    // RIENG: xem duoc bang luong khong nhat thiet xem duoc lich su chi tien mat.
    case 'driver-settlement':
      return <DriverSettlementView />;
  }
}
