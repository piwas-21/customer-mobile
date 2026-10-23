import { createContext, useContext, type PropsWithChildren } from 'react';
import usePlanState from './usePlanState';
const PlanContext = createContext<ReturnType<typeof usePlanState> | undefined>(undefined);
export default function PlanProvider({ children }: Readonly<PropsWithChildren>) {
  const state = usePlanState();
  return <PlanContext.Provider value={state}>{children}</PlanContext.Provider>;
}
export const useTablePlan = () => useContext(PlanContext);
