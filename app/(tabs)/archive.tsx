import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { router } from 'expo-router';
import { Calendar } from 'react-native-calendars';
import { supabase } from '../../src/lib/supabase';
import { AppHeader } from '../../src/components/AppHeader';
import { isTokenKey, getMonitoringStatus } from '../../src/lib/screenTime';
import { checkAndAwardBadges, getEarnedBadges, Badge } from '../../src/lib/badges';
import { colors, font, fontSize, spacing, radius } from '../../src/lib/theme';

const CALENDAR_THEME = {
  backgroundColor: colors.bgBase,
  calendarBackground: colors.bgBase,
  textSectionTitleColor: colors.textMuted,
  selectedDayBackgroundColor: colors.accent,
  selectedDayTextColor: '#ffffff',
  todayTextColor: colors.accent,
  dayTextColor: colors.textPrimary,
  textDisabledColor: colors.textDisabled,
  monthTextColor: colors.textPrimary,
  arrowColor: colors.accent,
  textMonthFontFamily: font.medium,
  textDayFontFamily: font.regular,
  textDayHeaderFontFamily: font.regular,
  textDayFontSize: 13,
  textMonthFontSize: 16,
  textDayHeaderFontSize: 11,
};

type WeeklyRecord = {
  id: string;
  period: string;
  detail: string;
  value: string;
  isProfit: boolean;
};

type MarkedDates = {
  [date: string]: {
    customStyles: {
      container: {
        backgroundColor: string;
        borderRadius: number;
      };
      text: {
        color: string;
        fontWeight: '600';
      };
    };
  };
};

export default function ArchiveScreen() {
  const [tab, setTab] = useState<'weekly' | 'monthly'>('weekly');
  const [records, setRecords] = useState<WeeklyRecord[]>([]);
  const [heatmap, setHeatmap] = useState<(boolean | null)[]>([]);
  const [markedDates, setMarkedDates] = useState<MarkedDates>({});
  const [badges, setBadges] = useState<Badge[]>([]);
  const [currentMonth, setCurrentMonth] = useState(
    new Date().toISOString().split('T')[0].slice(0, 7)
  );

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [usageRes, monitorStatus] = await Promise.all([
      supabase.from('app_usage').select('*').eq('user_id', user.id).order('date', { ascending: false }),
      getMonitoringStatus(),
    ]);

    const validLocalKeys = new Set(monitorStatus?.appList ?? []);
    const data = (usageRes.data ?? []).filter(u =>
      !isTokenKey(u.app_name) || validLocalKeys.has(u.app_name)
    );

    if (data.length === 0) return;

    // 날짜별 그룹화
    const byDate: Record<string, any[]> = {};
    data.forEach(item => {
      if (!byDate[item.date]) byDate[item.date] = [];
      byDate[item.date].push(item);
    });

    // 주간 기록 생성
    const byWeek: Record<string, any[]> = {};
    Object.entries(byDate).forEach(([date, items]) => {
      const week = getWeekLabel(date);
      if (!byWeek[week]) byWeek[week] = [];
      byWeek[week].push(...items);
    });

    const weeks = Object.keys(byWeek).sort().reverse();
    const weekRecords: WeeklyRecord[] = weeks.map(week => {
      const items = byWeek[week];
      const lossMinutes = items.filter(i => i.category === '소비').reduce((s: number, i: any) => s + i.duration_minutes, 0);
      const investMinutes = items.filter(i => i.category === '투자').reduce((s: number, i: any) => s + i.duration_minutes, 0);
      const topApps = [...new Set(items.map((i: any) => i.app_name))]
        .filter((name: string) => !isTokenKey(name))
        .slice(0, 2);
      const isProfit = investMinutes >= lossMinutes;
      const net = Math.abs(investMinutes - lossMinutes);
      const h = Math.floor(net / 60);
      const m = net % 60;

      return {
        id: week,
        period: week,
        detail: (topApps as string[]).join(' · '),
        value: `${isProfit ? '＋' : '－'}${h}h ${m}m`,
        isProfit,
      };
    });

    setRecords(weekRecords);

    // 히트맵 생성 (최근 26주)
    const heatmapData = Array(26).fill(null).map((_, i) => {
      const idx = weeks.length - 1 - i;
      if (idx < 0) return null;
      return weekRecords[weeks.length - 1 - i]?.isProfit ?? null;
    }).reverse();
    setHeatmap(heatmapData);

    // 월간 달력 마킹 생성
    const marked: MarkedDates = {};
    Object.entries(byDate).forEach(([date, items]) => {
      const lossMin = items.filter((i: any) => i.category === '소비').reduce((s: number, i: any) => s + i.duration_minutes, 0);
      const investMin = items.filter((i: any) => i.category === '투자').reduce((s: number, i: any) => s + i.duration_minutes, 0);
      const isProfit = investMin >= lossMin;
      const hasData = items.length > 0;

      if (hasData) {
        marked[date] = {
          customStyles: {
            container: {
              backgroundColor: isProfit ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,133,0.2)',
              borderRadius: 8,
            },
            text: {
              color: isProfit ? colors.profit : colors.loss,
              fontWeight: '600',
            },
          },
        };
      }
    });
    setMarkedDates(marked);

    // 뱃지 체크 및 로드
    await checkAndAwardBadges(user.id);
    const earned = await getEarnedBadges(user.id);
    setBadges(earned);
  }

  function getWeekLabel(dateStr: string) {
    const date = new Date(dateStr + 'T00:00:00');
    const day = date.getDay(); // 0=일, 1=월
    const diff = day === 0 ? -6 : 1 - day; // 해당 주 월요일로 이동
    const monday = new Date(date);
    monday.setDate(date.getDate() + diff);
    const month = monday.getMonth() + 1;
    const weekNum = Math.ceil(monday.getDate() / 7);
    return `${month}월 ${weekNum}주차`;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgBase }}>
      <AppHeader />
      <ScrollView style={styles.container}>

      {/* 헤더 + 토글 */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.headerSub}>기록 보관함</Text>
          <Text style={styles.headerTitle}>보관함</Text>
        </View>
        <View style={styles.toggleWrap}>
          <TouchableOpacity
            style={[styles.toggleBtn, tab === 'weekly' && styles.toggleBtnActive]}
            onPress={() => setTab('weekly')}
          >
            <Text style={[styles.toggleBtnText, tab === 'weekly' && styles.toggleBtnTextActive]}>
              주간
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, tab === 'monthly' && styles.toggleBtnActive]}
            onPress={() => setTab('monthly')}
          >
            <Text style={[styles.toggleBtnText, tab === 'monthly' && styles.toggleBtnTextActive]}>
              월간
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {tab === 'weekly' ? (
        <>
          {/* 히트맵 */}
          <View style={styles.heatmapBox}>
            <Text style={styles.heatmapLabel}>이번 해 흑자 · 적자</Text>
            <View style={styles.heatmapGrid}>
              {heatmap.map((val, i) => (
                <View
                  key={i}
                  style={[
                    styles.heatmapCell,
                    val === true && styles.cellProfit,
                    val === false && styles.cellLoss,
                    val === null && styles.cellEmpty,
                  ]}
                />
              ))}
            </View>
            <View style={styles.legend}>
              <View style={[styles.legendDot, { backgroundColor: '#e11d48' }]} />
              <Text style={styles.legendText}>낭비</Text>
              <View style={[styles.legendDot, { backgroundColor: colors.border, marginLeft: 12 }]} />
              <Text style={styles.legendText}>기록없음</Text>
              <View style={[styles.legendDot, { backgroundColor: '#16a34a', marginLeft: 12 }]} />
              <Text style={styles.legendText}>흑자</Text>
            </View>
          </View>

          {/* 뱃지 */}
          {badges.length > 0 && (
            <View style={styles.badgesSection}>
              <Text style={styles.badgesSectionLabel}>획득 뱃지</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {badges.map(badge => (
                  <View key={badge.key} style={styles.badgeCard}>
                    <Text style={styles.badgeIcon}>{badge.icon}</Text>
                    <Text style={styles.badgeTitle}>{badge.title}</Text>
                    <Text style={styles.badgeDesc}>{badge.description}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.divider} />

          {/* 주간 기록 목록 */}
          {records.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>아직 기록이 없어요</Text>
              <Text style={styles.emptySub}>오늘 화면에서 앱 사용 시간을 추가해봐요</Text>
            </View>
          ) : (
            records.map(item => (
              <TouchableOpacity
                key={item.id}
                style={styles.item}
                onPress={() => router.push({
                  pathname: '/weekly-detail',
                  params: { week: item.period }
                })}
              >
                <View>
                  <Text style={styles.itemPeriod}>{item.period}</Text>
                  <Text style={styles.itemDetail}>{item.detail}</Text>
                </View>
                <Text style={[styles.itemValue, item.isProfit ? styles.profitText : styles.lossText]}>
                  {item.value}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </>
      ) : (
        <>
          {/* 월간 달력 */}
          <Calendar
            current={`${currentMonth}-01`}
            onMonthChange={(month: any) => setCurrentMonth(
              `${month.year}-${String(month.month).padStart(2, '0')}`
            )}
            onDayPress={(day: any) => {
              router.push({
                pathname: '/daily-detail',
                params: { date: day.dateString }
              });
            }}

            markingType="custom"
            markedDates={markedDates}
            theme={CALENDAR_THEME}
          />

          {/* 범례 */}
          <View style={[styles.legend, { marginTop: 8, marginBottom: 16, paddingHorizontal: 16 }]}>
            <View style={[styles.legendDot, { backgroundColor: 'rgba(248,113,133,0.4)' }]} />
            <Text style={styles.legendText}>낭비</Text>
            <View style={[styles.legendDot, { backgroundColor: 'rgba(74,222,128,0.4)', marginLeft: 12 }]} />
            <Text style={styles.legendText}>흑자</Text>
          </View>

          {/* 이달 요약 */}
          <View style={styles.monthlySummary}>
            <Text style={styles.sectionLabel}>
              {currentMonth.replace('-', '년 ')}월 요약
            </Text>
            {(() => {
              const monthDates = Object.entries(markedDates).filter(([date]) =>
                date.startsWith(currentMonth)
              );
              const profitDays = monthDates.filter(([, v]) =>
                v.customStyles.text.color === colors.profit
              ).length;
              const lossDays = monthDates.filter(([, v]) =>
                v.customStyles.text.color === colors.loss
              ).length;

              return (
                <View style={styles.summaryRow}>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>흑자일</Text>
                    <Text style={[styles.summaryValue, { color: colors.profit }]}>{profitDays}일</Text>
                  </View>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>낭비일</Text>
                    <Text style={[styles.summaryValue, { color: colors.loss }]}>{lossDays}일</Text>
                  </View>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>기록일</Text>
                    <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{monthDates.length}일</Text>
                  </View>
                </View>
              );
            })()}
          </View>
        </>
      )}

      <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase, paddingHorizontal: spacing.lg },
  header: { paddingTop: spacing.md, paddingBottom: spacing.lg },
  tabRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: 20 },
  tabBtn: { paddingHorizontal: 20, paddingVertical: spacing.sm, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  tabBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  tabBtnText: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.textMuted },
  tabBtnTextActive: { color: '#ffffff' },
  heatmapBox: { backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  heatmapLabel: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: spacing.sm },
  heatmapGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  heatmapCell: { width: 18, height: 18, borderRadius: 3 },
  cellProfit: { backgroundColor: '#16a34a' },
  cellLoss: { backgroundColor: '#e11d48' },
  cellEmpty: { backgroundColor: colors.border },
  legend: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  legendDot: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textMuted, marginLeft: 4 },
  divider: { height: 0.5, backgroundColor: colors.border, marginBottom: spacing.sm },
  emptyBox: { paddingVertical: 48, alignItems: 'center' },
  emptyText: { fontFamily: font.medium, fontSize: fontSize.md, color: colors.textMuted, marginBottom: spacing.sm },
  emptySub: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.textDisabled, textAlign: 'center' },
  item: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: colors.bgRaised },
  itemPeriod: { fontFamily: font.medium, fontSize: 13, color: colors.textPrimary, marginBottom: 3 },
  itemDetail: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textMuted },
  itemValue: { fontFamily: font.medium, fontSize: 13 },
  profitText: { color: colors.profit },
  lossText: { color: colors.loss },
  monthlySummary: { marginTop: spacing.sm },
  sectionLabel: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: spacing.sm },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: { flex: 1, backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: 14, alignItems: 'center' },
  summaryLabel: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textMuted, marginBottom: 6 },
  summaryValue: { fontFamily: font.medium, fontSize: fontSize.xl },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  headerSub: {
    fontFamily: font.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 6,
  },
  headerTitle: {
    fontFamily: font.medium,
    fontSize: fontSize.xl,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  toggleWrap: {
    flexDirection: 'row',
    backgroundColor: colors.bgRaised,
    borderRadius: 20,
    padding: 3,
    gap: 2,
  },
  toggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  toggleBtnActive: {
    backgroundColor: colors.accent,
  },
  toggleBtnText: {
    fontFamily: font.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  toggleBtnTextActive: {
    color: '#ffffff',
  },
  reportBtn: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  reportBtnText: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.textPrimary,
  },
  badgesSection: {
    marginBottom: 20,
  },
  badgesSectionLabel: {
    fontFamily: font.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  badgeCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    padding: 14,
    marginRight: 10,
    width: 120,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeIcon: {
    fontSize: 24,
    marginBottom: spacing.sm,
  },
  badgeTitle: {
    fontFamily: font.medium,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  badgeDesc: {
    fontFamily: font.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    lineHeight: 14,
  },
});