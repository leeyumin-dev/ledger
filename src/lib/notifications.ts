import * as Notifications from 'expo-notifications';

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

