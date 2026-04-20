import { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView,
    TouchableOpacity, Alert, Modal,
    TextInput, KeyboardAvoidingView, Platform, Keyboard, ActivityIndicator
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { DEFAULT_APPS } from '../src/lib/defaultApps';

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
    const [modalVisible, setModalVisible] = useState(false);
    const [newAppName, setNewAppName] = useState('');
    const [newCategory, setNewCategory] = useState('소비');

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

    async function addApp() {
        if (!newAppName.trim()) {
            Alert.alert('입력 오류', '앱 이름을 입력해주세요.');
            return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase
            .from('app_categories')
            .upsert({
                user_id: user.id,
                app_name: newAppName.trim(),
                category: newCategory,
                budget_minutes: 0,
                goal_minutes: 0,
            }, { onConflict: 'user_id,app_name' });

        if (error) {
            Alert.alert('오류', '저장에 실패했어요.');
            return;
        }

        setNewAppName('');
        setNewCategory('소비');
        setModalVisible(false);
        refreshList();
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
        <View style={{ flex: 1, backgroundColor: '#0f0f0f' }}>
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
                        <ActivityIndicator color="#e8410a" />
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
                                                    placeholderTextColor="#5a5754"
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
                                        <Text style={[styles.settingLabel, { color: '#f87171' }]}>주간 한도</Text>
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
                                                    style={[styles.customInput, { borderColor: '#f87171' }]}
                                                    value={goalInputVal}
                                                    onChangeText={setGoalInputVal}
                                                    keyboardType="number-pad"
                                                    placeholder="분 입력"
                                                    placeholderTextColor="#5a5754"
                                                    autoFocus
                                                />
                                                <Text style={styles.customInputUnit}>분/주</Text>
                                                <TouchableOpacity style={[styles.customConfirmBtn, { backgroundColor: '#f87171' }]} onPress={() => confirmCustomGoal(item.id)}>
                                                    <Text style={[styles.customConfirmText, { color: '#0f0f0f' }]}>확인</Text>
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
                                        <Text style={[styles.settingLabel, { color: '#4ade80' }]}>주간 목표</Text>
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
                                                    style={[styles.customInput, { borderColor: '#4ade80' }]}
                                                    value={goalInputVal}
                                                    onChangeText={setGoalInputVal}
                                                    keyboardType="number-pad"
                                                    placeholder="분 입력"
                                                    placeholderTextColor="#5a5754"
                                                    autoFocus
                                                />
                                                <Text style={styles.customInputUnit}>분/주</Text>
                                                <TouchableOpacity style={[styles.customConfirmBtn, { backgroundColor: '#4ade80' }]} onPress={() => confirmCustomGoal(item.id)}>
                                                    <Text style={[styles.customConfirmText, { color: '#0f0f0f' }]}>확인</Text>
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

            <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
                <Text style={styles.fabText}>＋</Text>
            </TouchableOpacity>

            <Modal visible={modalVisible} transparent animationType="slide">
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                    <TouchableOpacity
                        style={styles.modalOverlay}
                        activeOpacity={1}
                        onPress={() => setModalVisible(false)}
                    >
                        <TouchableOpacity activeOpacity={1} onPress={() => { }}>
                            <View style={styles.modalBox}>
                                <Text style={styles.modalTitle}>앱 추가</Text>
                                <Text style={styles.quickLabel}>자주 쓰는 앱</Text>
                                <View style={[styles.quickRow, { marginBottom: 16 }]}>
                                    {DEFAULT_APPS.map(app => {
                                        const isRegistered = list.some(item => item.app_name === app.app_name);
                                        return (
                                            <TouchableOpacity
                                                key={app.app_name}
                                                style={[styles.defaultAppBtn, isRegistered && styles.defaultAppBtnRegistered]}
                                                onPress={() => {
                                                    if (isRegistered) return;
                                                    setNewAppName(app.app_name);
                                                    setNewCategory(app.category);
                                                }}
                                                disabled={isRegistered}
                                            >
                                                <Text style={[styles.defaultAppBtnText, isRegistered && styles.defaultAppBtnTextRegistered]}>
                                                    {isRegistered ? `✓ ${app.app_name}` : app.app_name}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                                <Text style={styles.quickLabel}>직접 입력</Text>
                                <TextInput
                                    style={styles.modalInput}
                                    placeholder="앱 이름 (예: 유튜브)"
                                    placeholderTextColor="#5a5754"
                                    value={newAppName}
                                    onChangeText={setNewAppName}
                                    autoFocus
                                />
                                <View style={styles.catRow}>
                                    {CATEGORIES.map(cat => (
                                        <TouchableOpacity
                                            key={cat}
                                            style={[styles.catBtn, newCategory === cat && styles.catBtnActive]}
                                            onPress={() => setNewCategory(cat)}
                                        >
                                            <Text style={[styles.catBtnText, newCategory === cat && styles.catBtnTextActive]}>
                                                {cat}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                <TouchableOpacity style={styles.modalSubmitBtn} onPress={addApp}>
                                    <Text style={styles.modalSubmitText}>추가하기</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setModalVisible(false)}>
                                    <Text style={styles.modalCancelText}>취소</Text>
                                </TouchableOpacity>
                            </View>
                        </TouchableOpacity>
                    </TouchableOpacity>
                </KeyboardAvoidingView>
            </Modal>
        </View>
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
    thickDivider: {
        height: 1.5,
        backgroundColor: '#3a3836',
        marginVertical: 12,
    },
    hint: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 12,
        color: '#5a5754',
        lineHeight: 20,
        marginBottom: 24,
    },
    section: {
        marginBottom: 24,
    },
    sectionLabel: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 10,
        color: '#5a5754',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        marginBottom: 10,
    },
    item: {
        backgroundColor: '#161614',
        borderRadius: 10,
        padding: 14,
        marginBottom: 8,
    },
    itemName: {
        fontFamily: 'GeistMono_500Medium',
        fontSize: 14,
        color: '#f0ede8',
        marginBottom: 10,
    },
    itemTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    itemBadge: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 11,
        color: '#e8410a',
    },
    itemBadgeGoal: {
        color: '#4ade80',
    },
    itemBadgeLimit: {
        color: '#f87171',
    },
    itemBadgeSaved: {
        color: '#39FF14',
        fontFamily: 'GeistMono_500Medium',
    },
    catBtnRow: {
        flexDirection: 'row',
        gap: 6,
    },
    catRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 16,
    },
    catBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#2a2826',
    },
    catBtnActive: {
        backgroundColor: '#e8410a',
        borderColor: '#e8410a',
    },
    catBtnText: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 11,
        color: '#5a5754',
    },
    catBtnTextActive: {
        color: '#ffffff',
    },
    settingRow: {
        marginTop: 10,
        borderTopWidth: 0.5,
        borderTopColor: '#2a2826',
        paddingTop: 10,
    },
    settingLabel: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 10,
        color: '#5a5754',
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginBottom: 8,
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
        borderColor: '#2a2826',
    },
    presetBtnGoal: {
        borderColor: '#1a3320',
    },
    presetBtnLimit: {
        borderColor: '#3a1a1a',
    },
    presetBtnActive: {
        backgroundColor: '#161614',
        borderColor: '#e8410a',
    },
    presetBtnGoalActive: {
        backgroundColor: '#0f2018',
        borderColor: '#4ade80',
    },
    presetBtnLimitActive: {
        backgroundColor: '#200f0f',
        borderColor: '#f87171',
    },
    presetBtnText: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 11,
        color: '#5a5754',
    },
    presetBtnTextActive: {
        color: '#e8410a',
    },
    presetBtnGoalTextActive: {
        color: '#4ade80',
    },
    presetBtnLimitTextActive: {
        color: '#f87171',
    },
    customInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
        gap: 6,
    },
    customInput: {
        flex: 1,
        backgroundColor: '#0f0f0f',
        borderWidth: 1,
        borderColor: '#e8410a',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        color: '#f0ede8',
        fontFamily: 'GeistMono_500Medium',
        fontSize: 14,
    },
    customInputUnit: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 12,
        color: '#5a5754',
    },
    customConfirmBtn: {
        backgroundColor: '#e8410a',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    customConfirmText: {
        fontFamily: 'GeistMono_500Medium',
        fontSize: 12,
        color: '#fff',
    },
    customCancelBtn: {
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    customCancelText: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 12,
        color: '#5a5754',
    },
    emptyText: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 12,
        color: '#3a3836',
        paddingVertical: 8,
    },
    longPressHint: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 10,
        color: '#3a3836',
        textAlign: 'center',
        marginTop: 8,
    },
    fab: {
        position: 'absolute',
        bottom: 32,
        right: 24,
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: '#e8410a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    fabText: {
        fontSize: 24,
        color: 'white',
        lineHeight: 28,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'flex-end',
    },
    modalBox: {
        backgroundColor: '#161614',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 24,
    },
    modalTitle: {
        fontFamily: 'GeistMono_500Medium',
        fontSize: 16,
        color: '#f0ede8',
        marginBottom: 16,
    },
    modalInput: {
        backgroundColor: '#0f0f0f',
        borderWidth: 1,
        borderColor: '#2a2826',
        borderRadius: 10,
        padding: 14,
        color: '#f0ede8',
        fontFamily: 'GeistMono_400Regular',
        fontSize: 14,
        marginBottom: 12,
    },
    modalSubmitBtn: {
        backgroundColor: '#e8410a',
        borderRadius: 10,
        padding: 16,
        alignItems: 'center',
        marginBottom: 8,
    },
    modalSubmitText: {
        fontFamily: 'GeistMono_500Medium',
        fontSize: 14,
        color: '#ffffff',
    },
    modalCancelBtn: {
        padding: 12,
        alignItems: 'center',
    },
    modalCancelText: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 13,
        color: '#5a5754',
    },
    quickLabel: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 10,
        color: '#5a5754',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        marginBottom: 8,
    },
    quickRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    defaultAppBtn: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#2a2826',
        backgroundColor: '#0f0f0f',
    },
    defaultAppBtnRegistered: {
        borderColor: '#3a3836',
        backgroundColor: '#0f0f0f',
        opacity: 0.4,
    },
    defaultAppBtnText: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 12,
        color: '#9a9690',
    },
    defaultAppBtnTextRegistered: {
        color: '#5a5754',
    },
});
