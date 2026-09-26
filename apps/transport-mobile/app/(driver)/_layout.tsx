import { Redirect, Tabs } from 'expo-router';
import { useSession } from '../../src/session/SessionProvider';
import { TabIcon, useTabOptions } from '../../src/ui/tabs';

/**
 * LAI XE — Run-first: "Việc" (viec ke tiep + moc hien truong), ban do lay/giao, nhien lieu, tien
 * (quy, quyet toan, phieu luong).
 *
 * Cac man PHU (may anh, ghi phieu dau, nhan viec, ghi khoan chi, chi tiet vong chay) nam CUNG nhom
 * nhung an khoi thanh tab (`href: null`). `backBehavior="history"`: nut lui quay ve DUNG man vua
 * mo no (tab Nhien lieu -> Ghi phieu -> lui -> Nhien lieu), khong nhay ve tab dau.
 */
const HIDDEN = { href: null } as const;

export default function Layout() {
  const options = useTabOptions();
  const { status } = useSession();
  // Het phien (401) hay dang xuat khi dang o tab cua vai -> cua vao chon lai man.
  if (status !== 'signedIn') return <Redirect href="/" />;
  return (
    <Tabs screenOptions={options} backBehavior="history">
      <Tabs.Screen
        name="index"
        options={{
          title: 'Việc',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'truck-fast' : 'truck-fast-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Bản đồ',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'map' : 'map-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="fuel"
        options={{
          title: 'Nhiên liệu',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'gas-station' : 'gas-station-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="money"
        options={{
          title: 'Tiền',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'wallet' : 'wallet-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="capture"
        options={{ ...HIDDEN, title: 'Chụp chứng từ', tabBarStyle: { display: 'none' } }}
      />
      <Tabs.Screen name="fuel-new" options={{ ...HIDDEN, title: 'Ghi phiếu đổ dầu' }} />
      {/* #398: nhan chuyen tai dia diem — toan man hinh tu the tren man Viec, KHONG phai tab thu nam. */}
      <Tabs.Screen
        name="intake"
        options={{ ...HIDDEN, title: 'Nhận chuyến', tabBarStyle: { display: 'none' } }}
      />
      <Tabs.Screen name="run/[runId]" options={{ ...HIDDEN, title: 'Vòng chạy' }} />
    </Tabs>
  );
}
