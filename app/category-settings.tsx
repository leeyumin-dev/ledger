import { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView,
    TouchableOpacity, Alert,
    TextInput, Keyboard, ActivityIndicator
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { colors, font, fontSize, spacing, radius } from '../src/lib/theme';
import { AppHeader } from '../src/components/AppHeader';

type AppCategory = {
    id: string;
    app_name: string;
    category: string;
    budget_minutes: number;
    goal_minutes: number;
};

const CATEGORIES = ['소비', '투자', '필수'];
const PRESET_BUDGETS = [30, 60, 90, 120];
const PRESET_GOALS = [60, 120, 300, 420]; 
const PRESET_LIMITS = [120, 300, 420, 600];

export default function CategorySettingsScreen() {
    const [list, setList] = useState<AppCategory[]>([]);
    const [loading, setLoading] = useState(true);

    const [customInputId, setCustomInputId] = useState<string | null>(null);
    const [customInputVal, setCustomInputVal] = useState('');
    const [savedId, setSavedId] = useState<string | null>(null);
    const [customSetIds, setCustomSetIds] = useState<string[]>([]);

    const [goalInputId, setGoalInputId] = useState<string | null>(null);
    const [goalInputVal, setGoalInputVal] = useState('');
    const [goalSavedId, setGoalSavedId] = useState<string | null>(null);
    const [goalCustomSetIds, setGoalCustomSetIds] = useState<string[]>([]);

    useFocusEffect(
        useCallback(() => {
            loadList();
        }, [])
    );

    async function loadList() {
        setLoading(true);
        await fetchAndApply();
        setLoading(false);
    }

    async function refreshList() {
        await fetchAndApply();
    }

    async function fetchAndApply() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
            .from('app_categories')
            .select('*')
            .eq('user_id', user.id)
            .order('app_name');

        if (!data) return;

        const mapped = data.map(d => ({ ...d, goal_minutes: d.goal_minutes ?? 0 }));
        setList(mapped);

        const PRESET_BUDGET_VALUES = [0, 30, 60, 90, 120];
        const PRESET_GOAL_VALUES = [0, 60, 120, 300, 420];
        const PRESET_LIMIT_VALUES = [0, 120, 300, 420, 600];
        setCustomSetIds(mapped.filter(d => d.category === '소비' && !PRESET_BUDGET_VALUES.includes(d.budget_minutes ?? 0)).map(d => d.id));
        setGoalCustomSetIds(mapped.filter(d => d.goal_minutes > 0 && !PRESET_GOAL_VALUES.includes(d.goal_minutes ?? 0) && !PRESET_LIMIT_VALUES.includes(d.goal_minutes ?? 0)).map(d => d.id));
    }

    async function updateCategory(id: string, category: string) {
        const appName = list.find(i => i.id === id)?.app_name;
        setList(prev => prev.map(i => i.id === id ? { ...i, category } : i));

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const updates: Promise<unknown>[] = [
            supabase.from('app_categories').update({ category }).eq('id', id),
        ];
        if (appName) {
            updates.push(
                supabase.from('app_usage').update({ category }).eq('user_id', user.id).eq('app_name', appName)
            );
        }
        await Promise.all(updates);
        refreshList();
    }

    async function updateBudget(id: string, minutes: number) {
        await supabase.from('app_categories').update({ budget_minutes: minutes }).eq('id', id);
        refreshList();
    }

    async function updateGoal(id: string, minutes: number) {
        await supabase.from('app_categories').update({ goal_minutes: minutes }).eq('id', id);
        refreshList();
    }

    async function confirmCustomBudget(id: string) {
        const mins = parseInt(customInputVal);
        if (isNaN(mins) || mins < 1) {
            Alert.alert('입력 오류', '1 이상의 숫자를 입력해주세요.');
            return;
        }
        Keyboard.dismiss();
        setList(prev => prev.map(i => i.id === id ? { ...i, budget_minutes: mins } : i));
        await updateBudget(id, mins);
        setCustomSetIds(prev => prev.includes(id) ? prev : [...prev, id]);
        setCustomInputId(null);
        setCustomInputVal('');
        setSavedId(id);
        setTimeout(() => setSavedId(null), 1200);
    }

    async function confirmCustomGoal(id: string) {
        const mins = parseInt(goalInputVal);
        if (isNaN(mins) || mins < 1) {
            Alert.alert('입력 오류', '1 이상의 숫자를 입력해주세요.');
            return;
        }
        Keyboard.dismiss();
        setList(prev => prev.map(i => i.id === id ? { ...i, goal_minutes: mins } : i));
        await updateGoal(id, mins);
        setGoalCustomSetIds(prev => prev.includes(id) ? prev : [...prev, id]);
        setGoalInputId(null);
        setGoalInputVal('');
        setGoalSavedId(id);
        setTimeout(() => setGoalSavedId(null), 1200);
    }

    function fmtMinutes(m: number) {
        if (m === 0) return null;
        return `${Math.floor(m / 60)}h ${m % 60}m`.replace('0h ', '');
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Text style={styles.backIcon}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>앱 포트폴리오 관리</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView 
                style={{ flex: 1 }} 
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets={true}
                showsVerticalScrollIndicator={false}
            >
                <Text style={styles.hint}>앱을 성격에 맞게 분류하고 예산/한도를 설정하세요.{"\n"}경영 결과 분석의 기초가 됩니다.</Text>

                {loading ? (
                    <View style={{ paddingVertical: 80, alignItems: 'center' }}>
                        <ActivityIndicator color={colors.accent} />
                    </View>
                ) : (
                    CATEGORIES.map(cat => (
                        <View key={cat} style={{ marginBottom: 32 }}>
                            <Text style={styles.sectionLabel}>{cat}</Text>
                            {list.filter(item => item.category === cat).map(item => (
                                <View key={item.id} style={styles.itemCard}>
                                    <View style={styles.itemHeader}>
                                        <Text style={styles.itemName}>{item.app_name}</Text>
                                        <View style={{ flexDirection: 'row', gap: 6 }}>
                                            {item.category === '소비' && item.budget_minutes > 0 && (
                                                <Text style={styles.badge}>예산 {fmtMinutes(item.budget_minutes)}</Text>
                                            )}
                                            {item.goal_minutes > 0 && (
                                                <Text style={[styles.badge, { color: item.category === '투자' ? colors.profit : colors.loss }]}>
                                                    {item.category === '투자' ? '목표' : '한도'} {fmtMinutes(item.goal_minutes)}
                                                </Text>
                                            )}
                                        </View>
                                    </View>

                                    {/* Category Selector */}
                                    <View style={styles.catRow}>
                                        {CATEGORIES.map(c => (
                                            <TouchableOpacity
                                                key={c}
                                                style={[styles.catBtn, item.category === c && styles.catBtnActive]}
                                                onPress={() => updateCategory(item.id, c)}
                                            >
                                                <Text style={[styles.catBtnText, item.category === c && styles.catBtnTextActive]}>{c}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    {/* Settings - Budget/Goal */}
                                    {(item.category === '소비' || item.category === '투자') && (
                                        <View style={styles.settingsArea}>
                                            {item.category === '소비' && (
                                                <View style={{ marginBottom: 12 }}>
                                                    <Text style={styles.settingLabel}>하루 예산</Text>
                                                    <View style={styles.presetRow}>
                                                        {PRESET_BUDGETS.map(min => (
                                                            <TouchableOpacity
                                                                key={min}
                                                                style={[styles.presetBtn, item.budget_minutes === min && !customSetIds.includes(item.id) && styles.presetBtnActive]}
                                                                onPress={() => { setCustomInputId(null); setCustomSetIds(prev => prev.filter(x => x !== item.id)); updateBudget(item.id, min); }}
                                                            >
                                                                <Text style={[styles.presetText, item.budget_minutes === min && !customSetIds.includes(item.id) && styles.presetTextActive]}>{min >= 60 ? `${min/60}h` : `${min}m`}</Text>
                                                            </TouchableOpacity>
                                                        ))}
                                                        <TouchableOpacity 
                                                            style={[styles.presetBtn, (customInputId === item.id || customSetIds.includes(item.id)) && styles.presetBtnActive]}
                                                            onPress={() => { setGoalInputId(null); setCustomInputId(item.id); setCustomInputVal(customSetIds.includes(item.id) ? String(item.budget_minutes) : ''); }}
                                                        >
                                                            <Text style={[styles.presetText, (customInputId === item.id || customSetIds.includes(item.id)) && styles.presetTextActive]}>직접</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                    {customInputId === item.id && (
                                                        <View style={styles.customRow}>
                                                            <TextInput style={styles.customInput} value={customInputVal} onChangeText={setCustomInputVal} keyboardType="number-pad" placeholder="분" placeholderTextColor={colors.textDisabled} autoFocus />
                                                            <TouchableOpacity style={styles.confirmBtn} onPress={() => confirmCustomBudget(item.id)}><Text style={styles.confirmText}>확인</Text></TouchableOpacity>
                                                            <TouchableOpacity onPress={() => setCustomInputId(null)}><Text style={styles.cancelText}>취소</Text></TouchableOpacity>
                                                        </View>
                                                    )}
                                                </View>
                                            )}

                                            <View>
                                                <Text style={[styles.settingLabel, { color: item.category === '투자' ? colors.profit : colors.loss }]}>{item.category === '투자' ? '주간 목표' : '주간 한도'}</Text>
                                                <View style={styles.presetRow}>
                                                    {(item.category === '투자' ? PRESET_GOALS : PRESET_LIMITS).map(min => (
                                                        <TouchableOpacity
                                                            key={min}
                                                            style={[styles.presetBtn, item.goal_minutes === min && !goalCustomSetIds.includes(item.id) && styles.presetBtnActive]}
                                                            onPress={() => { setGoalInputId(null); setGoalCustomSetIds(prev => prev.filter(x => x !== item.id)); updateGoal(item.id, min); }}
                                                        >
                                                            <Text style={[styles.presetText, item.goal_minutes === min && !goalCustomSetIds.includes(item.id) && styles.presetTextActive]}>{min/60}h</Text>
                                                        </TouchableOpacity>
                                                    ))}
                                                    <TouchableOpacity 
                                                        style={[styles.presetBtn, (goalInputId === item.id || goalCustomSetIds.includes(item.id)) && styles.presetBtnActive]}
                                                        onPress={() => { setCustomInputId(null); setGoalInputId(item.id); setGoalInputVal(goalCustomSetIds.includes(item.id) ? String(item.goal_minutes) : ''); }}
                                                    >
                                                        <Text style={[styles.presetText, (goalInputId === item.id || goalCustomSetIds.includes(item.id)) && styles.presetTextActive]}>직접</Text>
                                                    </TouchableOpacity>
                                                </View>
                                                {goalInputId === item.id && (
                                                    <View style={styles.customRow}>
                                                        <TextInput style={styles.customInput} value={goalInputVal} onChangeText={setGoalInputVal} keyboardType="number-pad" placeholder="분" placeholderTextColor={colors.textDisabled} autoFocus />
                                                        <TouchableOpacity style={styles.confirmBtn} onPress={() => confirmCustomGoal(item.id)}><Text style={styles.confirmText}>확인</Text></TouchableOpacity>
                                                        <TouchableOpacity onPress={() => setGoalInputId(null)}><Text style={styles.cancelText}>취소</Text></TouchableOpacity>
                                                    </View>
                                                )}
                                            </View>
                                        </View>
                                    )}
                                </View>
                            ))}
                        </View>
                    ))
                )}
                
                <View style={{ height: 100 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgBase },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', paddingTop: 60 },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    backIcon: { fontSize: 32, color: colors.textPrimary, fontWeight: '300' },
    headerTitle: { fontFamily: font.bold, fontSize: 15, color: colors.textPrimary },
    scrollContent: { paddingHorizontal: 24, paddingTop: 24 },
    hint: { fontFamily: font.regular, fontSize: 11, color: colors.textMuted, lineHeight: 18, marginBottom: 32 },
    sectionLabel: { fontFamily: font.bold, fontSize: 10, color: colors.textDisabled, letterSpacing: 1.5, marginBottom: 16, textTransform: 'uppercase' },
    itemCard: { backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)', marginBottom: 12 },
    itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    itemName: { fontFamily: font.bold, fontSize: 13, color: colors.textPrimary },
    badge: { fontFamily: font.bold, fontSize: 9, color: colors.accent },
    catRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
    catBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', backgroundColor: 'rgba(255,255,255,0.01)' },
    catBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    catBtnText: { fontFamily: font.bold, fontSize: 9, color: colors.textDisabled },
    catBtnTextActive: { color: '#fff' },
    settingsArea: { marginTop: 4, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.03)' },
    settingLabel: { fontFamily: font.bold, fontSize: 8, color: colors.textDisabled, letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' },
    presetRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' },
    presetBtn: { flex: 1, minWidth: '18%', paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', alignItems: 'center' },
    presetBtnActive: { borderColor: colors.accent, backgroundColor: 'rgba(249, 115, 22, 0.05)' },
    presetText: { fontFamily: font.bold, fontSize: 9, color: colors.textDisabled },
    presetTextActive: { color: colors.accent },
    customRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
    customInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, color: '#fff', fontSize: 12, fontFamily: font.bold, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    confirmBtn: { backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    confirmText: { fontFamily: font.bold, fontSize: 10, color: '#fff' },
    cancelText: { fontFamily: font.bold, fontSize: 10, color: colors.textDisabled },
});
