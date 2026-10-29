import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { ComponentProps } from 'react';
import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryGlyph } from '@/components/CategoryGlyph';
import { useCategories } from '@/components/CategoryProvider';
import { CATEGORY_ICON_CHOICES } from '@/lib/category-icons';
import { useTheme } from '@/theme/ThemeProvider';
import type { ThemeTokens } from '@/theme/tokens';

export default function DanhMucScreen() {
  const router = useRouter();
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const { allCategories, save, hide } = useCategories();
  const active = allCategories
    .filter((row) => Number(row.is_hidden) === 0)
    .sort((a, b) => b.usage_count - a.usage_count || a.sort - b.sort || a.name.localeCompare(b.name, 'vi'));
  const hidden = allCategories
    .filter((row) => Number(row.is_hidden) !== 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(CATEGORY_ICON_CHOICES[0].emoji);
  const [busy, setBusy] = useState(false);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setName('');
    setIcon(CATEGORY_ICON_CHOICES[0].emoji);
  };

  const add = async () => {
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      await save({ name: clean, icon });
      setOpen(false);
      setName('');
      setIcon(CATEGORY_ICON_CHOICES[0].emoji);
    } catch (error) {
      Alert.alert('Không lưu được danh mục', error instanceof Error ? error.message : 'Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Quay lại" onPress={() => router.back()} style={styles.iconButton}>
          <Feather name="arrow-left" size={21} color={tokens.ink} />
        </Pressable>
        <Text style={styles.title}>Danh mục</Text>
        <Pressable accessibilityLabel="Thêm danh mục" onPress={() => setOpen(true)} style={styles.iconButton}>
          <Feather name="plus" size={22} color={tokens.accent} />
        </Pressable>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        <Pressable accessibilityLabel="Thêm danh mục" onPress={() => setOpen(true)} style={styles.addButton}>
          <Feather name="plus" size={18} color={tokens.paper} />
          <Text style={styles.addText}>Thêm danh mục</Text>
        </Pressable>
        {active.map((row) => (
          <CategoryRowView
            key={row.id}
            name={row.name}
            icon={row.icon}
            meta={`${row.usage_count} lần sử dụng`}
            actionLabel={`Ẩn ${row.name}`}
            actionIcon="eye-off"
            onAction={() => {
              if (active.length <= 1) {
                Alert.alert('Cần giữ một danh mục', 'Hãy hiện lại danh mục khác trước khi ẩn danh mục cuối.');
                return;
              }
              void hide(row.id, true).catch((error: unknown) => {
                Alert.alert('Không ẩn được danh mục', error instanceof Error ? error.message : 'Vui lòng thử lại.');
              });
            }}
          />
        ))}
        {hidden.length > 0 ? <Text style={styles.section}>Đã ẩn</Text> : null}
        {hidden.map((row) => (
          <CategoryRowView
            key={row.id}
            name={row.name}
            icon={row.icon}
            meta="Đang ẩn"
            muted
            actionLabel={`Hiện ${row.name}`}
            actionIcon="eye"
            onAction={() => {
              void hide(row.id, false).catch((error: unknown) => {
                Alert.alert('Không hiện được danh mục', error instanceof Error ? error.message : 'Vui lòng thử lại.');
              });
            }}
          />
        ))}
      </ScrollView>

      <Modal transparent visible={open} animationType="fade" onRequestClose={close}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.scrim}
        >
          <Pressable accessibilityLabel="Đóng" onPress={close} style={styles.scrimHit} />
          <View style={styles.popup}>
            <Text style={styles.popupTitle}>Danh mục mới</Text>
            <TextInput
              autoFocus
              value={name}
              onChangeText={setName}
              placeholder="Tên danh mục"
              placeholderTextColor={tokens.ink3}
              style={styles.input}
            />
            <ScrollView style={styles.iconScroll} contentContainerStyle={styles.iconGrid}>
              {CATEGORY_ICON_CHOICES.map((item) => {
                const selected = icon === item.emoji;
                return (
                  <Pressable
                    key={item.emoji}
                    accessibilityLabel={`Chọn icon ${item.emoji}`}
                    accessibilityState={{ selected }}
                    onPress={() => setIcon(item.emoji)}
                    style={[styles.iconChoice, selected && styles.iconChoiceOn]}
                  >
                    <CategoryGlyph icon={item.emoji} size={42} />
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.popupActions}>
              <Pressable accessibilityLabel="Huỷ" onPress={close} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Huỷ</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Lưu danh mục"
                disabled={!name.trim() || busy}
                onPress={() => void add()}
                style={[styles.saveButton, (!name.trim() || busy) && styles.saveDisabled]}
              >
                <Text style={styles.saveText}>{busy ? 'Đang lưu…' : 'Lưu'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function CategoryRowView({
  name,
  icon,
  meta,
  muted,
  actionLabel,
  actionIcon,
  onAction,
}: {
  name: string;
  icon: string;
  meta: string;
  muted?: boolean;
  actionLabel: string;
  actionIcon: ComponentProps<typeof Feather>['name'];
  onAction: () => void;
}) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  return (
    <View style={[styles.row, muted && styles.rowMuted]}>
      <CategoryGlyph icon={icon} size={40} />
      <View style={styles.rowBody}>
        <Text style={styles.rowName}>{name}</Text>
        <Text style={styles.rowMeta}>{meta}</Text>
      </View>
      <Pressable accessibilityLabel={actionLabel} onPress={onAction} style={styles.hideButton}>
        <Feather name={actionIcon} size={17} color={tokens.ink3} />
      </Pressable>
    </View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.paper },
    header: {
      height: 56,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: t.line,
    },
    iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    title: { fontFamily: 'Inter_600SemiBold', fontSize: 18, color: t.ink },
    addButton: {
      height: 48,
      borderRadius: 16,
      backgroundColor: t.accent,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    addText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: t.paper },
    list: { flex: 1 },
    listContent: { padding: 16, gap: 8 },
    section: {
      marginTop: 12,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: t.ink3,
    },
    rowMuted: { opacity: 0.62 },
    row: {
      minHeight: 64,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: t.line,
      borderRadius: 16,
      backgroundColor: t.surface,
    },
    rowBody: { flex: 1, paddingVertical: 9 },
    rowName: { fontFamily: 'Inter_500Medium', fontSize: 15, color: t.ink },
    rowMeta: { marginTop: 2, fontFamily: 'Inter_400Regular', fontSize: 12, color: t.ink3 },
    hideButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,19,16,0.42)' },
    scrimHit: { flex: 1 },
    popup: {
      margin: 12,
      padding: 18,
      borderRadius: 24,
      backgroundColor: t.paper,
      gap: 14,
    },
    popupTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 18, color: t.ink },
    input: {
      height: 48,
      borderWidth: 1,
      borderColor: t.line,
      borderRadius: 14,
      paddingHorizontal: 14,
      color: t.ink,
      backgroundColor: t.surface,
      fontFamily: 'Inter_400Regular',
      fontSize: 15,
    },
    iconScroll: { maxHeight: 280 },
    iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    iconChoice: {
      borderRadius: 16,
      borderWidth: 2,
      borderColor: 'transparent',
      padding: 2,
    },
    iconChoiceOn: { borderColor: t.accent },
    popupActions: { flexDirection: 'row', gap: 10 },
    cancelButton: {
      flex: 1,
      height: 46,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.surface2,
    },
    cancelText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: t.ink2 },
    saveButton: {
      flex: 1.4,
      height: 46,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.accent,
    },
    saveDisabled: { opacity: 0.45 },
    saveText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: t.paper },
  });
}
