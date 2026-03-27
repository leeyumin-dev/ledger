import { useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Share, Alert
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as MediaLibrary from 'expo-media-library';
import ViewShot from 'react-native-view-shot';
import { supabase } from '../../src/lib/supabase';

type UsageItem = {
  app_name: string;
  duration_minutes: number;
  category: string;
};

export default function ShareScreen() {
  const cardRef = useRef<ViewShot>(null);
  const [usageList, setUsageList] = useState<UsageItem[]>([]);
  const [weekLabel, setWeekLabel] = useState('');

  const today = new Date();
  const weekNum = Math.ceil(today.getDate() / 7);
  const month = today.getMonth() + 1;
  const year = today.getFullYear();
  const period = `${year}년 ${month}월 ${weekNum}주차 결산 공시`;

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const start = startOfWeek.toISOString().split('T')[0];
    const end = today.toISOString().split('T')[0];

    const { data } = await supabase
      .from('app_usage')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', start)
      .lte('date', end);

    if (data) setUsageList(data);
    setWeekLabel(`${month}월 ${weekNum}주차`);
  }

  async function handleShare() {
    try {
      const uri = await cardRef.current?.capture?.();
      if (!uri) return;

      await Share.share({
        url: uri,
        message: `이번 주 시간 손익계산서 — Ledger`,
      });
    } catch (e) {
      Alert.alert('오류', '공유에 실패했어요.');
    }
  }

  async function handleSave() {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('권한 필요', '사진 저장을 위해 갤러리 접근 권한이 필요해요.');
        return;
      }

      const uri = await cardRef.current?.capture?.();
      if (!uri) {
        Alert.alert('오류', '캡처에 실패했어요.');
        return;
      }

      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('저장 완료', '카드가 갤러리에 저장됐어요.');
    } catch (e) {
      Alert.alert('오류', '저장에 실패했어요.');
    }
  }

  const lossItems = usageList.filter(u => u.category === '소비');
  const profitItems = usageList.filter(u => u.category === '투자');
  const lossMinutes = lossItems.reduce((s, u) => s + u.duration_minutes, 0);
  const profitMinutes = profitItems.reduce((s, u) => s + u.duration_minutes, 0);
  const netMinutes = profitMinutes - lossMinutes;
  const isProfit = netMinutes >= 0;

  const fmt = (minutes: number) => {
    const h = Math.floor(Math.abs(minutes) / 60);
    const m = Math.abs(minutes) % 60;
    return `${h}h ${m}m`;
  };

  return (
    <ScrollView style={styles.container}>

      <View style={styles.header}>
        <Text style={styles.headerSub}>공유하기</Text>
        <Text style={styles.headerTitle}>결산 카드</Text>
      </View>

      {/* 공유 카드 — 이 부분이 캡처돼요 */}
      <ViewShot
        ref={cardRef}
        options={{ format: 'png', quality: 1.0 }}
        style={styles.cardWrapper}
      >
        <View style={styles.card}>

          {/* 카드 헤더 */}
          <Text style={styles.cardLogo}>LEDGER</Text>
          <Text style={styles.cardTitle}>주간 손익계산서</Text>
          <Text style={styles.cardPeriod}>{period}</Text>

          <View style={styles.cardDivider} />

          {/* 지출 */}
          {lossItems.map((item, i) => (
            <View key={i} style={styles.cardRow}>
              <Text style={styles.cardLabel}>{item.app_name}</Text>
              <Text style={styles.cardLoss}>－ {fmt(item.duration_minutes)}</Text>
            </View>
          ))}

          {/* 투자 */}
          {profitItems.map((item, i) => (
            <View key={i} style={styles.cardRow}>
              <Text style={styles.cardLabel}>{item.app_name}</Text>
              <Text style={styles.cardProfit}>＋ {fmt(item.duration_minutes)}</Text>
            </View>
          ))}

          <View style={styles.cardDivider} />

          <View style={styles.cardRow}>
            <Text style={[styles.cardLabel, { color: '#f0ede8', fontFamily: 'GeistMono_500Medium' }]}>총 지출</Text>
            <Text style={styles.cardLoss}>{fmt(lossMinutes)}</Text>
          </View>

          {/* 순이익/손실 */}
          <View style={[styles.verdictBox, isProfit ? styles.verdictProfit : styles.verdictLoss]}>
            <Text style={[styles.verdictLabel, { color: isProfit ? 'rgba(74,222,128,0.7)' : 'rgba(248,113,133,0.7)' }]}>
              {isProfit ? '당기 순이익' : '당기 순손실'}
            </Text>
            <Text style={[styles.verdictValue, { color: isProfit ? '#4ade80' : '#f87171' }]}>
              {isProfit ? '＋' : '－'} {fmt(Math.abs(netMinutes))}
            </Text>
          </View>

          {/* 워터마크 */}
          <Text style={styles.watermark}>Ledger — 시간 재무제표</Text>

        </View>
      </ViewShot>

      {/* 버튼 */}
      <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
        <Text style={styles.shareBtnText}>공유하기</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>이미지 저장</Text>
      </TouchableOpacity>

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
  cardWrapper: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    padding: 28,
  },
  cardLogo: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 3,
    marginBottom: 4,
  },
  cardTitle: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 22,
    color: '#f0ede8',
    marginBottom: 3,
  },
  cardPeriod: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
    marginBottom: 20,
  },
  cardDivider: {
    height: 0.5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 12,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  cardLabel: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  cardLoss: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 11,
    color: '#f87171',
  },
  cardProfit: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 11,
    color: '#4ade80',
  },
  verdictBox: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    marginTop: 16,
    marginBottom: 16,
  },
  verdictLoss: {
    backgroundColor: 'rgba(248,113,133,0.1)',
    borderColor: 'rgba(248,113,133,0.2)',
  },
  verdictProfit: {
    backgroundColor: 'rgba(74,222,128,0.1)',
    borderColor: 'rgba(74,222,128,0.2)',
  },
  verdictLabel: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  verdictValue: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 28,
    letterSpacing: -0.5,
  },
  watermark: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 9,
    color: 'rgba(255,255,255,0.2)',
    textAlign: 'center',
    letterSpacing: 1,
  },
  shareBtn: {
    backgroundColor: '#e8410a',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  shareBtnText: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 14,
    color: '#ffffff',
  },
  saveBtn: {
    backgroundColor: '#161614',
    borderWidth: 1,
    borderColor: '#2a2826',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  saveBtnText: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 14,
    color: '#f0ede8',
  },
});