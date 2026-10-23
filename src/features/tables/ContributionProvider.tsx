import { createContext, useContext, type PropsWithChildren } from 'react';
import useContributionState from './useContributionState';
const ContributionContext = createContext<ReturnType<typeof useContributionState> | undefined>(
  undefined,
);
export default function ContributionProvider({ children }: Readonly<PropsWithChildren>) {
  const state = useContributionState();
  return <ContributionContext.Provider value={state}>{children}</ContributionContext.Provider>;
}
export const useTableContribution = () => useContext(ContributionContext);
