import '../src/i18n';
import { useState } from 'react';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RestaurantProvider from '../src/features/restaurant/RestaurantProvider';
import SessionProvider from '../src/features/account/SessionProvider';
import PaymentProvider from '../src/features/payments/PaymentProvider';
import BasketProvider from '../src/features/basket/BasketProvider';
import { useTheme } from '../src/ui/theme';
export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: 5 * 60_000 },
          mutations: { retry: false },
        },
      }),
  );
  const theme = useTheme();
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <RestaurantProvider>
          <SessionProvider>
            <PaymentProvider>
              <BasketProvider>
                <Stack
                  screenOptions={{
                    headerStyle: { backgroundColor: theme.background },
                    headerTintColor: theme.text,
                  }}
                >
                  <Stack.Screen name="index" options={{ headerShown: false }} />
                  <Stack.Screen name="(restaurant)" options={{ headerShown: false }} />
                </Stack>
              </BasketProvider>
            </PaymentProvider>
          </SessionProvider>
        </RestaurantProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
