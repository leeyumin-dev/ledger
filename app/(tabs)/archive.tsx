import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Dimensions
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Calendar } from 'react-native-calendars';
import { supabase } from '../../src/lib/supabase';
import { AppHeader } from '../../src/components/AppHeader';
import { isTokenKey, getMonitoringStatus } from '../../src/lib/screenTime';
import { checkAndAwardBadges, getEarnedBadges, Badge } from '../../src/lib/badges';
import { colors, font, fontSize, spacing, radius, shadows, gradients } from '../../src/lib/theme';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const CALENDAR_THEME = {
  backgroundColor: colors.bgBase,
  calendarBackground: 'transparent',
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
      container: { backgroundColor: string; borderRadius: number };
      text: { color: string; fontWeight: '600' };
    };
  };
};

export default function ArchiveScreen() {
  const [tab, setTab] = useState<'weekly' | 'monthly'>('weekly');
  const [records, setRecords] = useState<WeeklyRecord[]>([]);
  const [heatmap, setHeatmap] = useState<(boolean | null)[]>(Array(26).fill(null));
  const [markedDates, setMarkedDates] = useState<MarkedDates>({});
  const [badges, setBadges] = useState<Badge[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().split('T')[0].slice(0, 7));

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [settingsRes, usageRes, monitorStatus] = await Promise.all([
      supabase.from('user_settings').select('sleep_hours, work_hours').eq('user_id', user.id).single(),
      supabase.from('app_usage').select('*').eq('user_id', user.id).order('date', { ascending: false }),
      getMonitoringStatus(),
    ]);

    const sl = settingsRes.data?.sleep_hours ?? 7.5;
    const wk = settingsRes.data?.work_hours ?? 8.0;
    const disposablePerDayMin = (24 - sl - wk) * 60;

    const validLocalKeys = new Set(monitorStatus?.appList ?? []);
    const rawData = usageRes.data ?? [];
    const data = rawData.filter(u => !isTokenKey(u.app_name) || validLocalKeys.has(u.app_name));

    const byDate: Record<string, any[]> = {};
    data.forEach(item => { if (!byDate[item.date]) byDate[item.date] = []; byDate[item.date].push(item); });

    const byWeek: Record<string, any[]> = {};
    Object.entries(byDate).forEach(([date, items]) => {
      const week = getWeekLabel(date);
      if (!byWeek[week]) byWeek[week] = [];
      byWeek[week].push(...items);
    });

    const weeks = Object.keys(byWeek).sort().reverse();
    const weekRecords: WeeklyRecord[] = weeks.map(week => {
      const items = byWeek[week];
      const datesInWeek = [...new Set(items.map((i: any) => i.date))].length;
      const weekDisposable = (24 - sl - wk) * 7 * 60; // 주간 고정 가처분 시간
      
      const lossMin = items.filter(i => i.category === '소비').reduce((s: number, i: any) => s + i.duration_minutes, 0);
      const investMin = items.filter(i => i.category === '투자').reduce((s: number, i: any) => s + i.duration_minutes, 0);
      const essentialMin = items.filter(i => i.category === '필수').reduce((s: number, i: any) => s + i.duration_minutes, 0);
      
      const net = weekDisposable - lossMin - essentialMin + investMin;
      const isProfit = net >= 0;
      const topApps = [...new Set(items.map((i: any) => i.app_name))].slice(0, 3);
      
      return { 
        id: week, 
        period: week, 
        detail: (topApps as string[]).join(' · '), 
        value: `${isProfit ? '＋' : '－'}${Math.floor(Math.abs(net) / 60)}h ${Math.abs(net) % 60}m`, 
        isProfit 
      };
    });

    setRecords(weekRecords);

    const heatmapData = Array(26).fill(null).map((_, i) => {
      const idx = weeks.length - 1 - i;
      return idx < 0 ? null : (weekRecords[idx]?.isProfit ?? null);
    }).reverse();
    setHeatmap(heatmapData);

    const marked: MarkedDates = {};
    Object.entries(byDate).forEach(([date, items]) => {
      const lossMin = items.filter((i: any) => i.category === '소비').reduce((s: number, i: any) => s + i.duration_minutes, 0);
      const investMin = items.filter((i: any) => i.category === '투자').reduce((s: number, i: any) => s + i.duration_minutes, 0);
      const essentialMin = items.filter((i: any) => i.category === '필수').reduce((s: number, i: any) => s + i.duration_minutes, 0);
      
      const dayNet = disposablePerDayMin - lossMin - essentialMin + investMin;
      const dayIsProfit = dayNet >= 0;

      marked[date] = { 
        customStyles: { 
          container: { 
            backgroundColor: dayIsProfit ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)', 
            borderRadius: 8 
          }, 
          text: { 
            color: dayIsProfit ? colors.profit : colors.loss, 
            fontWeight: '600' 
          } 
        } 
      };
    });
    setMarkedDates(marked);

    await checkAndAwardBadges(user.id);
    const earned = await getEarnedBadges(user.id);
    setBadges(earned);
  }

  function getWeekLabel(dateStr: string) {
    const date = new Date(dateStr + 'T00:00:00');
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(date); monday.setDate(date.getDate() + diff);
    return `${monday.getMonth() + 1}월 ${Math.ceil(monday.getDate() / 7)}주차`;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgBase }}>
      <LinearGradient colors={gradients.primaryGlow} style={styles.glow} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} />
      <AppHeader />
      
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerSub}>TIME ARCHIVE</Text>
            <Text style={styles.headerTitle}>보관함</Text>
          </View>
          <View style={styles.tabToggle}>
            <TouchableOpacity style={[styles.tabBtn, tab === 'weekly' && styles.tabBtnActive]} onPress={() => setTab('weekly')}>
              <Text style={[styles.tabBtnText, tab === 'weekly' && styles.tabBtnTextActive]}>주간</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tabBtn, tab === 'monthly' && styles.tabBtnActive]} onPress={() => setTab('monthly')}>
              <Text style={[styles.tabBtnText, tab === 'monthly' && styles.tabBtnTextActive]}>월간</Text>
            </TouchableOpacity>
          </View>
        </View>

        {tab === 'weekly' ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Annual Performance (26w)</Text>
              <View style={styles.heatmapGrid}>
                {heatmap.map((val, i) => (
                  <View key={i} style={[
                    styles.heatmapCell, 
                    val === true && styles.cellProfit, 
                    val === false && styles.cellLoss,
                    val === null && styles.cellEmpty
                  ]} />
                ))}
              </View>
              <View style={styles.legend}>
                <View style={[styles.legendDot, { backgroundColor: colors.profit }]} /><Text style={styles.legendText}>흑자</Text>
                <View style={[styles.legendDot, { backgroundColor: colors.loss, marginLeft: 12 }]} /><Text style={styles.legendText}>손실</Text>
                <View style={[styles.legendDot, { backgroundColor: '#2a2a2a', marginLeft: 12 }]} /><Text style={styles.legendText}>기록없음</Text>
              </View>
            </View>

            {badges.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Earned Badges</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 20 }}>
                  {badges.map(badge => (
                    <View key={badge.key} style={styles.badgeCard}>
                      <Text style={styles.badgeIcon}>{badge.icon}</Text>
                      <Text style={styles.badgeName}>{badge.title}</Text>
                      <Text style={styles.badgeDesc} numberOfLines={2}>{badge.description}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Weekly Log</Text>
              {records.length === 0 ? (
                <View style={styles.emptyBox}><Text style={styles.emptyText}>아직 기록이 없어요</Text></View>
              ) : (
                records.map(item => (
                  <TouchableOpacity key={item.id} style={styles.weekCard} onPress={() => router.push({ pathname: '/weekly-detail', params: { week: item.period } })}>
                    <View style={styles.weekInfo}>
                      <Text style={styles.weekPeriod}>{item.period}</Text>
                      <Text style={styles.weekApps} numberOfLines={1}>{item.detail}</Text>
                    </View>
                    <View style={styles.weekValue}>
                      <Text style={[styles.valText, item.isProfit ? styles.valProfit : styles.valLoss]}>{item.value}</Text>
                      <Text style={styles.valSub}>{item.isProfit ? 'PROFIT' : 'LOSS'}</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </>
        ) : (
          <View style={styles.monthlyContainer}>
            <View style={styles.calendarCard}>
              <Calendar
                current={`${currentMonth}-01`}
                onMonthChange={(m: any) => setCurrentMonth(`${m.year}-${String(m.month).padStart(2, '0')}`)}
                onDayPress={(d: any) => router.push({ pathname: '/daily-detail', params: { date: d.dateString } })}
                markingType="custom"
                markedDates={markedDates}
                theme={CALENDAR_THEME}
              />
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{currentMonth.replace('-', '년 ')}월 요약</Text>
              <View style={styles.summaryRow}>
                {(() => {
                  const monthDates = Object.entries(markedDates).filter(([d]) => d.startsWith(currentMonth));
                  const pDays = monthDates.filter(([, v]) => v.customStyles.text.color === colors.profit).length;
                  const lDays = monthDates.filter(([, v]) => v.customStyles.text.color === colors.loss).length;
                  return (
                    <>
                      <View style={styles.summaryCard}><Text style={styles.summaryLabel}>흑자</Text><Text style={[styles.summaryVal, { color: colors.profit }]}>{pDays}일</Text></View>
                      <View style={styles.summaryCard}><Text style={styles.summaryLabel}>손실</Text><Text style={[styles.summaryVal, { color: colors.loss }]}>{lDays}일</Text></View>
                      <View style={styles.summaryCard}><Text style={styles.summaryLabel}>기록</Text><Text style={[styles.summaryVal, { color: colors.textPrimary }]}>{monthDates.length}일</Text></View>
                    </>
                  );
                })()}
              </View>
            </View>
          </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  glow: { position: 'absolute', top: -100, left: 0, right: 0, height: 350 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, paddingTop: 16 },
  headerSub: { fontFamily: font.medium, fontSize: 10, color: colors.textMuted, letterSpacing: 1.5 },
  headerTitle: { fontFamily: font.bold, fontSize: 24, color: colors.textPrimary, letterSpacing: -0.5, marginTop: 4 },
  tabToggle: { flexDirection: 'row', backgroundColor: colors.bgSurface, padding: 3, borderRadius: 20, ...shadows.soft },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
  tabBtnActive: { backgroundColor: colors.accent },
  tabBtnText: { fontFamily: font.medium, fontSize: 11, color: colors.textMuted },
  tabBtnTextActive: { color: 'white' },
  card: { backgroundColor: colors.bgSurface, borderRadius: radius.xl, padding: 20, marginBottom: 24, ...shadows.medium },
  cardLabel: { fontFamily: font.medium, fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 16 },
  heatmapGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-start' },
  heatmapCell: { width: (SCREEN_WIDTH - 40 - 40 - 72) / 13, height: (SCREEN_WIDTH - 40 - 40 - 72) / 13, borderRadius: 3 },
  cellProfit: { backgroundColor: colors.profit },
  cellLoss: { backgroundColor: colors.loss },
  cellEmpty: { backgroundColor: '#2a2a2a' },
  legend: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontFamily: font.regular, fontSize: 10, color: colors.textMuted, marginLeft: 4 },
  section: { marginBottom: 24 },
  sectionLabel: { fontFamily: font.medium, fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 },
  badgeCard: { width: 130, backgroundColor: colors.bgSurface, borderRadius: 16, padding: 14, marginRight: 12, borderWidth: 1, borderColor: colors.borderSub, ...shadows.soft },
  badgeIcon: { fontSize: 26, marginBottom: 8 },
  badgeName: { fontFamily: font.bold, fontSize: 12, color: colors.textPrimary, marginBottom: 4 },
  badgeDesc: { fontFamily: font.regular, fontSize: 10, color: colors.textMuted, lineHeight: 14 },
  weekCard: { backgroundColor: colors.bgSurface, borderRadius: radius.xl, padding: 18, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', ...shadows.soft },
  weekInfo: { flex: 1, marginRight: 12 },
  weekPeriod: { fontFamily: font.bold, fontSize: 14, color: colors.textPrimary, marginBottom: 4 },
  weekApps: { fontFamily: font.regular, fontSize: 11, color: colors.textMuted },
  weekValue: { alignItems: 'flex-end' },
  valText: { fontFamily: font.bold, fontSize: 14, marginBottom: 2 },
  valProfit: { color: colors.profit },
  valLoss: { color: colors.loss },
  valSub: { fontFamily: font.medium, fontSize: 8, color: colors.textDisabled },
  calendarCard: { backgroundColor: colors.bgSurface, borderRadius: radius.xl, padding: 10, marginBottom: 20, ...shadows.medium },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: { flex: 1, backgroundColor: colors.bgSurface, borderRadius: 14, padding: 12, alignItems: 'center', ...shadows.soft },
  summaryLabel: { fontFamily: font.medium, fontSize: 10, color: colors.textMuted, marginBottom: 4 },
  summaryVal: { fontFamily: font.bold, fontSize: 16 },
  emptyBox: { paddingVertical: 32, alignItems: 'center' },
  emptyText: { fontFamily: font.medium, fontSize: 13, color: colors.textDisabled },
  monthlyContainer: { marginTop: 4 },
});
