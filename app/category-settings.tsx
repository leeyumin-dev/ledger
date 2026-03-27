import { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView,
    TouchableOpacity, Alert, Modal,
    TextInput, KeyboardAvoidingView, Platform
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { DEFAULT_APPS } from '../src/lib/defaultApps';

type AppCategory = {
    id: string;
    app_name: string;
    category: string;
    budget_minutes: number;
};

const CATEGORIES = ['소비', '투자', '필수'];

export default function CategorySettingsScreen() {
    const [list, setList] = useState<AppCategory[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [newAppName, setNewAppName] = useState('');
    const [newCategory, setNewCategory] = useState('소비');

    useFocusEffect(
        useCallback(() => {
            loadList();
        }, [])
    );

    async function loadList() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
            .from('app_categories')
            .select('*')
            .eq('user_id', user.id)
            .order('app_name');

        if (data) setList(data);
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
            }, { onConflict: 'user_id,app_name' });

        if (error) {
            Alert.alert('오류', '저장에 실패했어요.');
            return;
        }

        setNewAppName('');
        setNewCategory('소비');
        setModalVisible(false);
        loadList();
    }

    async function updateCategory(id: string, category: string) {
        const { error } = await supabase
            .from('app_categories')
            .update({ category })
            .eq('id', id);

        if (!error) loadList();
    }

    async function updateBudget(id: string, minutes: number) {
        const { error } = await supabase
            .from('app_categories')
            .update({ budget_minutes: minutes })
            .eq('id', id);

        if (!error) loadList();
    }

    async function deleteApp(id: string, appName: string) {
        Alert.alert(
            '삭제',
            `${appName}을 삭제할까요?`,
            [
                { text: '취소', style: 'cancel' },
                {
                    text: '삭제',
                    style: 'destructive',
                    onPress: async () => {
                        await supabase.from('app_categories').delete().eq('id', id);
                        loadList();
                    }
                }
            ]
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: '#0f0f0f' }}>
            <ScrollView style={styles.container}>

                <View style={styles.header}>
                    <Text style={styles.headerSub}>카테고리 관리</Text>
                    <Text style={styles.headerTitle}>앱 분류</Text>
                </View>

                <View style={styles.thickDivider} />

                <Text style={styles.hint}>앱을 소비·투자·필수로 분류해요. 오늘 화면 손익계산서에 반영돼요.</Text>

                {CATEGORIES.map(cat => (
                    <View key={cat} style={styles.section}>
                        <Text style={styles.sectionLabel}>{cat}</Text>
                        {list.filter(item => item.category === cat).map(item => (
                            <TouchableOpacity
                                key={item.id}
                                style={styles.item}
                                onLongPress={() => deleteApp(item.id, item.app_name)}
                                delayLongPress={500}
                            >
                                <View style={styles.itemTop}>
                                    <Text style={styles.itemName}>{item.app_name}</Text>
                                    <Text style={styles.itemBudget}>
                                        {item.budget_minutes === 0 ? '예산 없음' : `${Math.floor(item.budget_minutes / 60)}h ${item.budget_minutes % 60}m`}
                                    </Text>
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

                                {/* 예산 슬라이더 */}
                                {item.category === '소비' && (
                                    <View style={styles.budgetRow}>
                                        <Text style={styles.budgetLabel}>하루 예산</Text>
                                        <View style={styles.budgetBtns}>
                                            {[30, 60, 90, 120].map(min => (
                                                <TouchableOpacity
                                                    key={min}
                                                    style={[styles.budgetBtn, item.budget_minutes === min && styles.budgetBtnActive]}
                                                    onPress={() => updateBudget(item.id, min)}
                                                >
                                                    <Text style={[styles.budgetBtnText, item.budget_minutes === min && styles.budgetBtnTextActive]}>
                                                        {min >= 60 ? `${min / 60}h` : `${min}m`}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                            <TouchableOpacity
                                                style={[styles.budgetBtn, item.budget_minutes === 0 && styles.budgetBtnActive]}
                                                onPress={() => updateBudget(item.id, 0)}
                                            >
                                                <Text style={[styles.budgetBtnText, item.budget_minutes === 0 && styles.budgetBtnTextActive]}>
                                                    없음
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )}
                            </TouchableOpacity>
                        ))}
                        {list.filter(item => item.category === cat).length === 0 && (
                            <Text style={styles.emptyText}>{cat} 앱 없음</Text>
                        )}
                    </View>
                ))}

                <Text style={styles.longPressHint}>항목을 길게 누르면 삭제돼요</Text>
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
    itemTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    itemBudget: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 11,
        color: '#e8410a',
    },
    budgetRow: {
        marginTop: 10,
        borderTopWidth: 0.5,
        borderTopColor: '#2a2826',
        paddingTop: 10,
    },
    budgetLabel: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 10,
        color: '#5a5754',
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginBottom: 8,
    },
    budgetBtns: {
        flexDirection: 'row',
        gap: 6,
        flexWrap: 'wrap',
    },
    budgetBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#2a2826',
    },
    budgetBtnActive: {
        backgroundColor: '#161614',
        borderColor: '#e8410a',
    },
    budgetBtnText: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 11,
        color: '#5a5754',
    },
    budgetBtnTextActive: {
        color: '#e8410a',
    },
    defaultAppBtnRegistered: {
        borderColor: '#3a3836',
        backgroundColor: '#0f0f0f',
        opacity: 0.4,
    },
    defaultAppBtnTextRegistered: {
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
defaultAppBtnText: {
  fontFamily: 'GeistMono_400Regular',
  fontSize: 12,
  color: '#9a9690',
},
});