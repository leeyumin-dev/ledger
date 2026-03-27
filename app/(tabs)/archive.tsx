import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';

// ── 임시 더미 데이터 ──────────────────────────
const WEEKLY_DATA = [
  { id: '1', period: '3월 3주차', detail: '유튜브 18h · 인스타 7h', value: '-29h 37m', delta: '▲ 전주比 +4h', isProfit: false },
  { id: '2', period: '3월 2주차', detail: '유튜브 14h · 인스타 5h', value: '-25h 11m', delta: '→ 전주比 持',  isProfit: false },
  { id: '3', period: '3월 1주차', detail: '유튜브 9h · 독서 4h',   value: '+8h 22m',  delta: '▼ 전주比 -6h', isProfit: true  },
  { id: '4', period: '2월 4주차', detail: '유튜브 11h · 게임 6h',  value: '-18h 04m', delta: '→ 전주比 持',  isProfit: false },
  { id: '5', period: '2월 3주차', detail: '유튜브 13h · 게임 4h',  value: '-22h 50m', delta: '▲ 전주比 +2h', isProfit: false },
  { id: '6', period: '2월 2주차', detail: '유튜브 8h · 독서 5h',   value: '+3h 12m',  delta: '▼ 전주比 -8h', isProfit: true  },
];

// ── 히트맵 데이터 (true=흑자, false=적자, null=데이터없음) ──
const HEATMAP: (boolean | null)[] = [
  false, false, false, true,
  null,  false, true,  true,
  true,  null,  false, false,
  false, true,  true,  true,
  true,  true,  true,  true,
  true,  true,  true,  true,
  true,  true,
];

export default function ArchiveScreen() {
  return (
    <ScrollView style={styles.container}>

      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.headerSub}>2025. 9 — 2026. 3</Text>
        <Text style={styles.headerTitle}>보관함</Text>
      </View>

      {/* 히트맵 */}
      <View style={styles.heatmapBox}>
        <Text style={styles.heatmapLabel}>이번 해 흑자 · 적자</Text>
        <View style={styles.heatmapGrid}>
          {HEATMAP.map((val, i) => (
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

      {/* 구분선 */}
      <View style={styles.divider} />

      {/* 주간 기록 목록 */}
      {WEEKLY_DATA.map((item) => (
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
      ))}

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