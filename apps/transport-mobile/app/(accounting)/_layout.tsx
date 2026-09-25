import { Redirect, Tabs } from 'expo-router';
import { useSession } from '../../src/session/SessionProvider';
import { TabIcon, useTabOptions } from '../../src/ui/tabs';

/** KE TOAN — chi nhung viec hop dien thoai: duyet (de nghi chi, phieu dau, phu cap cho), thu tien, quy va luong lai xe, tong quan so. */
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
          title: 'Cần duyệt',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name={focused ? 'clipboard-check' : 'clipboard-check-outline'}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="collections"
        options={{
          title: 'Thu tiền',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'cash-plus' : 'cash-plus'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="drivers"
        options={{
          title: 'Lái xe',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'account-cash' : 'account-cash-outline'} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="overview"
        options={{
          title: 'Tổng quan',
          tabBarIcon: ({ focused }) => (
            <TabIcon name={focused ? 'chart-box' : 'chart-box-outline'} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
