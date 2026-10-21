import { createContext, useContext, type PropsWithChildren } from 'react';
import useRoundState from './useRoundState';
const RoundContext = createContext<ReturnType<typeof useRoundState> | undefined>(undefined);
export default function RoundProvider({ children }: Readonly<PropsWithChildren>) {
  const state = useRoundState();
  return <RoundContext.Provider value={state}>{children}</RoundContext.Provider>;
}
export const useTableRound = () => useContext(RoundContext);
