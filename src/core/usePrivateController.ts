import { useLayoutEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { restoreOrderController } from './restoreOrderController';
type Controller = { saved: () => Promise<unknown>; dispose: () => void };
let nextResourceVersion = 0;
// Callers provide a stable factory bound to the complete tenant/account/configuration scope.
export default function usePrivateController<T extends Controller>(
  create: () => T | undefined,
  ownerVersion: string,
) {
  const active = useRef<T | undefined>(undefined);
  const [lifecycle, setLifecycle] = useState({
    active: AppState.currentState === 'active',
    revision: 0,
  });
  const [resource, setResource] = useState<{
    factory: typeof create;
    ownerVersion: string;
    cycle: typeof lifecycle;
    controller: T;
    version: number;
  }>();
  useLayoutEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      active.current?.dispose();
      setLifecycle((previous) => ({ active: state === 'active', revision: previous.revision + 1 }));
    });
    return () => listener.remove();
  }, []);
  useLayoutEffect(() => {
    if (!lifecycle.active) return;
    let controller: T | undefined;
    try {
      controller = create();
    } catch {
      return;
    }
    if (!controller) return;
    const owned = controller;
    const version = ++nextResourceVersion;
    active.current = owned;
    const withdraw = restoreOrderController(owned, () =>
      setResource({ factory: create, ownerVersion, cycle: lifecycle, controller: owned, version }),
    );
    return () => {
      if (active.current === owned) active.current = undefined;
      withdraw();
    };
  }, [create, lifecycle, ownerVersion]);
  const current =
    resource?.factory === create &&
    resource.ownerVersion === ownerVersion &&
    resource.cycle === lifecycle
      ? resource
      : undefined;
  return {
    controller: current?.controller,
    version: current?.version,
    lifecycleRevision: lifecycle.revision,
  };
}
