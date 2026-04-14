import { useEffect, useCallback, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import {
  hasPermission,
  getDailyUsage,
  checkSyncNeeded,
  clearSyncNeeded,
  toLocalDateStr,
  UsageData,
} from '../lib/screenTime';

const LAST_SYNC_KEY = 'ledger_last_sync_date';

export function useAutoSync() {
  // sync 완료 시각 — 변경될 때마다 오늘 화면이 loadData()를 재호출
  const [syncedAt, setSyncedAt] = useState(0);

  // 특정 날짜의 사용량을 Supabase에 업로드
  const syncDate = useCallback(async (dateStr: string) => {
    const permitted = await hasPermission();
    if (!permitted) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const usageList = await getDailyUsage(dateStr);
    if (usageList.length === 0) return;

    // app_categories에서 앱 이름 → { category, bundle_id } 매핑
    const { data: categories } = await supabase
      .from('app_categories')
      .select('app_name, category, bundle_id')
      .eq('user_id', user.id);

    const catMap: Record<string, { category: string; bundle_id: string }> = {};
    categories?.forEach(c => {
      catMap[c.app_name] = { category: c.category, bundle_id: c.bundle_id ?? '' };
    });

    // 신규 앱 감지 → app_categories 자동 삽입 (category='소비' 기본값)
    const existingNames = new Set(Object.keys(catMap));
    const newApps = usageList.filter((u: UsageData) => !existingNames.has(u.app_name));
    if (newApps.length > 0) {
      await supabase.from('app_categories').upsert(
        newApps.map((u: UsageData) => ({
          user_id: user.id,
          app_name: u.app_name,
          bundle_id: '',
          category: '소비',
          budget_minutes: 0,
        })),
        { onConflict: 'user_id,app_name' }
      );
      // catMap에도 반영
      newApps.forEach((u: UsageData) => {
        catMap[u.app_name] = { category: '소비', bundle_id: '' };
      });
    }

    const rows = usageList.map((item: UsageData) => ({
      user_id: user.id,
      date: dateStr,
      app_name: item.app_name,
      bundle_id: catMap[item.app_name]?.bundle_id ?? '',
      duration_minutes: item.duration_minutes,
      category: catMap[item.app_name]?.category ?? '소비',
      source: 'auto',
    }));

    const { error } = await supabase
      .from('app_usage')
      .upsert(rows, { onConflict: 'user_id,date,app_name' });

    if (error) {
      console.warn('[AutoSync] 업로드 실패:', error.message);
    } else {
      console.log(`[AutoSync] ${dateStr} — ${rows.length}개 앱 동기화 완료`);
    }
  }, []);

  const sync = useCallback(async () => {
    const today = toLocalDateStr();
    const lastSyncDate = await AsyncStorage.getItem(LAST_SYNC_KEY);

    // 1. 날짜가 바뀐 경우 전날 데이터 sync (intervalDidEnd 미발화 대비)
    if (lastSyncDate && lastSyncDate !== today) {
      await syncDate(lastSyncDate);
    }

    // 2. 오늘 데이터 sync (앱 활성화마다)
    await syncDate(today);
    await AsyncStorage.setItem(LAST_SYNC_KEY, today);
    setSyncedAt(Date.now()); // 오늘 sync 완료 신호

    // 3. intervalDidEnd 플래그 처리 (보조 수단)
    const syncNeededDate = await checkSyncNeeded();
    if (syncNeededDate && syncNeededDate !== today && syncNeededDate !== lastSyncDate) {
      await syncDate(syncNeededDate);
      await clearSyncNeeded();
    }
  }, [syncDate]);

  useEffect(() => {
    sync();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') sync();
    });
    return () => sub.remove();
  }, [sync]);

  return { sync, syncedAt };
}
