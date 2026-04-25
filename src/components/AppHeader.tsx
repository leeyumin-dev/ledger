import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, fontSize } from '../lib/theme';

export function AppHeader() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.logoWrap}>
        <Text style={styles.logo}>Ledger</Text>
      </View>
      <TouchableOpacity style={styles.avatar} onPress={() => router.push('/profile')}>
        <Ionicons name="person-circle-outline" size={28} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bgBase,
    paddingHorizontal: 24,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderSub,
  },
  logoWrap: {
    transform: [{ skewX: '-8deg' }],
  },
  logo: {
    fontFamily: font.extraBold,
    fontSize: fontSize.xl,
    color: colors.textPrimary,
    letterSpacing: -1,
  },
  avatar: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});


