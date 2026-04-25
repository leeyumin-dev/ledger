import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Dimensions
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { colors, font, fontSize, spacing, radius, shadows, gradients } from '../src/lib/theme';
import { getWeeklyPersona, Persona } from '../src/lib/personas';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  const [loading, setLoading] = useState(true);
  const [persona, setPersona] = useState<Persona | null>(null);

  useEffect(() => {
    loadData();
  }, [week]);

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { start, end } = getWeekRange(week);

    const [settingsRes, usageRes] = await Promise.all([
      supabase.from('user_settings').select('sleep_hours, work_hours').eq('user_id', user.id).single(),
      supabase.from('app_usage').select('*').eq('user_id', user.id).gte('date', start).lte('date', end).order('date', { ascending: false }),
    ]);

    let currentSl = 7.5;
    let currentWk = 8.0;

    if (settingsRes.data) {
      currentSl = settingsRes.data.sleep_hours;
      currentWk = settingsRes.data.work_hours;
      setSleepHours(currentSl);
      setWorkHours(currentWk);
    }
    
    const usageData = usageRes.data ?? [];
    setUsageList(usageData);

    // 데이터 계산
    const lossMin = usageData.filter(u => u.category === '소비').reduce((s, u) => s + u.duration_minutes, 0);
    const investMin = usageData.filter(u => u.category === '투자').reduce((s, u) => s + u.duration_minutes, 0);
    const essentialMin = usageData.filter(u => u.category === '필수').reduce((s, u) => s + u.duration_minutes, 0);
    
    const totalDispMin = (24 - currentSl - currentWk) * 7 * 60;
    const netMin = totalDispMin - lossMin - essentialMin + investMin;
    
    // 페르소나 분석용 데이터
    const analysis = {
      isProfit: netMin >= 0,
      netMinutes: netMin,
      assetFormationRate: totalDispMin > 0 ? (investMin / totalDispMin) * 100 : 0,
      consumptionRate: totalDispMin > 0 ? (lossMin / totalDispMin) * 100 : 0,
      workRate: (currentWk * 7 * 60) / (24 * 7 * 60) * 100,
      sleepRate: (currentSl * 7 * 60) / (24 * 7 * 60) * 100,
    };

    setPersona(getWeeklyPersona(analysis));
    setLoading(false);
  }

  function getWeekRange(weekLabel: string) {
    const now = new Date();
    const year = now.getFullYear();
    const match = weekLabel.match(/(\d+)월 (\d+)주차/);
    if (!match) return { start: '', end: '' };
    const month = parseInt(match[1]) - 1;
    const weekNum = parseInt(match[2]);
    const firstDay = new Date(year, month, 1).getDay();
    const firstMondayDate = firstDay <= 1 ? 2 - firstDay : 9 - firstDay;
    const mondayDate = firstMondayDate + (weekNum - 1) * 7;
    const monday = new Date(year, month, mondayDate);
    const sunday = new Date(year, month, mondayDate + 6);
    const f = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { start: f(monday), end: f(sunday) };
  }

  const lossMinutes = usageList.filter(u => u.category === '소비').reduce((s, u) => s + u.duration_minutes, 0);
  const investMinutes = usageList.filter(u => u.category === '투자').reduce((s, u) => s + u.duration_minutes, 0);
  const essentialMinutes = usageList.filter(u => u.category === '필수').reduce((s, u) => s + u.duration_minutes, 0);
  const totalDisposable = (24 - sleepHours - workHours) * 7;
  const netMinutes = Math.round(totalDisposable * 60) - lossMinutes - essentialMinutes + investMinutes;
  const isProfit = netMinutes >= 0;

  const topAssets = Object.entries(
    usageList.filter(u => u.category === '투자').reduce((acc, curr) => {
      acc[curr.app_name] = (acc[curr.app_name] || 0) + curr.duration_minutes;
      return acc;
    }, {} as Record<string, number>)
  ).sort((a, b) => b[1] - a[1]).slice(0, 3);

  function fmtTime(m: number) {
    const absM = Math.abs(m);
    const h = Math.floor(absM / 60);
    const mm = absM % 60;
    return `${h}h ${mm}m`;
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={isProfit ? ['rgba(74,222,128,0.12)', 'transparent'] : ['rgba(248,113,113,0.12)', 'transparent']}
        style={styles.glow}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>주간 경영 보고서</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        
        <View style={styles.reportHeader}>
          <Text style={styles.reportPeriod}>{week}</Text>
          {persona && (
            <View style={[styles.personaTag, { borderColor: `${persona.color}40`, backgroundColor: `${persona.color}10` }]}>
              <Text style={[styles.personaText, { color: persona.color }]}>{persona.emoji} {persona.label}</Text>
            </View>
          )}
        </View>

        {/* 🏆 재무 선언 카드 */}
        <View style={styles.statementCard}>
          <Text style={styles.statementMsg}>
            이번 주 당신의 시간 잔고는{'\n'}
            <Text style={{ color: isProfit ? colors.profit : colors.loss, fontFamily: font.bold }}>
              {isProfit ? '흑자' : '적자'}
            </Text>를 기록했습니다.
          </Text>
          <Text style={[styles.netProfitVal, { color: isProfit ? colors.profit : colors.loss }]}>
            {isProfit ? '＋' : '－'} {fmtTime(netMinutes)}
          </Text>
          <Text style={styles.netProfitLabel}>Weekly Net Profit / Loss</Text>
          
          {persona && (
            <Text style={styles.personaDesc}>{persona.description}</Text>
          )}
        </View>

        {/* 경영 지표 그리드 */}
        <View style={styles.indicatorGrid}>
          <View style={styles.indicatorCard}>
            <Text style={styles.indLabel}>손익분기점</Text>
            <Text style={styles.indValue}>{isProfit ? '달성 완료' : '미달성'}</Text>
            <Text style={[styles.indStatus, { color: isProfit ? colors.profit : colors.loss }]}>
              {isProfit ? '안정적 경영' : '지출 관리 필요'}
            </Text>
          </View>
          <View style={styles.indicatorCard}>
            <Text style={styles.indLabel}>자산 형성률</Text>
            <Text style={styles.indValue}>{((investMinutes / (totalDisposable * 60)) * 100).toFixed(1)}%</Text>
            <Text style={styles.indStatus}>
              {(investMinutes / (totalDisposable * 60)) * 100 > 30 ? '매우 높음' : '보통'}
            </Text>
          </View>
        </View>

        {/* 취득 자산 목록 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Major Acquired Assets</Text>
            <View style={styles.sectionLine} />
          </View>
          
          <View style={styles.assetList}>
            {topAssets.length > 0 ? topAssets.map(([name, time], idx) => (
              <View key={name} style={styles.assetItem}>
                <Text style={styles.assetRank}>0{idx + 1}</Text>
                <Text style={styles.assetName} numberOfLines={1}>{name}</Text>
                <Text style={styles.assetTime}>{fmtTime(time)}</Text>
              </View>
            )) : (
              <Text style={styles.emptyText}>이번 주 취득한 자산이 없습니다.</Text>
            )}
          </View>
        </View>

        <TouchableOpacity style={styles.shareBtn} activeOpacity={0.8}>
          <Ionicons name="share-outline" size={20} color="white" style={{ marginRight: 8 }} />
          <Text style={styles.shareBtnText}>이 주간 보고서 공유하기</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  container: { flex: 1, paddingHorizontal: 24 },
  glow: { position: 'absolute', top: -100, left: 0, right: 0, height: 400 },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 16, marginBottom: 20 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  navTitle: { fontFamily: font.bold, fontSize: 16, color: colors.textPrimary },

  reportHeader: { alignItems: 'center', marginBottom: 24 },
  reportPeriod: { fontFamily: font.medium, fontSize: 11, color: colors.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 },
  personaTag: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  personaText: { fontFamily: font.bold, fontSize: 12 },

  statementCard: { backgroundColor: 'rgba(23,23,23,0.4)', borderRadius: 32, padding: 32, alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: colors.borderSub, ...shadows.medium },
  statementMsg: { fontFamily: font.regular, fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  netProfitVal: { fontFamily: font.bold, fontSize: 48, letterSpacing: -2 },
  netProfitLabel: { fontFamily: font.medium, fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 2, marginTop: 12 },
  personaDesc: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 24, lineHeight: 18, paddingHorizontal: 10 },

  indicatorGrid: { flexDirection: 'row', gap: 12, marginBottom: 32 },
  indicatorCard: { flex: 1, backgroundColor: colors.bgSurface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.border, ...shadows.soft },
  indLabel: { fontFamily: font.medium, fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  indValue: { fontFamily: font.bold, fontSize: 15, color: colors.textPrimary, marginBottom: 4 },
  indStatus: { fontFamily: font.bold, fontSize: 10 },

  section: { marginBottom: 32 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  sectionLabel: { fontFamily: font.medium, fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 2, marginRight: 12 },
  sectionLine: { flex: 1, height: 1, backgroundColor: colors.borderSub },
  assetList: { backgroundColor: colors.bgSurface, borderRadius: 24, padding: 8, borderWidth: 1, borderColor: colors.border },
  assetItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: colors.borderSub },
  assetRank: { fontFamily: font.bold, fontSize: 11, color: colors.textDisabled, marginRight: 16 },
  assetName: { flex: 1, fontFamily: font.medium, fontSize: 13, color: colors.textSecondary },
  assetTime: { fontFamily: font.bold, fontSize: 13, color: colors.textPrimary },
  emptyText: { fontFamily: font.regular, fontSize: 13, color: colors.textDisabled, textAlign: 'center', padding: 24 },

  shareBtn: { backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', ...shadows.medium },
  shareBtnText: { fontFamily: font.bold, fontSize: 15, color: 'white', letterSpacing: 0.5 },
});
