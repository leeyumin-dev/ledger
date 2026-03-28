import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { router } from 'expo-router';
import { Calendar } from 'react-native-calendars';
import { supabase } from '../../src/lib/supabase';

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

    const { data } = await supabase
      .from('app_usage')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false });

    if (!data || data.length === 0) return;

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
      const topApps = [...new Set(items.map((i: any) => i.app_name))].slice(0, 2);
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
              color: isProfit ? '#4ade80' : '#f87171',
              fontWeight: '600',
            },
          },
        };
      }
    });
    setMarkedDates(marked);
  }

  function getWeekLabel(dateStr: string) {
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    const weekNum = Math.ceil(date.getDate() / 7);
    return `${month}월 ${weekNum}주차`;
  }

  return (
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
              <View style={[styles.legendDot, { backgroundColor: '#2a2826', marginLeft: 12 }]} />
              <Text style={styles.legendText}>기록없음</Text>
              <View style={[styles.legendDot, { backgroundColor: '#16a34a', marginLeft: 12 }]} />
              <Text style={styles.legendText}>흑자</Text>
            </View>
          </View>

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
            theme={{
              backgroundColor: '#0f0f0f',
              calendarBackground: '#0f0f0f',
              textSectionTitleColor: '#5a5754',
              selectedDayBackgroundColor: '#e8410a',
              selectedDayTextColor: '#ffffff',
              todayTextColor: '#e8410a',
              dayTextColor: '#f0ede8',
              textDisabledColor: '#3a3836',
              monthTextColor: '#f0ede8',
              arrowColor: '#e8410a',
              textMonthFontFamily: 'GeistMono_500Medium',
              textDayFontFamily: 'GeistMono_400Regular',
              textDayHeaderFontFamily: 'GeistMono_400Regular',
              textDayFontSize: 13,
              textMonthFontSize: 16,
              textDayHeaderFontSize: 11,
            }}
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
                v.customStyles.text.color === '#4ade80'
              ).length;
              const lossDays = monthDates.filter(([, v]) =>
                v.customStyles.text.color === '#f87171'
              ).length;

              return (
                <View style={styles.summaryRow}>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>흑자일</Text>
                    <Text style={[styles.summaryValue, { color: '#4ade80' }]}>{profitDays}일</Text>
                  </View>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>낭비일</Text>
                    <Text style={[styles.summaryValue, { color: '#f87171' }]}>{lossDays}일</Text>
                  </View>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>기록일</Text>
                    <Text style={[styles.summaryValue, { color: '#f0ede8' }]}>{monthDates.length}일</Text>
                  </View>
                </View>
              );
            })()}
          </View>
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f', paddingHorizontal: 24 },
  header: { paddingTop: 72, paddingBottom: 24 },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  tabBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#2a2826' },
  tabBtnActive: { backgroundColor: '#e8410a', borderColor: '#e8410a' },
  tabBtnText: { fontFamily: 'GeistMono_400Regular', fontSize: 12, color: '#5a5754' },
  tabBtnTextActive: { color: '#ffffff' },
  heatmapBox: { backgroundColor: '#161614', borderRadius: 12, padding: 16, marginBottom: 24 },
  heatmapLabel: { fontFamily: 'GeistMono_400Regular', fontSize: 10, color: '#5a5754', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 },
  heatmapGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  heatmapCell: { width: 18, height: 18, borderRadius: 3 },
  cellProfit: { backgroundColor: '#16a34a' },
  cellLoss: { backgroundColor: '#e11d48' },
  cellEmpty: { backgroundColor: '#2a2826' },
  legend: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  legendDot: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontFamily: 'GeistMono_400Regular', fontSize: 10, color: '#5a5754', marginLeft: 4 },
  divider: { height: 0.5, backgroundColor: '#2a2826', marginBottom: 8 },
  emptyBox: { paddingVertical: 48, alignItems: 'center' },
  emptyText: { fontFamily: 'GeistMono_500Medium', fontSize: 14, color: '#5a5754', marginBottom: 8 },
  emptySub: { fontFamily: 'GeistMono_400Regular', fontSize: 12, color: '#3a3836', textAlign: 'center' },
  item: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: '#1c1c1a' },
  itemPeriod: { fontFamily: 'GeistMono_500Medium', fontSize: 13, color: '#f0ede8', marginBottom: 3 },
  itemDetail: { fontFamily: 'GeistMono_400Regular', fontSize: 10, color: '#5a5754' },
  itemValue: { fontFamily: 'GeistMono_500Medium', fontSize: 13 },
  profitText: { color: '#4ade80' },
  lossText: { color: '#f87171' },
  monthlySummary: { marginTop: 8 },
  sectionLabel: { fontFamily: 'GeistMono_400Regular', fontSize: 10, color: '#5a5754', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: { flex: 1, backgroundColor: '#161614', borderRadius: 10, padding: 14, alignItems: 'center' },
  summaryLabel: { fontFamily: 'GeistMono_400Regular', fontSize: 10, color: '#5a5754', marginBottom: 6 },
  summaryValue: { fontFamily: 'GeistMono_500Medium', fontSize: 22 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingTop: 72,
    paddingBottom: 24,
  },
  headerSub: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 11,
    color: '#5a5754',
    letterSpacing: 1,
    marginBottom: 6,
  },
  headerTitle: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 28,
    color: '#f0ede8',
    letterSpacing: -0.5,
  },
  toggleWrap: {
    flexDirection: 'row',
    backgroundColor: '#1c1c1a',
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
    backgroundColor: '#e8410a',
  },
  toggleBtnText: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 11,
    color: '#5a5754',
  },
  toggleBtnTextActive: {
    color: '#ffffff',
  },
  reportBtn: {
    backgroundColor: '#161614',
    borderWidth: 1,
    borderColor: '#2a2826',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  reportBtnText: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 13,
    color: '#f0ede8',
  },
});