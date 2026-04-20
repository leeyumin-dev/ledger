import { createContext, useContext } from 'react';

type SyncContextValue = {
  syncedAt: number;       // 마지막 동기화 완료 시각 (Date.now())
  sync: () => void;       // 수동 동기화 트리거
};

const defaultValue: SyncContextValue = { syncedAt: 0, sync: () => {} };

export const SyncContext = createContext<SyncContextValue>(defaultValue);

export function useSyncedAt() {
  return useContext(SyncContext).syncedAt;
}

export function useSync() {
  return useContext(SyncContext).sync;
}
