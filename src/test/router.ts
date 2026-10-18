import type { useRouter } from 'expo-router';
export function routerFixture() {
  return {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => false),
    navigate: jest.fn(),
    dismiss: jest.fn(),
    dismissTo: jest.fn(),
    dismissAll: jest.fn(),
    canDismiss: jest.fn(() => false),
    setParams: jest.fn(),
    reload: jest.fn(),
    prefetch: jest.fn(),
  } satisfies ReturnType<typeof useRouter>;
}
