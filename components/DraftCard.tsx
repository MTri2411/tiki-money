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

import {
    formatDateTimeValue,
    formatTargetDate,
    localDateIso,
    type Category,
    type Draft,
} from '@/lib/db';
import { formatVndCompact, parseVndInput } from '@/lib/money';
import { useTheme } from '@/theme/ThemeProvider';
import type { ThemeTokens } from '@/theme/tokens';

import { CategoryGlyph } from '@/components/CategoryGlyph';
import { useCategories } from '@/components/CategoryProvider';
import { MirrorGlaze } from '@/components/MirrorGlaze';
import { useAutoConfirm } from '@/components/useAutoConfirm';

type Props = {
  draft: Draft;
  at: number;
  saved?: boolean;
  deleted?: boolean;
  onConfirm?: () => void;
  onSaveEdit?: (next: Draft) => void;
  onDelete?: () => void;
  onUndo?: () => void;
  undoUntil?: number;
  highlighted?: boolean;
  tag?: string;
};

export function DraftCard({
  draft,
  at,
  saved = false,
  deleted = false,
  onConfirm,
  onSaveEdit,
  onDelete,
  onUndo,
  undoUntil,
  highlighted = false,
  tag,
}: Props) {
  const { tokens, reduceMotion } = useTheme();
  const { categories, iconFor } = useCategories();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [editing, setEditing] = useState(false);
  const [amountText, setAmountText] = useState(String(draft.amount));
  const [category, setCategory] = useState<Category>(draft.category);
  const [date, setDate] = useState(draft.date);
  const [note, setNote] = useState(draft.note);
  const [showDate, setShowDate] = useState(false);
  const [showCats, setShowCats] = useState(false);
  const snapshot = useRef(draft);
  const undoLeft = useCountdown(deleted ? undoUntil : undefined);
  const undoSecs = Math.max(0, Math.ceil(undoLeft / 1000));

  const income = (editing ? draft.direction : draft.direction) === 'thu';
  const liveAmount = editing ? parseVndInput(amountText) : draft.amount;
  const liveCategory = editing ? category : draft.category;
  const liveDate = editing ? date : draft.date;
  const liveNote = editing ? note : draft.note;
  const low = draft.confidence < 0.6;
  const awaiting = !editing && !saved && !deleted;
  const auto = useAutoConfirm(awaiting, () => onConfirm?.());
  const displayAmount = `${income ? '+' : '-'}${formatVndCompact(liveAmount)}`;
  const moneyTone = deleted ? styles.amountDeleted : income ? styles.pos : styles.spend;

  const openCategories = () => {
    if (!editing) return;
    setShowCats(true);
  };

  const startEdit = () => {
    snapshot.current = draft;
    setAmountText(String(draft.amount));
    setCategory(draft.category);
    setDate(draft.date);
    setNote(draft.note);
    setEditing(true);
  };

  const cancelEdit = () => {
    const prev = snapshot.current;
    setAmountText(String(prev.amount));
    setCategory(prev.category);
    setDate(prev.date);
    setNote(prev.note);
    setEditing(false);
    setShowDate(false);
    setShowCats(false);
  };

  const saveEdit = () => {
    const amount = parseVndInput(amountText);
    onSaveEdit?.({
      ...draft,
      amount: amount > 0 ? amount : draft.amount,
      category,
      date,
      note,
    });
    setEditing(false);
    setShowDate(false);
  };

  const onDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowDate(false);
    if (event.type === 'dismissed' || !selected) return;
    setDate(localDateIso(selected));
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(reduceMotion ? 0 : 420)}
      exiting={FadeOut.duration(reduceMotion ? 0 : 280)}
      layout={LinearTransition.duration(reduceMotion ? 0 : 280)}
      style={[styles.card, highlighted && styles.cardLinked]}
    >
      <View style={deleted ? styles.deletedMute : undefined}>
      <View style={styles.head}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chọn hạng mục"
          onPress={openCategories}
          style={styles.tile}
        >
          <CategoryGlyph icon={iconFor(liveCategory, liveNote)} size={30} />
        </Pressable>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{liveCategory}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {liveNote}
          </Text>
        </View>
        <View style={styles.headEnd}>
          <View style={styles.tag}>
            <Text
              style={[
                styles.tagText,
                saved && styles.tagSavedText,
                deleted && styles.tagDeletedText,
              ]}
            >
              {tag
                ? tag
                : deleted
                  ? 'Đã xoá'
                  : saved
                    ? 'Đã lưu'
                    : low
                      ? 'Cần kiểm tra'
                      : 'Chờ xác nhận'}
            </Text>
          </View>
          {saved && onDelete && !editing && !deleted ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Xoá khoản này"
              hitSlop={6}
              onPress={onDelete}
              style={styles.deleteBtn}
            >
              <Feather name="x" size={15} color={tokens.neg} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {editing ? (
        <View style={styles.amountEdit}>
          <Text style={[styles.amount, income ? styles.pos : styles.spend]}>{income ? '+' : '-'}</Text>
          <TextInput
            autoFocus
            keyboardType="number-pad"
            selectTextOnFocus
            value={amountText}
            onChangeText={setAmountText}
            style={[styles.amount, styles.amountInput, income ? styles.pos : styles.spend]}
          />
          <Text style={[styles.suffix, income ? styles.pos : styles.spend]}>/VND</Text>
        </View>
      ) : draft.revision ? (
        <View style={styles.amountRow}>
          <Text style={[styles.amount, moneyTone]}>{displayAmount}</Text>
          <Text style={[styles.suffix, moneyTone]}>/VND</Text>
          <Text style={styles.saleWas}>
            {`${income ? '+' : '-'}${formatVndCompact(draft.revision.previousAmount)}`}
          </Text>
        </View>
      ) : (
        <View style={styles.amountRow}>
          <Text style={[styles.amount, moneyTone]}>{displayAmount}</Text>
          <Text style={[styles.suffix, moneyTone]}>/VND</Text>
        </View>
      )}

      <View style={styles.details}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Thời gian"
          onPress={() => editing && setShowDate(true)}
          style={[styles.detailRow, styles.detailLast]}
        >
          <View style={styles.detailLabel}>
            <Feather name="clock" size={15} color={tokens.ink3} />
            <Text style={styles.detailLabelText}>Thời gian</Text>
          </View>
          <Text style={styles.detailValue}>{formatDateTimeValue(liveDate, at)}</Text>
        </Pressable>
      </View>

      {showDate ? (
        <DateTimePicker
          value={new Date(`${liveDate}T12:00:00+07:00`)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onDateChange}
        />
      ) : null}

      <View style={styles.hint}>
        <Feather
          name={deleted ? 'slash' : saved ? 'check-circle' : 'info'}
          size={14}
          color={deleted ? tokens.neg : saved ? tokens.pos : tokens.ink3}
        />
        <Text style={[styles.hintText, saved && styles.hintSaved, deleted && styles.hintDeleted]}>
          {deleted
            ? undoSecs > 0
              ? `Hoàn tác trong ${undoSecs}s, sau đó đoạn chat sẽ bị xoá.`
              : 'Hoàn tác trước khi đoạn chat bị xoá.'
            : saved
              ? `Đã ghi vào ${formatTargetDate(liveDate)}.`
              : `Khoản này chưa được lưu. Xác nhận để ghi vào ${formatTargetDate(liveDate)}.`}
        </Text>
      </View>
      </View>

      <View style={styles.actions}>
        {editing ? (
          <>
            <ScaleButton
              ghost
              label="Huỷ"
              icon="x"
              flex={1}
              onPress={cancelEdit}
            />
            <ScaleButton
              label="Lưu thay đổi"
              icon="check"
              flex={1.5}
              onPress={saveEdit}
            />
          </>
        ) : deleted ? (
          <ScaleButton
            label={undoSecs > 0 ? `Hoàn tác ${undoSecs}s` : 'Hoàn tác'}
            icon="rotate-ccw"
            flex={1}
            onPress={() => onUndo?.()}
          />
        ) : saved ? (
          <ScaleButton
            ghost
            label="Chỉnh sửa"
            icon="edit-2"
            flex={1}
            onPress={startEdit}
          />
        ) : (
          <>
            <ScaleButton
              ghost
              label="Chỉnh sửa"
              icon="edit-2"
              flex={1}
              onPress={startEdit}
            />
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
                const selected = item.name === liveCategory;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={item.name}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setCategory(item.name);
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
    cardLinked: {
      borderColor: t.accent,
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
    amountDeleted: {
      color: t.ink3,
      textDecorationLine: 'line-through',
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
    hintSaved: {
      color: t.ink2,
    },
    amountRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginTop: 13,
    },
    saleWas: {
      marginLeft: 8,
      marginBottom: 6,
      fontFamily: 'Lora_500Medium',
      fontSize: 16,
      lineHeight: 22,
      color: t.ink3,
      textDecorationLine: 'line-through',
    },
    amountEdit: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginTop: 13,
      borderBottomWidth: 2,
      borderBottomColor: t.accent,
      paddingBottom: 3,
      width: 150,
    },
    amount: {
      fontFamily: 'Lora_500Medium',
      fontSize: 34,
      letterSpacing: -0.8,
      lineHeight: 42,
      color: t.ink,
    },
    amountInput: {
      width: 120,
      padding: 0,
      margin: 0,
    },
    pos: {
      color: t.pos,
    },
    spend: {
      color: t.accent,
    },
    suffix: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      color: t.ink3,
      marginBottom: 7,
      marginLeft: 2,
    },
    details: {
      marginTop: 14,
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
