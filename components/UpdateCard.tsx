import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import { CategoryGlyph } from '@/components/CategoryGlyph';
import { useCategories } from '@/components/CategoryProvider';
import { formatTargetDate, type Draft } from '@/lib/db';
import { formatVndCompact, parseVndInput } from '@/lib/money';
import { useTheme } from '@/theme/ThemeProvider';
import type { ThemeTokens } from '@/theme/tokens';

type Props = {
  draft: Draft;
  saved?: boolean;
  deleted?: boolean;
  highlighted?: boolean;
  onConfirm?: () => void;
  onSaveEdit?: (next: Draft) => void;
  onDelete?: () => void;
  onUndo?: () => void;
  undoUntil?: number;
  onOpenSource?: () => void;
};

export function UpdateCard({
  draft,
  saved = false,
  deleted = false,
  highlighted = false,
  onConfirm,
  onSaveEdit,
  onDelete,
  onUndo,
  undoUntil,
  onOpenSource,
}: Props) {
  const { tokens, reduceMotion } = useTheme();
  const { iconFor } = useCategories();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [editing, setEditing] = useState(false);
  const [amountText, setAmountText] = useState(String(draft.amount));
  const undoLeft = useCountdown(deleted ? undoUntil : undefined);
  const undoSecs = Math.max(0, Math.ceil(undoLeft / 1000));
  const revision = draft.revision;
  const income = draft.direction === 'thu';
  const liveAmount = editing ? parseVndInput(amountText) : draft.amount;
  const sign = income ? '+' : '-';
  const was = revision ? `${sign}${formatVndCompact(revision.previousAmount)}` : '';
  const sourceName = revision?.previousNote.trim() || revision?.previousCategory || draft.note || draft.category;

  const saveEdit = () => {
    const amount = parseVndInput(amountText);
    onSaveEdit?.({
      ...draft,
      amount: amount > 0 ? amount : draft.amount,
    });
    setEditing(false);
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(reduceMotion ? 0 : 420)}
      exiting={FadeOut.duration(reduceMotion ? 0 : 280)}
      layout={LinearTransition.duration(reduceMotion ? 0 : 280)}
      style={[styles.card, highlighted && styles.cardLinked, deleted && styles.deleted]}
    >
      {revision ? (
        <Pressable
          accessibilityRole={onOpenSource ? 'button' : 'text'}
          accessibilityLabel="Khoản gốc"
          disabled={!onOpenSource}
          onPress={onOpenSource}
          style={styles.quote}
        >
          <Text style={styles.quoteTitle} numberOfLines={1}>
            {sourceName}
          </Text>
          <Text style={styles.quoteMeta} numberOfLines={1}>
            {`${formatTargetDate(revision.previousDate)} · ${formatVndCompact(revision.previousAmount)}`}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.row}>
        <CategoryGlyph icon={iconFor(draft.category, draft.note)} size={22} />
        <View style={styles.copy}>
          <Text style={styles.note} numberOfLines={1}>
            {draft.note || draft.category}
          </Text>
          <Text style={styles.cat} numberOfLines={1}>
            {draft.category}
          </Text>
        </View>
        <View style={styles.prices}>
          {editing ? (
            <TextInput
              autoFocus
              keyboardType="number-pad"
              selectTextOnFocus
              value={amountText}
              onChangeText={setAmountText}
              style={styles.amountInput}
            />
          ) : (
            <Text style={[styles.amount, income ? styles.pos : styles.spend]}>
              {`${sign}${formatVndCompact(liveAmount)}`}
            </Text>
          )}
          {was ? <Text style={styles.was}>{was}</Text> : null}
        </View>
      </View>

      <View style={styles.actions}>
        {editing ? (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel="Huỷ" onPress={() => setEditing(false)}>
              <Text style={styles.quiet}>Huỷ</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Lưu thay đổi" onPress={saveEdit}>
              <Text style={styles.action}>Xong</Text>
            </Pressable>
          </>
        ) : deleted ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Hoàn tác" onPress={() => onUndo?.()}>
            <Text style={styles.action}>{undoSecs > 0 ? `Hoàn tác ${undoSecs}s` : 'Hoàn tác'}</Text>
          </Pressable>
        ) : (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel="Sửa số tiền" onPress={() => setEditing(true)}>
              <Text style={styles.quiet}>Sửa số</Text>
            </Pressable>
            {saved ? (
              <Text style={styles.done}>Đã cập nhật</Text>
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel="Cập nhật" onPress={() => onConfirm?.()}>
                <Text style={styles.action}>Cập nhật</Text>
              </Pressable>
            )}
            {saved && onDelete ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Xoá khoản này" hitSlop={6} onPress={onDelete}>
                <Feather name="x" size={14} color={tokens.neg} />
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    </Animated.View>
  );
}

function useCountdown(until?: number) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!until) return;
    const tick = () => setLeft(Math.max(0, until - Date.now()));
    const start = setTimeout(tick, 0);
    const id = setInterval(tick, 200);
    return () => {
      clearTimeout(start);
      clearInterval(id);
    };
  }, [until]);
  return until ? left : 0;
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    card: {
      alignSelf: 'flex-start',
      width: '78%',
      maxWidth: 320,
      marginVertical: 6,
      paddingTop: 8,
      paddingRight: 12,
      paddingBottom: 8,
      paddingLeft: 10,
      backgroundColor: t.accentSoft,
      borderLeftWidth: 3,
      borderLeftColor: t.accent,
      borderRadius: 14,
    },
    cardLinked: {
      borderTopWidth: 1,
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderColor: t.accent,
    },
    deleted: {
      opacity: 0.5,
    },
    quote: {
      marginBottom: 8,
    },
    quoteTitle: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12.5,
      color: t.ink,
    },
    quoteMeta: {
      marginTop: 1,
      fontFamily: 'Inter_400Regular',
      fontSize: 11.5,
      color: t.ink3,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    copy: {
      flex: 1,
    },
    note: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13.5,
      color: t.ink,
    },
    cat: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11.5,
      color: t.ink3,
    },
    prices: {
      alignItems: 'flex-end',
    },
    amount: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 15,
    },
    amountInput: {
      minWidth: 64,
      padding: 0,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 15,
      color: t.ink,
      textAlign: 'right',
    },
    was: {
      marginTop: 1,
      fontFamily: 'Inter_400Regular',
      fontSize: 11.5,
      color: t.ink3,
      textDecorationLine: 'line-through',
    },
    spend: {
      color: t.neg,
    },
    pos: {
      color: t.pos,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 14,
      marginTop: 8,
    },
    action: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: t.accent,
    },
    quiet: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      color: t.ink2,
    },
    done: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      color: t.pos,
    },
  });
}
