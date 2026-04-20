import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../src/lib/supabase';

type UsageItem = {
  id: string;
  app_name: string;
  duration_minutes: number;
  category: string;
  date: string;
};

export default function WeeklyDetailScreen() {
  const { week } = useLocalSearchParams<{ week: string }>();
  const [usageList, setUsageList] = useState<UsageItem[]>([]);
  const [sleepHours, setSleepHours] = useState(7.5);
  const [workHours, setWorkHours] = useState(8.0);

  useEffect(() => {
    loadData();
  }, [week]);

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 주차 레이블에서 날짜 범위 계산
    const { start, end } = getWeekRange(week);

    const [settingsRes, usageRes] = await Promise.all([
      supabase.from('user_settings').select('sleep_hours, work_hours').eq('user_id', user.id).single(),
      supabase.from('app_usage').select('*').eq('user_id', user.id).gte('date', start).lte('date', end).order('date', { ascending: false }),
    ]);

    if (settingsRes.data) {
      setSleepHours(settingsRes.data.sleep_hours);
      setWorkHours(settingsRes.data.work_hours);
    }
    if (usageRes.data) {
      setUsageList(usageRes.data);
    }
  }

  function getWeekRange(weekLabel: string) {
    // "3월 4주차" → 해당 월의 N번째 월요일 기준 날짜 범위
    const now = new Date();
    const year = now.getFullYear();
    const match = weekLabel.match(/(\d+)월 (\d+)주차/);
    if (!match) return { start: '', end: '' };

    const month = parseInt(match[1]) - 1; // 0-indexed
    const weekNum = parseInt(match[2]);

    // 해당 월 1일의 요일로 첫 번째 월요일 날짜 계산
    const firstDay = new Date(year, month, 1).getDay(); // 0=일
    const firstMondayDate = firstDay <= 1 ? 2 - firstDay : 9 - firstDay;
    const mondayDate = firstMondayDate + (weekNum - 1) * 7;

    const monday = new Date(year, month, mondayDate);
    const sunday = new Date(year, month, mondayDate + 6);

    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    return { start: fmt(monday), end: fmt(sunday) };
  }

  // 카테고리별 합산
  const lossItems    = usageList.filter(u => u.category === '소비');
  const investItems  = usageList.filter(u => u.category === '투자');
  const essentialItems = usageList.filter(u => u.category === '필수');

  // 앱별로 합산
  function groupByApp(items: UsageItem[]) {
    const map: Record<string, number> = {};
    items.forEach(item => {
      map[item.app_name] = (map[item.app_name] || 0) + item.duration_minutes;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }

  const lossMinutes     = lossItems.reduce((s, u) => s + u.duration_minutes, 0);
  const investMinutes   = investItems.reduce((s, u) => s + u.duration_minutes, 0);
  const essentialMinutes = essentialItems.reduce((s, u) => s + u.duration_minutes, 0);
  const days = 7;
  const totalDisposable = (24 - sleepHours - workHours) * days;
  const netMinutes = Math.round(totalDisposable * 60) - lossMinutes - essentialMinutes + investMinutes;
  const isProfit = netMinutes >= 0;

  function fmt(m: number) {
    return `${Math.floor(Math.abs(m) / 60)}h ${Math.abs(m) % 60}m`;
  }

  return (
    <ScrollView style={styles.container}>

      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← 보관함</Text>
        </TouchableOpacity>
        <Text style={styles.headerSub}>{week}</Text>
        <Text style={styles.headerTitle}>주간 결산</Text>
      </View>

      <View style={styles.thickDivider} />

      {/* 주간 수입 */}
      <Text style={styles.sectionLabel}>주간 가처분 시간</Text>
      <Row label="1일 가처분 시간" value={`${(totalDisposable / 7).toFixed(1)}h`} />
      <Row label="7일 합계" value={`${totalDisposable.toFixed(1)}h`} bold />

      {/* 지출 */}
      <Text style={[styles.sectionLabel, { marginTop: 16 }]}>시간 지출</Text>
      {groupByApp(lossItems).length === 0
        ? <Text style={styles.emptyRow}>지출 없음</Text>
        : groupByApp(lossItems).map(([app, min]) => (
          <Row key={app} label={app} value={fmt(min)} indent loss />
        ))
      }
      <View style={styles.thinDivider} />
      <Row label="총 지출" value={fmt(lossMinutes)} bold loss />

      {/* 투자 */}
      <Text style={[styles.sectionLabel, { marginTop: 16 }]}>시간 투자</Text>
      {groupByApp(investItems).length === 0
        ? <Text style={styles.emptyRow}>투자 없음</Text>
        : groupByApp(investItems).map(([app, min]) => (
          <Row key={app} label={app} value={fmt(min)} indent profit />
        ))
      }
      <View style={styles.thinDivider} />
      <Row label="총 투자" value={fmt(investMinutes)} bold profit />

      {/* 필수 */}
      {essentialItems.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { marginTop: 16 }]}>필수 지출</Text>
          {groupByApp(essentialItems).map(([app, min]) => (
            <Row key={app} label={app} value={fmt(min)} indent muted />
          ))}
        </>
      )}

      <View style={styles.thickDivider} />

      {/* 순이익/손실 */}
      <View style={[styles.verdictBox, isProfit ? styles.verdictProfit : styles.verdictLoss]}>
        <Text style={[styles.verdictLabel, { color: isProfit ? 'rgba(74,222,128,0.7)' : 'rgba(248,113,133,0.7)' }]}>
          {isProfit ? '주간 순이익' : '주간 순손실'}
        </Text>
        <Text style={[styles.verdictValue, { color: isProfit ? '#4ade80' : '#f87171' }]}>
          {isProfit ? '＋' : '－'} {fmt(Math.abs(netMinutes))}
        </Text>
        <Text style={styles.verdictSub}>{week}</Text>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function Row({ label, value, indent, bold, loss, profit, muted }: {
  label: string | React.ReactNode; value: string;
  indent?: boolean; bold?: boolean;
  loss?: boolean; profit?: boolean; muted?: boolean;
}) {
  return (
    <View style={[styles.row, indent && styles.rowIndent]}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
        {typeof label === 'string'
          ? <Text style={[styles.rowLabel, bold && styles.boldText]}>{label}</Text>
          : label}
      </View>
      <Text style={[
        styles.rowValue,
        bold && styles.boldText,
        loss && styles.lossText,
        profit && styles.profitText,
        muted && styles.mutedText,
      ]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f', paddingHorizontal: 24 },
  header: { paddingTop: 60, paddingBottom: 24 },
  backBtn: { marginBottom: 16 },
  backText: { fontFamily: 'GeistMono_400Regular', fontSize: 12, color: '#e8410a' },
  headerSub: { fontFamily: 'GeistMono_400Regular', fontSize: 11, color: '#5a5754', letterSpacing: 1, marginBottom: 6 },
  headerTitle: { fontFamily: 'GeistMono_500Medium', fontSize: 28, color: '#f0ede8', letterSpacing: -0.5 },
  thickDivider: { height: 1.5, backgroundColor: '#3a3836', marginVertical: 12 },
  thinDivider: { height: 0.5, backgroundColor: '#2a2826', marginVertical: 8 },
  sectionLabel: { fontFamily: 'GeistMono_400Regular', fontSize: 10, color: '#5a5754', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  rowIndent: { paddingLeft: 16 },
  rowLabel: { fontFamily: 'GeistMono_400Regular', fontSize: 13, color: '#9a9690' },
  rowValue: { fontFamily: 'GeistMono_400Regular', fontSize: 13, color: '#f0ede8' },
  boldText: { fontFamily: 'GeistMono_500Medium', fontSize: 14, color: '#f0ede8' },
  lossText: { color: '#f87171' },
  profitText: { color: '#4ade80' },
  mutedText: { color: '#5a5754' },
  emptyRow: { fontFamily: 'GeistMono_400Regular', fontSize: 12, color: '#3a3836', paddingLeft: 16, paddingVertical: 6 },
  verdictBox: { borderRadius: 12, padding: 20, alignItems: 'center', borderWidth: 1 },
  verdictLoss: { backgroundColor: 'rgba(248,113,133,0.1)', borderColor: 'rgba(248,113,133,0.2)' },
  verdictProfit: { backgroundColor: 'rgba(74,222,128,0.1)', borderColor: 'rgba(74,222,128,0.2)' },
  verdictLabel: { fontFamily: 'GeistMono_400Regular', fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 },
  verdictValue: { fontFamily: 'GeistMono_500Medium', fontSize: 32, letterSpacing: -0.5, marginBottom: 6 },
  verdictSub: { fontFamily: 'GeistMono_400Regular', fontSize: 11, color: '#5a5754' },
});