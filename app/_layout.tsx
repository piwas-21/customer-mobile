import PlanProvider from '../src/features/tables/PlanProvider';
import ContributionProvider from '../src/features/tables/ContributionProvider';
import RoundProvider from '../src/features/tables/RoundProvider';
import '../src/i18n';
import { useState } from 'react';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RestaurantProvider from '../src/features/restaurant/RestaurantProvider';
import SessionProvider from '../src/features/account/SessionProvider';
import ReservationProvider from '../src/features/reservations/ReservationProvider';
import CancellationProvider from '../src/features/orders/CancellationProvider';
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
            <ReservationProvider>
              <CancellationProvider>
                <PaymentProvider>
                  <RoundProvider>
                    <ContributionProvider>
                      <PlanProvider>
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
                      </PlanProvider>
                    </ContributionProvider>
                  </RoundProvider>
                </PaymentProvider>
              </CancellationProvider>
            </ReservationProvider>
          </SessionProvider>
        </RestaurantProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
