import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

function isTokenKey(name: string) {
  return /^app_\d+$/.test(name);
}

const WEEKLY_NOTIF_ID = 'ledger_weekly_settlement';

// 매주 월요일 오전 9시 결산 알림 등록 (이미 등록된 경우 스킵)
export async function scheduleWeeklySettlementNotification() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const exists = scheduled.some(n => n.identifier === WEEKLY_NOTIF_ID);
  if (exists) return;

  await Notifications.scheduleNotificationAsync({
    identifier: WEEKLY_NOTIF_ID,
    content: {
      title: '주간 결산이 완료됐습니다',
      body: '지난 주 손익계산서를 확인해보세요.',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 2, // 1=일요일, 2=월요일
      hour: 9,
      minute: 0,
    },
  });
}

// 로그아웃 시 결산 알림 해제
export async function cancelWeeklySettlementNotification() {
  await Notifications.cancelScheduledNotificationAsync(WEEKLY_NOTIF_ID);
}

const GOAL_NOTIF_ID = 'ledger_goal_check';

// 매주 일요일 오후 9시 목표 리마인더 등록
export async function scheduleGoalCheckNotification() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const exists = scheduled.some(n => n.identifier === GOAL_NOTIF_ID);
  if (exists) return;

  await Notifications.scheduleNotificationAsync({
    identifier: GOAL_NOTIF_ID,
    content: {
      title: '이번 주 투자 목표 확인',
      body: '트렌드 탭에서 이번 주 목표 달성률을 확인해보세요.',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 1, // 1=일요일
      hour: 21,
      minute: 0,
    },
  });
}

export async function cancelGoalCheckNotification() {
  await Notifications.cancelScheduledNotificationAsync(GOAL_NOTIF_ID);
}

// 오늘 이미 80% 알림 보낸 앱인지 확인
function notifiedKey(date: string, appName: string) {
  return `ledger_notif80_${date}_${appName}`;
}

export async function checkAndNotifyBudget(
  usageList: { app_name: string; duration_minutes: number; category: string }[],
  budgetMap: Record<string, { budget_minutes: number; display_name?: string }>,
  date: string
) {
  for (const usage of usageList) {
    const budget = budgetMap[usage.app_name];
    if (!budget || budget.budget_minutes <= 0) continue;

    const ratio = usage.duration_minutes / budget.budget_minutes;
    if (ratio < 0.8) continue;

    const key = notifiedKey(date, usage.app_name);
    const alreadyNotified = await AsyncStorage.getItem(key);
    if (alreadyNotified) continue;

    const pct = Math.round(ratio * 100);
    const tokenNum = usage.app_name.match(/^app_(\d+)$/)?.[1];
    const fallback = tokenNum != null ? `추적 앱 ${Number(tokenNum) + 1}` : (usage.app_name);
    const label = budget.display_name ?? fallback;
    const isOver = ratio >= 1.0;
    const usedStr = `${Math.floor(usage.duration_minutes / 60)}h ${usage.duration_minutes % 60}m`;
    const budgetStr = `${Math.floor(budget.budget_minutes / 60)}h ${budget.budget_minutes % 60}m`;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: isOver ? `⚠️ ${label} 예산 초과` : `${label} 예산 ${pct}% 소진`,
        body: isOver
          ? `오늘 ${budgetStr} 배정 중 ${usedStr}을 사용했어요.`
          : `${budgetStr} 배정 중 ${usedStr} 사용. 조금만 더 아껴요.`,
      },
      trigger: null,
    });

    await AsyncStorage.setItem(key, '1');
  }
}
