import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/ui/theme';
import { canUse } from '../../src/core/capabilities';
import useBootstrap from '../../src/features/restaurant/useBootstrap';
export default function RestaurantLayout() {
  const { t } = useTranslation();
  const theme = useTheme();
  const bootstrap = useBootstrap().data;
  const available = canUse(bootstrap, 'reservations');
  const tables = canUse(bootstrap, 'table-visits') && bootstrap?.flags.tableGuestVisitsV1 === true;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.secondary,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        tabBarLabelStyle: { fontSize: 14 },
      }}
    >
      <Tabs.Screen name="menu" options={{ title: t('menu') }} />
      <Tabs.Screen
        name="reservations"
        options={{ title: t('reservationTab'), href: available ? '/reservations' : null }}
      />
      <Tabs.Screen
        name="table"
        options={{ title: t('tableTitle'), href: tables ? '/table' : null }}
      />
      <Tabs.Screen name="orders" options={{ title: t('orders') }} />
      <Tabs.Screen name="account" options={{ title: t('account') }} />
    </Tabs>
  );
}
