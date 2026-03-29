import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export function AppHeader() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.logoWrap}>
        <Text style={styles.logo}>Ledger</Text>
      </View>
      <TouchableOpacity style={styles.avatar} onPress={() => router.push('/profile')}>
        <Ionicons name="person-circle-outline" size={28} color="rgba(255,255,255,0.65)" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f0f0f',
    paddingHorizontal: 24,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  logoWrap: {
    transform: [{ skewX: '-8deg' }],
  },
  logo: {
    fontFamily: 'GeistMono_800ExtraBold',
    fontSize: 22,
    color: '#ffffff',
    letterSpacing: -1,
  },
  avatar: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});


