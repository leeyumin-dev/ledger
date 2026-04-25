import { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView,
    TouchableOpacity, Alert,
    TextInput, Keyboard, ActivityIndicator
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { colors, font, fontSize, spacing, radius } from '../src/lib/theme';

type AppCategory = {
    id: string;
    app_name: string;
    category: string;
    budget_minutes: number;
    goal_minutes: number;
};

const CATEGORIES = ['소비', '투자', '필수'];
const PRESET_BUDGETS = [30, 60, 90, 120];
const PRESET_GOALS = [60, 120, 300, 420]; // 1h, 2h, 5h, 7h (투자용)
const PRESET_LIMITS = [120, 300, 420, 600]; // 2h, 5h, 7h, 10h (소비 주간 한도)

export default function CategorySettingsScreen() {
    const [list, setList] = useState<AppCategory[]>([]);
    const [loading, setLoading] = useState(true);

    // 예산 커스텀 입력
    const [customInputId, setCustomInputId] = useState<string | null>(null);
    const [customInputVal, setCustomInputVal] = useState('');
    const [savedId, setSavedId] = useState<string | null>(null);
    const [customSetIds, setCustomSetIds] = useState<string[]>([]);

    // 목표 커스텀 입력
    const [goalInputId, setGoalInputId] = useState<string | null>(null);
    const [goalInputVal, setGoalInputVal] = useState('');
    const [goalSavedId, setGoalSavedId] = useState<string | null>(null);
    const [goalCustomSetIds, setGoalCustomSetIds] = useState<string[]>([]);

    useFocusEffect(
        useCallback(() => {
            loadList();
        }, [])
    );

    // 최초 진입 시 스피너 포함 로드
    async function loadList() {
        setLoading(true);
        await fetchAndApply();
        setLoading(false);
    }

    // 카테고리/예산/목표 변경 후 스피너 없이 조용히 갱신
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
        // 낙관적 업데이트 — UI 즉시 반영
        setList(prev => prev.map(i => i.id === id ? { ...i, category } : i));

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const updates: Promise<unknown>[] = [
            supabase.from('app_categories').update({ category }).eq('id', id),
        ];
        if (appName) {
            // app_usage에도 카테고리 동기화 (기존 기록이 올바른 버킷에 집계되도록)
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
        <View style={{ flex: 1, backgroundColor: colors.bgBase }}>
            <ScrollView
                style={styles.container}
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets={true}
            >

                <View style={styles.header}>
                    <Text style={styles.headerSub}>앱 관리</Text>
                    <Text style={styles.headerTitle}>소비 · 투자 설정</Text>
                </View>

                <View style={styles.thickDivider} />

                <Text style={styles.hint}>앱을 소비·투자·필수로 분류해요. 오늘 화면 손익계산서에 반영돼요.</Text>

                {loading ? (
                    <View style={{ paddingVertical: 48, alignItems: 'center' }}>
                        <ActivityIndicator color={colors.accent} />
                    </View>
                ) : null}

                {!loading && CATEGORIES.map(cat => (
                    <View key={cat} style={styles.section}>
                        <Text style={styles.sectionLabel}>{cat}</Text>
                        {list.filter(item => item.category === cat).map(item => (
                            <TouchableOpacity
                                key={item.id}
                                style={styles.item}
                            >
                                <View style={styles.itemTop}>
                                    <Text style={styles.itemName}>{item.app_name}</Text>
                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        {item.category === '소비' && fmtMinutes(item.budget_minutes) && (
                                            <Text style={[styles.itemBadge, savedId === item.id && styles.itemBadgeSaved]}>
                                                {savedId === item.id ? '✓ 저장됨' : `예산 ${fmtMinutes(item.budget_minutes)}`}
                                            </Text>
                                        )}
                                        {item.category === '소비' && fmtMinutes(item.goal_minutes) && (
                                            <Text style={[styles.itemBadge, styles.itemBadgeLimit, goalSavedId === item.id && styles.itemBadgeSaved]}>
                                                {goalSavedId === item.id ? '✓ 저장됨' : `한도 ${fmtMinutes(item.goal_minutes)}/주`}
                                            </Text>
                                        )}
                                        {item.category === '투자' && fmtMinutes(item.goal_minutes) && (
                                            <Text style={[styles.itemBadge, styles.itemBadgeGoal, goalSavedId === item.id && styles.itemBadgeSaved]}>
                                                {goalSavedId === item.id ? '✓ 저장됨' : `목표 ${fmtMinutes(item.goal_minutes)}/주`}
                                            </Text>
                                        )}
                                    </View>
                                </View>

                                {/* 카테고리 선택 */}
                                <View style={styles.catBtnRow}>
                                    {CATEGORIES.map(c => (
                                        <TouchableOpacity
                                            key={c}
                                            style={[styles.catBtn, item.category === c && styles.catBtnActive]}
                                            onPress={() => updateCategory(item.id, c)}
                                        >
                                            <Text style={[styles.catBtnText, item.category === c && styles.catBtnTextActive]}>
                                                {c}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {/* 소비: 하루 예산 */}
                                {item.category === '소비' && (
                                    <View style={styles.settingRow}>
                                        <Text style={styles.settingLabel}>하루 예산</Text>
                                        <View style={styles.presetBtns}>
                                            {PRESET_BUDGETS.map(min => (
                                                <TouchableOpacity
                                                    key={min}
                                                    style={[styles.presetBtn, item.budget_minutes === min && !customSetIds.includes(item.id) && customInputId !== item.id && styles.presetBtnActive]}
                                                    onPress={() => {
                                                        setCustomInputId(null);
                                                        setCustomSetIds(prev => prev.filter(x => x !== item.id));
                                                        setList(prev => prev.map(i => i.id === item.id ? { ...i, budget_minutes: min } : i));
                                                        updateBudget(item.id, min);
                                                    }}
                                                >
                                                    <Text style={[styles.presetBtnText, item.budget_minutes === min && !customSetIds.includes(item.id) && customInputId !== item.id && styles.presetBtnTextActive]}>
                                                        {min >= 60 ? `${min / 60}h` : `${min}m`}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                            <TouchableOpacity
                                                style={[styles.presetBtn, (customInputId === item.id || customSetIds.includes(item.id)) && styles.presetBtnActive]}
                                                onPress={() => {
                                                    setGoalInputId(null);
                                                    setCustomInputId(item.id);
                                                    setCustomInputVal(customSetIds.includes(item.id) && item.budget_minutes > 0 ? String(item.budget_minutes) : '');
                                                }}
                                            >
                                                <Text style={[styles.presetBtnText, (customInputId === item.id || customSetIds.includes(item.id)) && styles.presetBtnTextActive]}>직접</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.presetBtn, item.budget_minutes === 0 && customInputId !== item.id && styles.presetBtnActive]}
                                                onPress={() => {
                                                    setCustomInputId(null);
                                                    setCustomSetIds(prev => prev.filter(x => x !== item.id));
                                                    setList(prev => prev.map(i => i.id === item.id ? { ...i, budget_minutes: 0 } : i));
                                                    updateBudget(item.id, 0);
                                                }}
                                            >
                                                <Text style={[styles.presetBtnText, item.budget_minutes === 0 && customInputId !== item.id && styles.presetBtnTextActive]}>없음</Text>
                                            </TouchableOpacity>
                                        </View>
                                        {customInputId === item.id && (
                                            <View style={styles.customInputRow}>
                                                <TextInput
                                                    style={styles.customInput}
                                                    value={customInputVal}
                                                    onChangeText={setCustomInputVal}
                                                    keyboardType="number-pad"
                                                    placeholder="분 입력"
                                                    placeholderTextColor={colors.textMuted}
                                                    autoFocus
                                                />
                                                <Text style={styles.customInputUnit}>분</Text>
                                                <TouchableOpacity style={styles.customConfirmBtn} onPress={() => confirmCustomBudget(item.id)}>
                                                    <Text style={styles.customConfirmText}>확인</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity style={styles.customCancelBtn} onPress={() => { setCustomInputId(null); setCustomInputVal(''); }}>
                                                    <Text style={styles.customCancelText}>취소</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </View>
                                )}

                                {/* 소비: 주간 한도 */}
                                {item.category === '소비' && (
                                    <View style={styles.settingRow}>
                                        <Text style={[styles.settingLabel, { color: colors.loss }]}>주간 한도</Text>
                                        <View style={styles.presetBtns}>
                                            {PRESET_LIMITS.map(min => (
                                                <TouchableOpacity
                                                    key={min}
                                                    style={[styles.presetBtn, styles.presetBtnLimit, item.goal_minutes === min && !goalCustomSetIds.includes(item.id) && goalInputId !== item.id && styles.presetBtnLimitActive]}
                                                    onPress={() => {
                                                        setGoalInputId(null);
                                                        setGoalCustomSetIds(prev => prev.filter(x => x !== item.id));
                                                        setList(prev => prev.map(i => i.id === item.id ? { ...i, goal_minutes: min } : i));
                                                        updateGoal(item.id, min);
                                                    }}
                                                >
                                                    <Text style={[styles.presetBtnText, item.goal_minutes === min && !goalCustomSetIds.includes(item.id) && goalInputId !== item.id && styles.presetBtnLimitTextActive]}>
                                                        {`${min / 60}h`}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                            <TouchableOpacity
                                                style={[styles.presetBtn, styles.presetBtnLimit, (goalInputId === item.id || goalCustomSetIds.includes(item.id)) && styles.presetBtnLimitActive]}
                                                onPress={() => {
                                                    setCustomInputId(null);
                                                    setGoalInputId(item.id);
                                                    setGoalInputVal(goalCustomSetIds.includes(item.id) && item.goal_minutes > 0 ? String(item.goal_minutes) : '');
                                                }}
                                            >
                                                <Text style={[styles.presetBtnText, (goalInputId === item.id || goalCustomSetIds.includes(item.id)) && styles.presetBtnLimitTextActive]}>직접</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.presetBtn, styles.presetBtnLimit, item.goal_minutes === 0 && goalInputId !== item.id && styles.presetBtnLimitActive]}
                                                onPress={() => {
                                                    setGoalInputId(null);
                                                    setGoalCustomSetIds(prev => prev.filter(x => x !== item.id));
                                                    setList(prev => prev.map(i => i.id === item.id ? { ...i, goal_minutes: 0 } : i));
                                                    updateGoal(item.id, 0);
                                                }}
                                            >
                                                <Text style={[styles.presetBtnText, item.goal_minutes === 0 && goalInputId !== item.id && styles.presetBtnLimitTextActive]}>없음</Text>
                                            </TouchableOpacity>
                                        </View>
                                        {goalInputId === item.id && item.category === '소비' && (
                                            <View style={styles.customInputRow}>
                                                <TextInput
                                                    style={[styles.customInput, { borderColor: colors.loss }]}
                                                    value={goalInputVal}
                                                    onChangeText={setGoalInputVal}
                                                    keyboardType="number-pad"
                                                    placeholder="분 입력"
                                                    placeholderTextColor={colors.textMuted}
                                                    autoFocus
                                                />
                                                <Text style={styles.customInputUnit}>분/주</Text>
                                                <TouchableOpacity style={[styles.customConfirmBtn, { backgroundColor: colors.loss }]} onPress={() => confirmCustomGoal(item.id)}>
                                                    <Text style={[styles.customConfirmText, { color: colors.bgBase }]}>확인</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity style={styles.customCancelBtn} onPress={() => { setGoalInputId(null); setGoalInputVal(''); }}>
                                                    <Text style={styles.customCancelText}>취소</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </View>
                                )}

                                {/* 투자: 주간 목표 */}
                                {item.category === '투자' && (
                                    <View style={styles.settingRow}>
                                        <Text style={[styles.settingLabel, { color: colors.profit }]}>주간 목표</Text>
                                        <View style={styles.presetBtns}>
                                            {PRESET_GOALS.map(min => (
                                                <TouchableOpacity
                                                    key={min}
                                                    style={[styles.presetBtn, styles.presetBtnGoal, item.goal_minutes === min && !goalCustomSetIds.includes(item.id) && goalInputId !== item.id && styles.presetBtnGoalActive]}
                                                    onPress={() => {
                                                        setGoalInputId(null);
                                                        setGoalCustomSetIds(prev => prev.filter(x => x !== item.id));
                                                        setList(prev => prev.map(i => i.id === item.id ? { ...i, goal_minutes: min } : i));
                                                        updateGoal(item.id, min);
                                                    }}
                                                >
                                                    <Text style={[styles.presetBtnText, item.goal_minutes === min && !goalCustomSetIds.includes(item.id) && goalInputId !== item.id && styles.presetBtnGoalTextActive]}>
                                                        {min >= 60 ? `${min / 60}h` : `${min}m`}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                            <TouchableOpacity
                                                style={[styles.presetBtn, styles.presetBtnGoal, (goalInputId === item.id || goalCustomSetIds.includes(item.id)) && styles.presetBtnGoalActive]}
                                                onPress={() => {
                                                    setCustomInputId(null);
                                                    setGoalInputId(item.id);
                                                    setGoalInputVal(goalCustomSetIds.includes(item.id) && item.goal_minutes > 0 ? String(item.goal_minutes) : '');
                                                }}
                                            >
                                                <Text style={[styles.presetBtnText, (goalInputId === item.id || goalCustomSetIds.includes(item.id)) && styles.presetBtnGoalTextActive]}>직접</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.presetBtn, styles.presetBtnGoal, item.goal_minutes === 0 && goalInputId !== item.id && styles.presetBtnGoalActive]}
                                                onPress={() => {
                                                    setGoalInputId(null);
                                                    setGoalCustomSetIds(prev => prev.filter(x => x !== item.id));
                                                    setList(prev => prev.map(i => i.id === item.id ? { ...i, goal_minutes: 0 } : i));
                                                    updateGoal(item.id, 0);
                                                }}
                                            >
                                                <Text style={[styles.presetBtnText, item.goal_minutes === 0 && goalInputId !== item.id && styles.presetBtnGoalTextActive]}>없음</Text>
                                            </TouchableOpacity>
                                        </View>
                                        {goalInputId === item.id && (
                                            <View style={styles.customInputRow}>
                                                <TextInput
                                                    style={[styles.customInput, { borderColor: colors.profit }]}
                                                    value={goalInputVal}
                                                    onChangeText={setGoalInputVal}
                                                    keyboardType="number-pad"
                                                    placeholder="분 입력"
                                                    placeholderTextColor={colors.textMuted}
                                                    autoFocus
                                                />
                                                <Text style={styles.customInputUnit}>분/주</Text>
                                                <TouchableOpacity style={[styles.customConfirmBtn, { backgroundColor: colors.profit }]} onPress={() => confirmCustomGoal(item.id)}>
                                                    <Text style={[styles.customConfirmText, { color: colors.bgBase }]}>확인</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity style={styles.customCancelBtn} onPress={() => { setGoalInputId(null); setGoalInputVal(''); }}>
                                                    <Text style={styles.customCancelText}>취소</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </View>
                                )}
                            </TouchableOpacity>
                        ))}
                        {list.filter(item => item.category === cat).length === 0 && (
                            <Text style={styles.emptyText}>{cat} 앱 없음</Text>
                        )}
                    </View>
                ))}

                <Text style={styles.longPressHint}>추적 앱 추가·삭제는 프로필 → 추적 앱 변경에서 할 수 있어요</Text>
                <View style={{ height: 100 }} />

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bgBase,
        paddingHorizontal: spacing.lg,
    },
    header: {
        paddingTop: 72,
        paddingBottom: spacing.lg,
    },
    headerSub: {
        fontFamily: font.regular,
        fontSize: fontSize.xs,
        color: colors.textMuted,
        letterSpacing: 1,
        marginBottom: 6,
    },
    headerTitle: {
        fontFamily: font.medium,
        fontSize: fontSize.xl,
        color: colors.textPrimary,
        letterSpacing: -0.5,
    },
    thickDivider: {
        height: 1.5,
        backgroundColor: colors.textDisabled,
        marginVertical: spacing.sm,
    },
    hint: {
        fontFamily: font.regular,
        fontSize: fontSize.sm,
        color: colors.textMuted,
        lineHeight: 20,
        marginBottom: spacing.lg,
    },
    section: {
        marginBottom: spacing.lg,
    },
    sectionLabel: {
        fontFamily: font.regular,
        fontSize: fontSize.xs,
        color: colors.textMuted,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        marginBottom: 10,
    },
    item: {
        backgroundColor: colors.bgSurface,
        borderRadius: radius.md,
        padding: 14,
        marginBottom: spacing.sm,
    },
    itemName: {
        fontFamily: font.medium,
        fontSize: fontSize.md,
        color: colors.textPrimary,
        marginBottom: 10,
    },
    itemTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    itemBadge: {
        fontFamily: font.regular,
        fontSize: fontSize.xs,
        color: colors.accent,
    },
    itemBadgeGoal: {
        color: colors.profit,
    },
    itemBadgeLimit: {
        color: colors.loss,
    },
    itemBadgeSaved: {
        color: '#39FF14',
        fontFamily: font.medium,
    },
    catBtnRow: {
        flexDirection: 'row',
        gap: 6,
    },
    catBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.border,
    },
    catBtnActive: {
        backgroundColor: colors.accent,
        borderColor: colors.accent,
    },
    catBtnText: {
        fontFamily: font.regular,
        fontSize: fontSize.xs,
        color: colors.textMuted,
    },
    catBtnTextActive: {
        color: '#ffffff',
    },
    settingRow: {
        marginTop: 10,
        borderTopWidth: 0.5,
        borderTopColor: colors.border,
        paddingTop: 10,
    },
    settingLabel: {
        fontFamily: font.regular,
        fontSize: fontSize.xs,
        color: colors.textMuted,
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginBottom: spacing.sm,
    },
    presetBtns: {
        flexDirection: 'row',
        gap: 6,
        flexWrap: 'wrap',
    },
    presetBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.border,
    },
    presetBtnGoal: {
        borderColor: colors.profitBorder,
    },
    presetBtnLimit: {
        borderColor: colors.lossBorder,
    },
    presetBtnActive: {
        backgroundColor: colors.bgSurface,
        borderColor: colors.accent,
    },
    presetBtnGoalActive: {
        backgroundColor: colors.profitBg,
        borderColor: colors.profit,
    },
    presetBtnLimitActive: {
        backgroundColor: colors.lossBg,
        borderColor: colors.loss,
    },
    presetBtnText: {
        fontFamily: font.regular,
        fontSize: fontSize.xs,
        color: colors.textMuted,
    },
    presetBtnTextActive: {
        color: colors.accent,
    },
    presetBtnGoalTextActive: {
        color: colors.profit,
    },
    presetBtnLimitTextActive: {
        color: colors.loss,
    },
    customInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
        gap: 6,
    },
    customInput: {
        flex: 1,
        backgroundColor: colors.bgBase,
        borderWidth: 1,
        borderColor: colors.accent,
        borderRadius: radius.sm,
        paddingHorizontal: 12,
        paddingVertical: spacing.sm,
        color: colors.textPrimary,
        fontFamily: font.medium,
        fontSize: fontSize.md,
    },
    customInputUnit: {
        fontFamily: font.regular,
        fontSize: fontSize.sm,
        color: colors.textMuted,
    },
    customConfirmBtn: {
        backgroundColor: colors.accent,
        borderRadius: radius.sm,
        paddingHorizontal: 12,
        paddingVertical: spacing.sm,
    },
    customConfirmText: {
        fontFamily: font.medium,
        fontSize: fontSize.sm,
        color: '#fff',
    },
    customCancelBtn: {
        paddingHorizontal: 10,
        paddingVertical: spacing.sm,
    },
    customCancelText: {
        fontFamily: font.regular,
        fontSize: fontSize.sm,
        color: colors.textMuted,
    },
    emptyText: {
        fontFamily: font.regular,
        fontSize: fontSize.sm,
        color: colors.textDisabled,
        paddingVertical: spacing.sm,
    },
    longPressHint: {
        fontFamily: font.regular,
        fontSize: fontSize.xs,
        color: colors.textDisabled,
        textAlign: 'center',
        marginTop: spacing.sm,
    },
});
