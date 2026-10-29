/* eslint-disable react-hooks/immutability */
import { Feather } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import type { ComponentProps } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { CategoryGlyph } from '@/components/CategoryGlyph';
import { useCategories } from '@/components/CategoryProvider';
import { MirrorGlaze } from '@/components/MirrorGlaze';
import { useAutoConfirm } from '@/components/useAutoConfirm';
import {
  formatDateTimeValue,
  formatTargetDate,
  localDateIso,
  type Draft
} from '@/lib/db';
import { formatVndCompact, parseVndInput } from '@/lib/money';
import { useTheme } from '@/theme/ThemeProvider';
import type { ThemeTokens } from '@/theme/tokens';

export type BundleEntry = {
  id: string;
  draft: Draft;
  status: 'pending' | 'saved' | 'deleted';
};

type Props = {
  entries: BundleEntry[];
  at: number;
  onConfirm: () => void;
  onSaveEntry: (id: string, next: Draft) => void | Promise<void>;
  onDelete?: () => void;
  onUndo?: () => void;
  undoUntil?: number;
};

export function BundleCard({
  entries,
  at,
  onConfirm,
  onSaveEntry,
  onDelete,
  onUndo,
  undoUntil,
}: Props) {
  const { tokens, reduceMotion } = useTheme();
  const { categories } = useCategories();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const mode = bundleMode(entries);
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState(() => entries.map((entry) => entry.draft));
  const [amountTexts, setAmountTexts] = useState(() => entries.map((entry) => String(entry.draft.amount)));
  const [showDate, setShowDate] = useState(false);
  const [showCats, setShowCats] = useState(false);
  const [catIndex, setCatIndex] = useState(0);
  const snapshot = useRef(entries.map((entry) => entry.draft));
  const undoLeft = useCountdown(mode === 'deleted' ? undoUntil : undefined);
  const undoSecs = Math.max(0, Math.ceil(undoLeft / 1000));

  const live = editing ? rows : entries.map((entry) => entry.draft);
  const spend = sumBy(live, 'chi');
  const income = sumBy(live, 'thu');
  const chiCount = live.filter((row) => row.direction === 'chi').length;
  const thuCount = live.filter((row) => row.direction === 'thu').length;
  const dates = [...new Set(live.map((row) => row.date))];
  const sharedDate = dates.length === 1 ? dates[0] : null;
  const low = entries.some((entry) => entry.draft.confidence < 0.6);
  const awaiting = !editing && mode === 'pending';
  const auto = useAutoConfirm(awaiting, onConfirm);

  const startEdit = () => {
    const next = entries.map((entry) => entry.draft);
    snapshot.current = next;
    setRows(next);
    setAmountTexts(next.map((row) => String(row.amount)));
    setEditing(true);
  };

  const cancelEdit = () => {
    setRows(snapshot.current);
    setAmountTexts(snapshot.current.map((row) => String(row.amount)));
    setEditing(false);
    setShowDate(false);
    setShowCats(false);
  };

  const saveEdit = async () => {
    const pending = rows.map((row, index) => {
      const amount = parseVndInput(amountTexts[index] ?? String(row.amount));
      return {
        id: entries[index].id,
        draft: {
          ...row,
          amount: amount > 0 ? amount : entries[index].draft.amount,
        },
      };
    });
    try {
      for (const item of pending) {
        await onSaveEntry(item.id, item.draft);
      }
      setEditing(false);
      setShowDate(false);
    } catch (error) {
      if (__DEV__) console.warn('[bundle] lưu sửa thất bại', error);
    }
  };

  const patchRow = (index: number, patch: Partial<Draft>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const openCategories = (index: number) => {
    if (!editing) return;
    setCatIndex(index);
    setShowCats(true);
  };

  const onDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowDate(false);
    if (event.type === 'dismissed' || !selected) return;
    const date = localDateIso(selected);
    setRows((prev) => prev.map((row) => ({ ...row, date })));
  };

  const subtitle = [
    chiCount > 0 ? `${chiCount} chi` : null,
    thuCount > 0 ? `${thuCount} thu` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Animated.View
      entering={FadeInDown.duration(reduceMotion ? 0 : 420)}
      exiting={FadeOut.duration(reduceMotion ? 0 : 280)}
      layout={LinearTransition.duration(reduceMotion ? 0 : 280)}
      style={styles.card}
    >
      <View style={mode === 'deleted' ? styles.deletedMute : undefined}>
        <View style={styles.head}>
          <View style={styles.tile}>
            <Feather name="layers" size={17} color={tokens.accent} />
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{`${live.length} khoản`}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          <View style={styles.headEnd}>
            <View style={styles.tag}>
              <Text
                style={[
                  styles.tagText,
                  mode === 'saved' && styles.tagSavedText,
                  mode === 'deleted' && styles.tagDeletedText,
                ]}
              >
                {mode === 'deleted'
                  ? 'Đã xoá'
                  : mode === 'saved'
                    ? 'Đã lưu'
                    : low
                      ? 'Cần kiểm tra'
                      : 'Chờ xác nhận'}
              </Text>
            </View>
            {mode === 'saved' && onDelete && !editing ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Xoá các khoản này"
                hitSlop={6}
                onPress={onDelete}
                style={styles.deleteBtn}
              >
                <Feather name="x" size={15} color={tokens.neg} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.totals}>
          {income > 0 ? (
            <View style={styles.amountRow}>
              <Text style={[styles.amount, styles.pos, mode === 'deleted' && styles.amountDeleted]}>
                {`+${formatVndCompact(income)}`}
              </Text>
              <Text style={[styles.suffix, styles.pos, mode === 'deleted' && styles.amountDeleted]}>/VND</Text>
            </View>
          ) : null}
          {income > 0 && spend > 0 ? <Text style={styles.amountDivider}>|</Text> : null}
          {spend > 0 ? (
            <View style={styles.amountRow}>
              <Text style={[styles.amount, styles.spend, mode === 'deleted' && styles.amountDeleted]}>
                {`-${formatVndCompact(spend)}`}
              </Text>
              <Text style={[styles.suffix, styles.spend, mode === 'deleted' && styles.amountDeleted]}>/VND</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.details}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Thời gian"
            onPress={() => editing && sharedDate && setShowDate(true)}
            style={[styles.detailRow, styles.detailLast]}
          >
            <View style={styles.detailLabel}>
              <Feather name="clock" size={15} color={tokens.ink3} />
              <Text style={styles.detailLabelText}>Thời gian</Text>
            </View>
            <Text style={styles.detailValue}>
              {sharedDate ? formatDateTimeValue(sharedDate, at) : 'Nhiều ngày'}
            </Text>
          </Pressable>
        </View>

        {showDate && sharedDate ? (
          <DateTimePicker
            value={new Date(`${sharedDate}T12:00:00+07:00`)}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onDateChange}
          />
        ) : null}

        <View style={styles.list}>
          {live.map((row, index) => (
            <Line
              key={entries[index].id}
              draft={row}
              editing={editing}
              deleted={mode === 'deleted' || entries[index].status === 'deleted'}
              amountText={amountTexts[index] ?? String(row.amount)}
              onChangeAmount={(text) => {
                setAmountTexts((prev) => prev.map((value, i) => (i === index ? text : value)));
              }}
              onPressCategory={() => openCategories(index)}
            />
          ))}
        </View>

        <View style={styles.hint}>
          <Feather
            name={mode === 'deleted' ? 'slash' : mode === 'saved' ? 'check-circle' : 'info'}
            size={14}
            color={mode === 'deleted' ? tokens.neg : mode === 'saved' ? tokens.pos : tokens.ink3}
          />
          <Text
            style={[
              styles.hintText,
              mode === 'saved' && styles.hintSaved,
              mode === 'deleted' && styles.hintDeleted,
            ]}
          >
            {mode === 'deleted'
              ? undoSecs > 0
                ? `Hoàn tác trong ${undoSecs}s, sau đó đoạn chat sẽ bị xoá.`
                : 'Hoàn tác trước khi đoạn chat bị xoá.'
              : mode === 'saved'
                ? `Đã ghi ${live.length} khoản vào ${formatTargetDate(sharedDate ?? live[0].date)}.`
                : `Mình tách ${live.length} khoản từ một câu. Kiểm tra rồi xác nhận nhé.`}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        {editing ? (
          <>
            <ScaleButton ghost label="Huỷ" icon="x" flex={1} onPress={cancelEdit} />
            <ScaleButton label="Lưu thay đổi" icon="check" flex={1.5} onPress={saveEdit} />
          </>
        ) : mode === 'deleted' ? (
          <ScaleButton
            label={undoSecs > 0 ? `Hoàn tác ${undoSecs}s` : 'Hoàn tác'}
            icon="rotate-ccw"
            flex={1}
            onPress={() => onUndo?.()}
          />
        ) : mode === 'saved' ? (
          <ScaleButton ghost label="Chỉnh sửa" icon="edit-2" flex={1} onPress={startEdit} />
        ) : (
          <>
            <ScaleButton ghost label="Chỉnh sửa" icon="edit-2" flex={1} onPress={startEdit} />
            <ScaleButton
              label={`Xác nhận ${auto.seconds}s`}
              icon="check"
              flex={1.5}
              progress={auto.progress}
              onPress={auto.confirm}
            />
          </>
        )}
      </View>

      <Modal transparent visible={showCats} animationType="fade" onRequestClose={() => setShowCats(false)}>
        <View style={styles.sheetScrim}>
          <Pressable accessibilityLabel="Đóng danh mục" onPress={() => setShowCats(false)} style={styles.sheetBackdrop} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Chọn danh mục</Text>
            <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
              {categories.map((item) => {
                const selected = item.name === rows[catIndex]?.category;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={item.name}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      patchRow(catIndex, { category: item.name });
                      setShowCats(false);
                    }}
                    style={[styles.sheetRow, selected && styles.sheetRowOn]}
                  >
                    <CategoryGlyph icon={item.icon} size={28} />
                    <Text style={styles.sheetLabel}>{item.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <MirrorGlaze />
    </Animated.View>
  );
}

function Line({
  draft,
  editing,
  deleted,
  amountText,
  onChangeAmount,
  onPressCategory,
}: {
  draft: Draft;
  editing: boolean;
  deleted: boolean;
  amountText: string;
  onChangeAmount: (text: string) => void;
  onPressCategory: () => void;
}) {
  const { tokens } = useTheme();
  const { iconFor } = useCategories();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const income = draft.direction === 'thu';
  const amount = `${income ? '+' : '-'}${formatVndCompact(draft.amount)}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={draft.note || draft.category}
      onPress={onPressCategory}
      style={styles.line}
    >
      <View style={styles.lineIcon}>
        <CategoryGlyph icon={iconFor(draft.category, draft.note)} size={26} />
      </View>
      <View style={styles.lineBody}>
        <Text style={styles.lineNote} numberOfLines={1}>
          {draft.note || draft.category}
        </Text>
        <Text style={styles.lineCat}>{draft.category}</Text>
      </View>
      {editing ? (
        <TextInput
          keyboardType="number-pad"
          value={amountText}
          onChangeText={onChangeAmount}
          style={[styles.lineAmount, income ? styles.pos : styles.spend, styles.lineInput]}
        />
      ) : draft.revision ? (
        <View style={styles.linePrices}>
          <Text
            style={[
              styles.lineAmount,
              income ? styles.pos : styles.spend,
              deleted && styles.amountDeleted,
            ]}
          >
            {amount}
          </Text>
          <Text style={[styles.lineWas, deleted && styles.amountDeleted]}>
            {`${income ? '+' : '-'}${formatVndCompact(draft.revision.previousAmount)}`}
          </Text>
        </View>
      ) : (
        <Text
          style={[
            styles.lineAmount,
            income ? styles.pos : styles.spend,
            deleted && styles.amountDeleted,
          ]}
        >
          {amount}
        </Text>
      )}
    </Pressable>
  );
}

function bundleMode(entries: BundleEntry[]): 'pending' | 'saved' | 'deleted' {
  if (entries.every((entry) => entry.status === 'deleted')) return 'deleted';
  if (entries.every((entry) => entry.status !== 'pending')) return 'saved';
  return 'pending';
}

function sumBy(rows: Draft[], direction: Draft['direction']) {
  return rows.reduce((sum, row) => (row.direction === direction ? sum + row.amount : sum), 0);
}

function useCountdown(until?: number) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!until) return;
    const tick = () => {
      setLeft(Math.max(0, until - Date.now()));
    };
    const start = setTimeout(tick, 0);
    const id = setInterval(tick, 200);
    return () => {
      clearTimeout(start);
      clearInterval(id);
    };
  }, [until]);
  return until ? left : 0;
}

function ScaleButton({
  label,
  icon,
  onPress,
  ghost,
  flex,
  progress,
}: {
  label: string;
  icon: ComponentProps<typeof Feather>['name'];
  onPress: () => void;
  ghost?: boolean;
  flex: number;
  progress?: number;
}) {
  const { tokens, reduceMotion } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[{ flex }, anim]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        onPressIn={() => {
          scale.value = withTiming(0.975, { duration: reduceMotion ? 0 : 80 });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, { duration: reduceMotion ? 0 : 80 });
        }}
        style={[styles.btn, ghost ? styles.btnGhost : styles.btnAccent]}
      >
        {typeof progress === 'number' ? (
          <View pointerEvents="none" style={[styles.countdownFill, { width: `${Math.round(progress * 100)}%` }]} />
        ) : null}
        <Feather name={icon} size={16} color={ghost ? tokens.ink2 : tokens.accentInk} />
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          style={[styles.btnText, ghost ? styles.btnGhostText : styles.btnAccentText]}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    card: {
      alignSelf: 'flex-start',
      width: '88%',
      maxWidth: 360,
      marginVertical: 8,
      paddingTop: 14,
      paddingHorizontal: 14,
      paddingBottom: 12,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.line,
      borderRadius: 22,
      overflow: 'hidden',
    },
    deletedMute: {
      opacity: 0.5,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    tile: {
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
    },
    titleBlock: {
      flex: 1,
    },
    title: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14.5,
      letterSpacing: -0.1,
      color: t.ink,
    },
    subtitle: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11.5,
      color: t.ink3,
    },
    headEnd: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    tag: {
      paddingVertical: 4,
      paddingHorizontal: 9,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: t.line,
    },
    tagText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: t.ink2,
    },
    tagSavedText: {
      color: t.pos,
    },
    tagDeletedText: {
      color: t.neg,
    },
    totals: {
      marginTop: 12,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-end',
      columnGap: 10,
      rowGap: 2,
    },
    amountDivider: {
      fontFamily: 'Inter_400Regular',
      fontSize: 22,
      lineHeight: 42,
      color: t.ink3,
    },
    amountRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
    },
    amount: {
      fontFamily: 'Lora_500Medium',
      fontSize: 34,
      letterSpacing: -0.8,
      lineHeight: 42,
      color: t.ink,
    },
    amountDeleted: {
      color: t.ink3,
      textDecorationLine: 'line-through',
    },
    suffix: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      color: t.ink3,
      marginBottom: 7,
      marginLeft: 2,
    },
    pos: {
      color: t.pos,
    },
    spend: {
      color: t.accent,
    },
    details: {
      marginTop: 12,
      borderTopWidth: 1,
      borderTopColor: t.line2,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 9,
      borderBottomWidth: 1,
      borderBottomColor: t.line2,
    },
    detailLast: {
      borderBottomWidth: 0,
    },
    detailLabel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    detailLabelText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13.5,
      color: t.ink3,
    },
    detailValue: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13.5,
      color: t.ink,
    },
    list: {
      marginTop: 4,
      borderTopWidth: 1,
      borderTopColor: t.line2,
    },
    line: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: t.line2,
    },
    lineIcon: {
      width: 26,
      height: 26,
      alignItems: 'center',
      justifyContent: 'center',
    },
    lineBody: {
      flex: 1,
    },
    lineNote: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13.5,
      color: t.ink,
    },
    lineCat: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11.5,
      color: t.ink3,
    },
    lineAmount: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13.5,
      color: t.ink,
    },
    linePrices: {
      alignItems: 'flex-end',
    },
    lineWas: {
      marginTop: 1,
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: t.ink3,
      textDecorationLine: 'line-through',
    },
    lineInput: {
      minWidth: 72,
      padding: 0,
      textAlign: 'right',
    },
    hint: {
      marginTop: 11,
      flexDirection: 'row',
      gap: 7,
      alignItems: 'flex-start',
    },
    hintText: {
      flex: 1,
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      lineHeight: 17,
      color: t.ink3,
    },
    hintSaved: {
      color: t.ink2,
    },
    hintDeleted: {
      color: t.ink3,
    },
    deleteBtn: {
      width: 28,
      height: 28,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actions: {
      marginTop: 14,
      flexDirection: 'row',
      gap: 9,
    },
    btn: {
      height: 45,
      borderRadius: 13,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      overflow: 'hidden',
    },
    countdownFill: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      backgroundColor: 'rgba(255,255,255,0.28)',
    },
    btnGhost: {
      borderWidth: 1,
      borderColor: t.line,
      backgroundColor: 'transparent',
    },
    btnAccent: {
      backgroundColor: t.accent,
    },
    btnText: {
      fontSize: 14.5,
    },
    btnGhostText: {
      fontFamily: 'Inter_400Regular',
      color: t.ink2,
    },
    btnAccentText: {
      fontFamily: 'Inter_600SemiBold',
      color: t.accentInk,
    },
    sheetScrim: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    sheetBackdrop: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: 'rgba(10,9,7,0.34)',
    },
    sheet: {
      backgroundColor: t.surface,
      paddingBottom: 24,
      paddingTop: 8,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      maxHeight: '78%',
    },
    sheetTitle: {
      paddingHorizontal: 18,
      paddingTop: 8,
      paddingBottom: 4,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 16,
      color: t.ink,
    },
    sheetScroll: { flexGrow: 0 },
    sheetRowOn: { backgroundColor: t.surface2 },
    sheetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 18,
      paddingVertical: 14,
    },
    sheetLabel: {
      fontFamily: 'Inter_500Medium',
      fontSize: 15,
      color: t.ink,
    },
  });
}
