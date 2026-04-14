import { createContext, useContext } from 'react';

// sync 완료 시각 (Date.now() 값). 변경될 때마다 오늘 화면이 loadData()를 재호출.
export const SyncContext = createContext(0);

export function useSyncedAt() {
  return useContext(SyncContext);
}
