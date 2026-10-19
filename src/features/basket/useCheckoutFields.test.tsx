import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import useCheckoutFields from './useCheckoutFields';
import { useRestaurant } from '../restaurant/RestaurantProvider';
import { setup, response } from '../../test/transport';
import { customerForms } from '../../test/customerForms';
jest.mock('../restaurant/RestaurantProvider', () => ({ useRestaurant: jest.fn() }));
function fixture(open = true) {
  const f = setup();
  jest
    .mocked(useRestaurant)
    .mockReturnValue({ context: f.context, client: f.client } as ReturnType<typeof useRestaurant>);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={cache}>{children}</QueryClientProvider>;
  }
  f.fetcher.mockResolvedValue(response({ success: true, data: customerForms() }));
  const view = renderHook(() => useCheckoutFields(open, 'Delivery'), { wrapper: Wrapper });
  return {
    ...f,
    cache,
    view,
    close: () => {
      view.unmount();
      cache.clear();
    },
  };
}
it('does not fetch forms while checkout is closed', () => {
  const f = fixture(false);
  expect(f.fetcher).not.toHaveBeenCalled();
  f.close();
});
it('loads only public tenant policy, honors delivery floors, and withdraws cached requirements on read failure', async () => {
  const f = fixture();
  try {
    await waitFor(() => expect(f.view.result.current.fields?.address.length).toBe(5));
    expect(f.view.result.current.fields?.contact.map((value) => value.key)).toEqual([
      'name',
      'email',
      'phone',
    ]);
    expect(f.fetcher.mock.calls[0]![1].headers?.Authorization).toBeUndefined();
    expect(f.fetcher.mock.calls[0]![1].headers?.['X-Session-Id']).toBeUndefined();
    f.fetcher.mockResolvedValue(response({}, 503));
    await act(async () => {
      await f.view.result.current.refetch();
    });
    await waitFor(() => expect(f.view.result.current.fields).toBeNull());
  } finally {
    f.close();
  }
});
it('unknown visible field requirements block checkout projection', async () => {
  const f = fixture();
  try {
    await waitFor(() => expect(f.view.result.current.fields).not.toBeNull());
    const forms = customerForms();
    forms[0]!.fields.push({
      fieldKey: 'futureRequired',
      isVisible: true,
      isRequired: true,
      isLocked: false,
      displayOrder: 10,
    });
    f.fetcher.mockResolvedValue(response({ success: true, data: forms }));
    await act(async () => {
      await f.view.result.current.refetch();
    });
    await waitFor(() => expect(f.view.result.current.fields).toBeNull());
  } finally {
    f.close();
  }
});
