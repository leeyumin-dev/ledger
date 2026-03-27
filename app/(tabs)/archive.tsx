import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet,
  ScrollView, TouchableOpacity
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../src/lib/supabase';

type WeeklyRecord = {
  id: string;
  period: string;
  detail: string;
  value: string;
  delta: string;
  isProfit: boolean;
};

type HeatmapCell = boolean | null;

export default function ArchiveScreen() {
  const [records, setRecords]   = useState<WeeklyRecord[]>([]);
  const [heatmap, setHeatmap]   = useState<HeatmapCell[]>([]);
  const [loading, setLoading]   = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('app_usage')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false });

    if (data && data.length > 0) {
      const processed = processData(data);
      setRecords(processed.records);
      setHeatmap(processed.heatmap);
    }

    setLoading(false);
  }

  function processData(data: any[]) {
    // 날짜별로 그룹화
    const byDate: Record<string, any[]> = {};
    data.forEach(item => {
      if (!byDate[item.date]) byDate[item.date] = [];
      byDate[item.date].push(item);
    });

    // 주차별로 그룹화
    const byWeek: Record<string, any[]> = {};
    Object.entries(byDate).forEach(([date, items]) => {
      const week = getWeekLabel(date);
      if (!byWeek[week]) byWeek[week] = [];
      byWeek[week].push(...items);
    });

    // 레코드 생성
    const weeks = Object.keys(byWeek).sort().reverse();
    const records: WeeklyRecord[] = weeks.map((week, i) => {
      const items = byWeek[week];
      const totalMinutes = items
        .filter(i => i.category === '소비')
        .reduce((sum, i) => sum + i.duration_minutes, 0);
      const topApps = [...new Set(items.map(i => i.app_name))].slice(0, 2);
      const isProfit = totalMinutes < 60 * 4;
      const hours = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;

      return {
        id: week,
        period: week,
        detail: topApps.join(' · '),
        value: `${isProfit ? '+' : '-'}${hours}h ${mins}m`,
        delta: i === 0 ? '이번 주' : '',
        isProfit,
      };
    });

    // 히트맵 생성 (최근 26주)
    const heatmap: HeatmapCell[] = Array(26).fill(null).map((_, i) => {
      const weekIdx = weeks.length - 1 - i;
      if (weekIdx < 0) return null;
      return records[weekIdx]?.isProfit ?? null;
    }).reverse();

    return { records, heatmap };
  }

  function getWeekLabel(dateStr: string) {
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    const weekNum = Math.ceil(date.getDate() / 7);
    return `${month}월 ${weekNum}주차`;
  }

  return (
    <ScrollView style={styles.container}>

      <View style={styles.header}>
        <Text style={styles.headerSub}>기록 보관함</Text>
        <Text style={styles.headerTitle}>보관함</Text>
      </View>

      {/* 히트맵 */}
      <View style={styles.heatmapBox}>
        <Text style={styles.heatmapLabel}>이번 해 흑자 · 적자</Text>
        <View style={styles.heatmapGrid}>
          {heatmap.map((val, i) => (
            <View
              key={i}
              style={[
                styles.heatmapCell,
                val === true  && styles.cellProfit,
                val === false && styles.cellLoss,
                val === null  && styles.cellEmpty,
              ]}
            />
          ))}
        </View>
        <View style={styles.legend}>
          <View style={[styles.legendDot, { backgroundColor: '#e11d48' }]} />
          <Text style={styles.legendText}>낭비</Text>
          <View style={[styles.legendDot, { backgroundColor: '#2a2826', marginLeft: 12 }]} />
          <Text style={styles.legendText}>보통</Text>
          <View style={[styles.legendDot, { backgroundColor: '#16a34a', marginLeft: 12 }]} />
          <Text style={styles.legendText}>흑자</Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* 기록 없을 때 */}
      {records.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>아직 기록이 없어요</Text>
          <Text style={styles.emptySub}>오늘 화면에서 앱 사용 시간을 추가해봐요</Text>
        </View>
      ) : (
        records.map((item) => (
          <TouchableOpacity key={item.id} style={styles.item}>
            <View>
              <Text style={styles.itemPeriod}>{item.period}</Text>
              <Text style={styles.itemDetail}>{item.detail}</Text>
            </View>
            <View style={styles.itemRight}>
              <Text style={[styles.itemValue, item.isProfit ? styles.profitText : styles.lossText]}>
                {item.value}
              </Text>
              <Text style={[styles.itemDelta, item.isProfit ? styles.profitText : styles.lossText]}>
                {item.delta}
              </Text>
            </View>
          </TouchableOpacity>
        ))
      )}

      <View style={{ height: 40 }} />

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    paddingHorizontal: 24,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 13,
    color: '#5a5754',
  },
  header: {
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
  heatmapBox: {
    backgroundColor: '#161614',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  heatmapLabel: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 10,
    color: '#5a5754',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  heatmapGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  heatmapCell: {
    width: 18,
    height: 18,
    borderRadius: 3,
  },
  cellProfit: { backgroundColor: '#16a34a' },
  cellLoss:   { backgroundColor: '#e11d48' },
  cellEmpty:  { backgroundColor: '#2a2826' },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendText: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 10,
    color: '#5a5754',
    marginLeft: 4,
  },
  divider: {
    height: 0.5,
    backgroundColor: '#2a2826',
    marginBottom: 8,
  },
  emptyBox: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 14,
    color: '#5a5754',
    marginBottom: 8,
  },
  emptySub: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 12,
    color: '#3a3836',
    textAlign: 'center',
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1c1c1a',
  },
  itemPeriod: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 13,
    color: '#f0ede8',
    marginBottom: 3,
  },
  itemDetail: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 10,
    color: '#5a5754',
  },
  itemRight: {
    alignItems: 'flex-end',
  },
  itemValue: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 13,
    marginBottom: 3,
  },
  itemDelta: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 10,
    opacity: 0.7,
  },
  profitText: { color: '#4ade80' },
  lossText:   { color: '#f87171' },
});