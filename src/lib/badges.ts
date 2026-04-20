import { supabase } from './supabase';

export type Badge = {
  key: string;
  title: string;
  description: string;
  icon: string;
  earned_at?: string;
};

export const BADGE_DEFINITIONS: Badge[] = [
  // 연속 기록
  { key: 'streak_7', title: '일주일 연속', description: '7일 연속 기록을 남겼어요', icon: '🔥' },
  { key: 'streak_30', title: '한 달 연속', description: '30일 연속 기록을 남겼어요', icon: '🔥' },
  // 투자 목표 달성
  { key: 'goal_1', title: '첫 목표 달성', description: '주간 투자 목표를 처음 달성했어요', icon: '🏆' },
  { key: 'goal_4', title: '4주 연속 달성', description: '4주 연속 주간 투자 목표를 달성했어요', icon: '🥇' },
  // 총 투자 시간
  { key: 'invest_10h', title: '10시간 투자', description: '총 투자 시간이 10시간을 넘었어요', icon: '⏱' },
  { key: 'invest_50h', title: '50시간 투자', description: '총 투자 시간이 50시간을 넘었어요', icon: '⏱' },
  { key: 'invest_100h', title: '100시간 투자', description: '총 투자 시간이 100시간을 넘었어요', icon: '💎' },
  // 절약
  { key: 'budget_week', title: '예산 준수', description: '한 주 동안 모든 소비 앱 예산을 지켰어요', icon: '🛡' },
];

export async function checkAndAwardBadges(userId: string): Promise<Badge[]> {
  const [usageRes, categoriesRes, badgesRes] = await Promise.all([
    supabase.from('app_usage').select('app_name, date, duration_minutes, category').eq('user_id', userId),
    supabase.from('app_categories').select('app_name, category, goal_minutes, budget_minutes').eq('user_id', userId),
    supabase.from('badges').select('badge_key, earned_at').eq('user_id', userId),
  ]);

  const usageRows = usageRes.data ?? [];
  const categories = categoriesRes.data ?? [];
  const earnedKeys = new Set((badgesRes.data ?? []).map(b => b.badge_key));
  const newBadges: Badge[] = [];

  async function award(key: string) {
    if (earnedKeys.has(key)) return;
    await supabase.from('badges').insert({ user_id: userId, badge_key: key });
    earnedKeys.add(key);
    const def = BADGE_DEFINITIONS.find(b => b.key === key);
    if (def) newBadges.push(def);
  }

  // --- 연속 기록 체크 ---
  const dates = [...new Set(usageRows.map(u => u.date))].sort();
  let maxStreak = 0, currentStreak = 0;
  for (let i = 0; i < dates.length; i++) {
    if (i === 0) { currentStreak = 1; continue; }
    const prev = new Date(dates[i - 1] + 'T00:00:00');
    const curr = new Date(dates[i] + 'T00:00:00');
    const diff = (curr.getTime() - prev.getTime()) / 86400000;
    currentStreak = diff === 1 ? currentStreak + 1 : 1;
    maxStreak = Math.max(maxStreak, currentStreak);
  }
  if (maxStreak >= 7) await award('streak_7');
  if (maxStreak >= 30) await award('streak_30');

  // --- 총 투자 시간 체크 ---
  const totalInvestMinutes = usageRows
    .filter(u => u.category === '투자')
    .reduce((s, u) => s + u.duration_minutes, 0);
  if (totalInvestMinutes >= 10 * 60) await award('invest_10h');
  if (totalInvestMinutes >= 50 * 60) await award('invest_50h');
  if (totalInvestMinutes >= 100 * 60) await award('invest_100h');

  // --- 주간 투자 목표 달성 체크 ---
  const investApps = categories.filter(c => c.category === '투자' && (c.goal_minutes ?? 0) > 0);
  if (investApps.length > 0) {
    // 주차별 달성 여부
    function getWeekKey(dateStr: string) {
      const d = new Date(dateStr + 'T00:00:00');
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const monday = new Date(d);
      monday.setDate(d.getDate() + diff);
      return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    }

    const weeksByApp: Record<string, Record<string, number>> = {};
    usageRows.filter(u => u.category === '투자').forEach(u => {
      if (!weeksByApp[u.app_name]) weeksByApp[u.app_name] = {};
      const wk = getWeekKey(u.date);
      weeksByApp[u.app_name][wk] = (weeksByApp[u.app_name][wk] || 0) + u.duration_minutes;
    });

    const allWeeks = [...new Set(Object.values(weeksByApp).flatMap(w => Object.keys(w)))].sort();
    let consecutiveGoalWeeks = 0;
    let totalGoalWeeks = 0;

    for (const wk of allWeeks) {
      const allMet = investApps.every(app => {
        const actual = weeksByApp[app.app_name]?.[wk] ?? 0;
        return actual >= (app.goal_minutes ?? 0);
      });
      if (allMet) {
        totalGoalWeeks++;
        consecutiveGoalWeeks++;
      } else {
        consecutiveGoalWeeks = 0;
      }
    }

    if (totalGoalWeeks >= 1) await award('goal_1');
    if (consecutiveGoalWeeks >= 4) await award('goal_4');
  }

  // --- 예산 준수 주간 체크 ---
  const consumeApps = categories.filter(c => c.category === '소비' && (c.budget_minutes ?? 0) > 0);
  if (consumeApps.length > 0) {
    function getWeekKey(dateStr: string) {
      const d = new Date(dateStr + 'T00:00:00');
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const monday = new Date(d);
      monday.setDate(d.getDate() + diff);
      return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    }

    const weekUsage: Record<string, Record<string, number>> = {};
    usageRows.filter(u => u.category === '소비').forEach(u => {
      if (!weekUsage[u.app_name]) weekUsage[u.app_name] = {};
      const wk = getWeekKey(u.date);
      weekUsage[u.app_name][wk] = (weekUsage[u.app_name][wk] || 0) + u.duration_minutes;
    });

    const allWeeks = [...new Set(Object.values(weekUsage).flatMap(w => Object.keys(w)))].sort();
    for (const wk of allWeeks) {
      const allUnder = consumeApps.every(app => {
        const actual = weekUsage[app.app_name]?.[wk] ?? 0;
        return actual <= (app.budget_minutes ?? 0) * 7;
      });
      if (allUnder) { await award('budget_week'); break; }
    }
  }

  return newBadges;
}

export async function getEarnedBadges(userId: string): Promise<Badge[]> {
  const { data } = await supabase.from('badges').select('badge_key, earned_at').eq('user_id', userId);
  if (!data) return [];
  return data
    .map(b => {
      const def = BADGE_DEFINITIONS.find(d => d.key === b.badge_key);
      return def ? { ...def, earned_at: b.earned_at } : null;
    })
    .filter(Boolean) as Badge[];
}
