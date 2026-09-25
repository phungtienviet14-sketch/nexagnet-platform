import { Tabs } from 'expo-router';
import { TabIcon, useTabOptions } from '../../src/ui/tabs';

/** LAI XE — Run-first: "Viec" (viec ke tiep + moc hien truong), ban do lay/giao, nhien lieu, tien (quy, quyet toan, phieu luong). */
export default function Layout() {
  const options = useTabOptions();
  return (
    <Tabs screenOptions={options}>
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
    </Tabs>
  );
}
