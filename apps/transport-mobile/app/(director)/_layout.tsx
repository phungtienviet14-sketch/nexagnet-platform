import { Redirect, Tabs } from 'expo-router';
import { useSession } from '../../src/session/SessionProvider';
import { TabIcon, useTabOptions } from '../../src/ui/tabs';

/** GIAM DOC — bao cao buoi sang: hom nay, viec can xu ly (hang doi cua control tower), doi xe, don hang. */
export default function Layout() {
  const options = useTabOptions();
  const { status } = useSession();
  // Het phien (401) hay dang xuat khi dang o tab cua vai -> cua vao chon lai man.
  if (status !== 'signedIn') return <Redirect href="/" />;
  return (
    <Tabs screenOptions={options}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Hôm nay',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name={focused ? 'view-dashboard' : 'view-dashboard-outline'}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Cần xử lý',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'bell-alert' : 'bell-alert-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="fleet"
        options={{
          title: 'Đội xe',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'truck' : 'truck-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Đơn hàng',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name={focused ? 'package-variant' : 'package-variant-closed'}
              focused={focused}
            />
          ),
        }}
      />
      {/* Chi tiet don — mo tu tab "Đơn hàng", khong co o tren thanh tab. */}
      <Tabs.Screen name="order/[id]" options={{ href: null, title: 'Chi tiết đơn' }} />
    </Tabs>
  );
}
