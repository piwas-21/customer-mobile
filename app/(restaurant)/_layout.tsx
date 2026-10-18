import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/ui/theme';
export default function RestaurantLayout() {
  const { t } = useTranslation();
  const theme = useTheme();
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
      <Tabs.Screen name="orders" options={{ title: t('orders') }} />
      <Tabs.Screen name="account" options={{ title: t('account') }} />
    </Tabs>
  );
}
