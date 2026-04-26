import { useState, useCallback } from 'react';
import {
    View, Text,
    TouchableOpacity, StyleSheet,
    ScrollView, Alert
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors, font, fontSize, spacing, radius } from '../../src/lib/theme';
import { supabase } from '../../src/lib/supabase';
import { AppHeader } from '../../src/components/AppHeader';

export default function SettingsScreen() {
    const [sleepHours, setSleepHours] = useState(7.5);
    const [workHours, setWorkHours] = useState(8.0);
    const [nickname, setNickname] = useState('');
    const [email, setEmail] = useState('');

    useFocusEffect(
        useCallback(() => {
            loadSettings();
        }, [])
    );

    async function loadSettings() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setEmail(user.email ?? '');

        const { data } = await supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', user.id)
            .single();

        if (data) {
            setSleepHours(data.sleep_hours || 7.5);
            setWorkHours(data.work_hours || 8.0);
            setNickname(data.nickname || '사용자');
        }
    }

    async function handleLogout() {
        Alert.alert('로그아웃', '정말 로그아웃할까요?', [
            { text: '취소', style: 'cancel' },
            { text: '로그아웃', style: 'destructive', onPress: () => supabase.auth.signOut() }
        ]);
    }

    const disposableHours = 24 - sleepHours - workHours;
    const sleepWeight = (sleepHours / 24) * 100;
    const workWeight = (workHours / 24) * 100;
    const disposableWeight = (disposableHours / 24) * 100;

    return (
        <View style={styles.container}>
            <AppHeader />
            
            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={{ height: 24 }} />

                {/* Profile Quick Access */}
                <TouchableOpacity
                    style={styles.profileCard}
                    onPress={() => router.push('/profile?view=account')}
                    activeOpacity={0.8}
                >
                    <View style={styles.avatarBox}>
                        <Text style={{ fontSize: 24 }}>👤</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.nicknameText}>{nickname} 님</Text>
                        <Text style={styles.emailText}>{email}</Text>
                    </View>
                    <View style={styles.profileBadge}>
                        <Text style={styles.profileBadgeText}>프로필</Text>
                    </View>
                </TouchableOpacity>

                {/* Time Strategy Section */}
                <View style={{ marginTop: 32 }}>
                    <Text style={styles.sectionLabel}>TIME STRATEGY</Text>
                    <View style={styles.glassCard}>
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={() => router.push('/profile?view=time')}
                        >
                            <View>
                                <Text style={styles.menuItemTitle}>기초 자산 설정</Text>
                                <Text style={styles.menuItemSub}>수면, 업무 시간 목표 관리</Text>
                            </View>
                            <Text style={styles.arrow}>›</Text>
                        </TouchableOpacity>
                        <View style={styles.timeStatsBox}>
                            <View style={styles.timeStatsHeader}>
                                <Text style={styles.timeStatsLabel}>가처분 시간 비중</Text>
                                <Text style={styles.timeStatsValue}>{disposableHours.toFixed(1)}h 남음</Text>
                            </View>
                            <View style={styles.timeBar}>
                                <View style={[styles.timeSegment, { width: `${sleepWeight}%`, backgroundColor: '#6366f1' }]} />
                                <View style={[styles.timeSegment, { width: `${workWeight}%`, backgroundColor: colors.accent }]} />
                                <View style={[styles.timeSegment, { width: `${disposableWeight}%`, backgroundColor: colors.profit }]} />
                            </View>
                            <View style={styles.timeBarLabels}>
                                <Text style={styles.timeBarLabel}>수면 ({sleepHours}h)</Text>
                                <Text style={styles.timeBarLabel}>업무 ({workHours}h)</Text>
                                <Text style={styles.timeBarLabel}>가용 ({disposableHours.toFixed(1)}h)</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Portfolio Section */}
                <View style={{ marginTop: 32 }}>
                    <Text style={styles.sectionLabel}>PORTFOLIO</Text>
                    <View style={styles.glassCard}>
                        <TouchableOpacity 
                            style={styles.menuItem}
                            onPress={() => router.push('/category-settings')}
                        >
                            <View>
                                <Text style={styles.menuItemTitle}>앱 포트폴리오 분류</Text>
                                <Text style={styles.menuItemSub}>소비 / 투자 / 필수 항목 관리</Text>
                            </View>
                            <Text style={styles.arrow}>›</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={[styles.menuItem, { borderBottomWidth: 0 }]}
                            onPress={() => router.push('/profile?view=sensor')}
                        >
                            <View>
                                <Text style={styles.menuItemTitle}>스크린타임 권한</Text>
                                <Text style={styles.menuItemSub}>자동 데이터 동기화 관리</Text>
                            </View>
                            <Text style={styles.statusText}>연결됨</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* System Section */}
                <View style={{ marginTop: 32 }}>
                    <Text style={styles.sectionLabel}>SYSTEM</Text>
                    <View style={styles.glassCard}>
                        <TouchableOpacity style={styles.menuItem}>
                            <Text style={styles.menuItemTitle}>알림 설정</Text>
                            <Text style={styles.arrow}>›</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]}>
                            <Text style={styles.menuItemTitle}>데이터 내보내기 (CSV)</Text>
                            <Text style={styles.arrow}>›</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Sign Out */}
                <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                    <Text style={styles.logoutText}>SIGN OUT</Text>
                </TouchableOpacity>

                <View style={{ height: 100 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgBase },
    scrollContent: { paddingHorizontal: 24 },
    header: { paddingTop: 24, marginBottom: 24 },
    subHeader: { fontFamily: font.regular, fontSize: 10, color: colors.textMuted, letterSpacing: 2, marginBottom: 4 },
    title: { fontFamily: font.bold, fontSize: 24, color: colors.textPrimary, letterSpacing: -1 },
    profileCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 24,
        padding: 20,
        gap: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    avatarBox: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#0a0a0a',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#1a1a1a',
    },
    nicknameText: { fontFamily: font.bold, fontSize: 15, color: colors.textPrimary },
    emailText: { fontFamily: font.regular, fontSize: 10, color: colors.textMuted, marginTop: 2 },
    profileBadge: {
        backgroundColor: 'rgba(249, 115, 22, 0.1)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 100,
    },
    profileBadgeText: { fontFamily: font.bold, fontSize: 10, color: colors.accent },
    sectionLabel: { fontFamily: font.bold, fontSize: 10, color: colors.textDisabled, letterSpacing: 1.5, marginBottom: 12, paddingLeft: 4 },
    glassCard: {
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        overflow: 'hidden',
    },
    menuItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.03)',
    },
    menuItemTitle: { fontFamily: font.bold, fontSize: 12, color: colors.textPrimary },
    menuItemSub: { fontFamily: font.regular, fontSize: 9, color: colors.textMuted, marginTop: 4 },
    arrow: { fontSize: 18, color: colors.textDisabled, fontWeight: '300' },
    statusText: { fontFamily: font.bold, fontSize: 10, color: colors.profit },
    timeStatsBox: { backgroundColor: 'rgba(255,255,255,0.015)', padding: 20 },
    timeStatsHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
    timeStatsLabel: { fontFamily: font.regular, fontSize: 9, color: colors.textMuted },
    timeStatsValue: { fontFamily: font.bold, fontSize: 11, color: colors.profit },
    timeBar: { height: 6, backgroundColor: '#111', borderRadius: 3, flexDirection: 'row', overflow: 'hidden' },
    timeSegment: { height: '100%' },
    timeBarLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    timeBarLabel: { fontFamily: font.regular, fontSize: 8, color: colors.textDisabled },
    logoutBtn: { marginTop: 40, alignItems: 'center' },
    logoutText: { fontFamily: font.bold, fontSize: 10, color: colors.textDisabled, letterSpacing: 2 },
});;