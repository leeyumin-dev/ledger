import { NativeModules, Platform } from 'react-native';

const { ScreenTimeModule } = NativeModules;

export type UsageData = {
  app_name: string;
  bundle_id: string;
  duration_minutes: number;
};

function hasModule(): boolean {
  return Platform.OS === 'ios' && !!ScreenTimeModule;
}

// 토큰 키 여부 판별 (app_0, app_1, ...)
export function isTokenKey(name: string): boolean {
  return /^app_\d+$/.test(name);
}

// 권한 요청
export async function requestPermission(): Promise<boolean> {
  if (!hasModule()) return false;
  try {
    const result = await ScreenTimeModule.requestAuthorization();
    return result === 'authorized';
  } catch (e) {
    console.warn('[ScreenTime] requestPermission error:', e);
    return false;
  }
}

// 권한 상태 확인
export async function hasPermission(): Promise<boolean> {
  if (!hasModule()) return false;
  try {
    return (await ScreenTimeModule.getAuthorizationStatus()) === 'approved';
  } catch {
    return false;
  }
}

// 피커 열기 → 선택된 앱을 __pending_0__, __pending_1__... 으로 저장
// 반환: 'cancelled' 또는 { count: N }
export async function presentPickerForToken(): Promise<'cancelled' | { count: number }> {
  if (!hasModule()) return 'cancelled';
  try {
    const raw = (await ScreenTimeModule.presentPickerForToken()) as string;
    if (raw === 'cancelled') return 'cancelled';
    const count = parseInt(raw.split(':')[1] ?? '1', 10);
    return { count };
  } catch (e) {
    console.warn('[ScreenTime] presentPickerForToken error:', e);
    return 'cancelled';
  }
}

// __pending_{index}__ 토큰에 자동으로 app_N 키 부여 → 새 키 반환, 중복이면 null
export async function confirmPendingTokenAuto(index: number): Promise<string | null> {
  if (!hasModule()) return null;
  try {
    const result = await ScreenTimeModule.confirmPendingTokenAuto(index);
    if (result === null || result === undefined) return null;
    return result as string;
  } catch (e) {
    console.warn('[ScreenTime] confirmPendingTokenAuto error:', e);
    return null;
  }
}

// 앱 토큰 하나 제거
export async function removeAppToken(appKey: string): Promise<void> {
  if (!hasModule()) return;
  try {
    await ScreenTimeModule.removeAppToken(appKey);
  } catch (e) {
    console.warn('[ScreenTime] removeAppToken error:', e);
  }
}

// 저장된 앱 토큰 전체 초기화
export async function clearAppTokens(): Promise<void> {
  if (!hasModule()) return;
  try {
    await ScreenTimeModule.clearAppTokens();
  } catch (e) {
    console.warn('[ScreenTime] clearAppTokens error:', e);
  }
}

// 모니터링 시작
export async function startMonitoring(): Promise<boolean> {
  if (!hasModule()) return false;
  try {
    return await ScreenTimeModule.startMonitoring();
  } catch (e) {
    console.warn('[ScreenTime] startMonitoring error:', e);
    return false;
  }
}

// 모니터링 중지
export async function stopMonitoring(): Promise<boolean> {
  if (!hasModule()) return false;
  try {
    return await ScreenTimeModule.stopMonitoring();
  } catch (e) {
    console.warn('[ScreenTime] stopMonitoring error:', e);
    return false;
  }
}

// 일일 사용량 읽기
export async function getDailyUsage(dateStr: string): Promise<UsageData[]> {
  if (!hasModule()) return [];
  try {
    const json = (await ScreenTimeModule.getDailyUsage(dateStr)) as string;
    return JSON.parse(json) as UsageData[];
  } catch (e) {
    console.warn('[ScreenTime] getDailyUsage error:', e);
    return [];
  }
}

export type MonitoringStatus = {
  hasSelection: boolean;
  appList: string[];
  appMap: string;
  todayUsage: string;
  syncNeeded: string | null;
  date: string;
};

// 모니터링 상태 조회
export async function getMonitoringStatus(): Promise<MonitoringStatus | null> {
  if (!hasModule()) return null;
  try {
    const json = await ScreenTimeModule.getMonitoringStatus() as string;
    return JSON.parse(json) as MonitoringStatus;
  } catch (e) {
    console.warn('[ScreenTime] getMonitoringStatus error:', e);
    return null;
  }
}

// sync 플래그 확인
export async function checkSyncNeeded(): Promise<string | null> {
  if (!hasModule()) return null;
  try {
    return await ScreenTimeModule.checkSyncNeeded();
  } catch {
    return null;
  }
}

// sync 플래그 초기화
export async function clearSyncNeeded(): Promise<void> {
  if (!hasModule()) return;
  try {
    await ScreenTimeModule.clearSyncNeeded();
  } catch (e) {
    console.warn('[ScreenTime] clearSyncNeeded error:', e);
  }
}

export function toLocalDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
