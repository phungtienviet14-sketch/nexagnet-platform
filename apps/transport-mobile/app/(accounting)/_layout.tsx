import { Tabs } from 'expo-router';
import { TabIcon, useTabOptions } from '../../src/ui/tabs';

/** KE TOAN — chi nhung viec hop dien thoai: duyet (de nghi chi, phieu dau, phu cap cho), thu tien, quy va luong lai xe, tong quan so. */
export default function Layout() {
  const options = useTabOptions();
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
