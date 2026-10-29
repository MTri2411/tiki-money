/* eslint-disable react-hooks/immutability */
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Children, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { formatMessageStamp, type VoicePayload } from '@/lib/db';
import { isVoicePlaceholder } from '@/lib/voice';
import { useTheme } from '@/theme/ThemeProvider';
import type { ThemeTokens } from '@/theme/tokens';

import { VoiceNote } from '@/components/VoiceNote';

const MONEY_RE = /(\+?\d[\d.]*(?:\s?(?:k|tr|đ|nghìn|ngàn|triệu))?)/gi;

export function DayMarker({ label, lead = false }: { label: string; lead?: boolean }) {
  const { tokens, reduceMotion } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  return (
    <Animated.View
      layout={LinearTransition.duration(reduceMotion ? 0 : 280)}
      style={[styles.cut, lead && styles.cutLead]}
    >
      <View style={styles.cutLine} />
      <Text style={styles.cutLabel}>{label}</Text>
      <View style={styles.cutLine} />
    </Animated.View>
  );
}

type UserBubbleProps = {
  text: string;
  at: number;
  voice?: VoicePayload | null;
  active?: boolean;
  busy?: boolean;
  onToggle?: () => void;
  onRetry?: () => void;
  onEdit?: (text: string) => void;
  onDeleteRequest?: () => void;
};

function usePressScale() {
  const { reduceMotion } = useTheme();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return {
    style,
    pressIn: () => {
      scale.value = withTiming(0.96, { duration: reduceMotion ? 0 : 110 });
    },
    pressOut: () => {
      scale.value = withTiming(1, { duration: reduceMotion ? 0 : 180 });
    },
    longPress: () => {
      scale.value = withSequence(
        withTiming(0.92, { duration: reduceMotion ? 0 : 70 }),
        withTiming(1, { duration: reduceMotion ? 0 : 220 })
      );
    },
  };
}

export function UserBubble({
  text,
  at,
  voice,
  active = false,
  busy = false,
  onToggle,
  onRetry,
  onEdit,
  onDeleteRequest,
}: UserBubbleProps) {
  const { tokens, reduceMotion } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const press = usePressScale();
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [copied, setCopied] = useState(false);
  const [seenText, setSeenText] = useState(text);

  if (text !== seenText) {
    setSeenText(text);
    setDraft(text);
    setEditing(false);
  }

  const showActions = (active || hovered) && !editing;
  const canSendEdit = draft.trim().length > 0 && draft.trim() !== text;
  const caption = voice && !isVoicePlaceholder(text) ? text : null;
  const copyText = caption || text;

  if (!showActions && copied) {
    setCopied(false);
  }

  const copy = async () => {
    if (voice) return;
    await Clipboard.setStringAsync(copyText);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
  };

  const startEdit = () => {
    if (busy || voice) return;
    setDraft(text);
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft(text);
    setEditing(false);
  };

  const submitEdit = () => {
    const next = draft.trim();
    if (!next || busy) return;
    if (next === text) {
      setEditing(false);
      return;
    }
    setEditing(false);
    onEdit?.(next);
  };

  return (
    <Animated.View
      collapsable={false}
      layout={LinearTransition.duration(reduceMotion ? 0 : 280)}
      style={[styles.userCol, (showActions || editing) && styles.userColActive]}
    >
      <Pressable
        accessible={false}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={styles.userHit}
      >
        {editing ? (
          <View style={styles.userWrap}>
            <TextInput
              autoFocus
              multiline
              value={draft}
              onChangeText={setDraft}
              editable={!busy}
              style={styles.userInput}
              placeholder="Sửa tin nhắn"
              placeholderTextColor={tokens.ink3}
            />
          </View>
        ) : (
          <Animated.View style={[styles.userWrap, press.style]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tin nhắn của bạn"
              accessibilityHint={
                voice
                  ? 'Nhấn để thử lại. Nhấn giữ để xoá đoạn chat.'
                  : 'Nhấn để thử lại, sửa hoặc sao chép. Nhấn giữ để xoá đoạn chat.'
              }
              delayLongPress={400}
              onPressIn={press.pressIn}
              onPressOut={press.pressOut}
              onPress={() => {
                void Haptics.selectionAsync();
                onToggle?.();
              }}
              onLongPress={() => {
                press.longPress();
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onDeleteRequest?.();
              }}
              style={({ pressed }) => [styles.userHitFill, pressed && styles.userWrapPressed]}
            >
              {voice ? (
                <View style={styles.voiceBlock}>
                  <VoiceNote uri={voice.uri} durationSec={voice.durationSec} />
                  {caption ? <Text style={styles.userCaption}>{caption}</Text> : null}
                </View>
              ) : (
                <Text style={styles.user}>{text}</Text>
              )}
            </Pressable>
          </Animated.View>
        )}

        {editing ? (
          <Tooltip>
            <TooltipBtn icon="x" label="Huỷ" onPress={cancelEdit} />
            <TooltipBtn
              icon="check"
              label="Gửi lại"
              disabled={busy || !canSendEdit}
              onPress={submitEdit}
            />
          </Tooltip>
        ) : showActions ? (
          <Tooltip>
            <TooltipBtn
              icon="rotate-ccw"
              label="Thử lại"
              disabled={busy}
              onPress={() => {
                if (busy) return;
                onRetry?.();
              }}
            />
            <TooltipBtn icon="edit-2" label="Sửa" disabled={busy || Boolean(voice)} onPress={startEdit} />
            <TooltipBtn
              icon={copied ? 'check' : 'copy'}
              label={copied ? 'Đã chép' : 'Sao chép'}
              disabled={Boolean(voice)}
              onPress={() => void copy()}
            />
          </Tooltip>
        ) : null}
      </Pressable>
      <Text style={styles.userStamp}>{formatMessageStamp(at)}</Text>
    </Animated.View>
  );
}

export function AssistantMessage({
  text,
  at,
  onDeleteRequest,
  onDismiss,
}: {
  text: string;
  at: number;
  onDeleteRequest?: () => void;
  onDismiss?: () => void;
}) {
  const { tokens, reduceMotion } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const press = usePressScale();
  return (
    <Animated.View
      layout={LinearTransition.duration(reduceMotion ? 0 : 280)}
      style={[styles.assistantCol, press.style]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Câu trả lời"
        accessibilityHint="Nhấn giữ để xoá đoạn chat"
        delayLongPress={400}
        onPressIn={press.pressIn}
        onPressOut={press.pressOut}
        onLongPress={() => {
          press.longPress();
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onDeleteRequest?.();
        }}
      >
        <Text style={styles.assistant}>{highlightMoney(text, styles.money)}</Text>
      </Pressable>
      {onDismiss ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Bỏ qua" onPress={onDismiss}>
          <Text style={styles.assistantStamp}>Bỏ qua</Text>
        </Pressable>
      ) : null}
      <Text style={styles.assistantStamp}>{formatMessageStamp(at)}</Text>
    </Animated.View>
  );
}

export function DeleteTurnDialog({
  visible,
  title = 'Xoá đoạn chat?',
  body = 'Tin nhắn, câu trả lời và các khoản đã lưu trong đoạn này sẽ bị xoá. Thu chi sẽ được tính lại.',
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title?: string;
  body?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.dialogScrim}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đóng"
          onPress={onCancel}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{title}</Text>
          <Text style={styles.dialogBody}>{body}</Text>
          <View style={styles.dialogActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Không"
              onPress={onCancel}
              style={({ pressed }) => [styles.dialogBtn, styles.dialogBtnGhost, pressed && styles.dialogBtnGhostPressed]}
            >
              <Text style={styles.dialogBtnGhostText}>Không</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Có, xoá"
              onPress={onConfirm}
              style={({ pressed }) => [styles.dialogBtn, styles.dialogBtnDanger, pressed && styles.dialogBtnDangerPressed]}
            >
              <Text style={styles.dialogBtnDangerText}>Có</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function ClearedChat() {
  const { tokens, reduceMotion } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  return (
    <Animated.View
      layout={LinearTransition.duration(reduceMotion ? 0 : 280)}
      style={styles.clearedWrap}
    >
      <Text style={styles.cleared}>Đã xoá đoạn chat</Text>
    </Animated.View>
  );
}

function Tooltip({ children }: { children: ReactNode }) {
  const { tokens, reduceMotion } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const items = Children.toArray(children);
  return (
    <Animated.View
      pointerEvents="box-none"
      entering={reduceMotion ? undefined : FadeIn.duration(140)}
      exiting={reduceMotion ? undefined : FadeOut.duration(100)}
      style={styles.tooltipAnchor}
    >
      <View style={styles.tooltip}>
        {items.map((child, index) => (
          <View key={index} style={styles.tooltipItem}>
            {index > 0 ? <View style={styles.tooltipDivider} /> : null}
            {child}
          </View>
        ))}
      </View>
      <View style={styles.tooltipCaret} />
    </Animated.View>
  );
}

function TooltipBtn({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: ComponentProps<typeof Feather>['name'];
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const color = disabled ? tokens.islandDim : tokens.islandInk;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tooltipBtn,
        pressed && !disabled && styles.tooltipBtnPressed,
        disabled && styles.tooltipBtnDisabled,
      ]}
    >
      <Feather name={icon} size={13} color={color} />
      <Text style={[styles.tooltipLabel, disabled && styles.tooltipLabelDisabled]}>{label}</Text>
    </Pressable>
  );
}

function highlightMoney(text: string, moneyStyle: { color: string; fontFamily: string; fontSize: number }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(MONEY_RE.source, MONEY_RE.flags);
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    nodes.push(
      <Text key={match.index} style={moneyStyle}>
        {match[0]}
      </Text>
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    cut: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 22,
      marginBottom: 14,
      paddingHorizontal: 2,
    },
    cutLead: {
      marginTop: 8,
    },
    cutLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.line,
    },
    cutLabel: {
      fontFamily: 'Inter_500Medium',
      fontSize: 12,
      color: t.ink3,
    },
    assistantCol: {
      alignSelf: 'flex-start',
      maxWidth: 250,
      marginVertical: 12,
    },
    assistant: {
      fontFamily: 'Inter_400Regular',
      fontSize: 15,
      lineHeight: 23,
      color: t.ink,
    },
    assistantStamp: {
      marginTop: 6,
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      lineHeight: 14,
      color: t.ink3,
    },
    money: {
      color: t.accent,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 15,
    },
    userCol: {
      alignSelf: 'stretch',
      alignItems: 'flex-end',
      marginVertical: 12,
      zIndex: 1,
      overflow: 'visible',
    },
    userColActive: {
      zIndex: 20,
    },
    userHit: {
      alignItems: 'flex-end',
      maxWidth: '77%',
      position: 'relative',
      overflow: 'visible',
    },
    userWrap: {
      backgroundColor: t.surface2,
      borderTopLeftRadius: 19,
      borderTopRightRadius: 19,
      borderBottomLeftRadius: 19,
      borderBottomRightRadius: 7,
      overflow: 'hidden',
    },
    userHitFill: {
      paddingVertical: 10,
      paddingHorizontal: 14,
    },
    userWrapPressed: {
      backgroundColor: t.line2,
    },
    dialogScrim: {
      flex: 1,
      backgroundColor: 'rgba(10,9,7,0.4)',
      justifyContent: 'center',
      paddingHorizontal: 28,
    },
    dialog: {
      backgroundColor: t.surface,
      borderRadius: 22,
      paddingHorizontal: 20,
      paddingTop: 22,
      paddingBottom: 16,
      borderWidth: 1,
      borderColor: t.line,
    },
    dialogTitle: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 17,
      color: t.ink,
    },
    dialogBody: {
      marginTop: 8,
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      lineHeight: 21,
      color: t.ink2,
    },
    dialogActions: {
      marginTop: 18,
      flexDirection: 'row',
      gap: 8,
    },
    dialogBtn: {
      flex: 1,
      height: 44,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dialogBtnGhost: {
      borderWidth: 1,
      borderColor: t.line,
    },
    dialogBtnGhostPressed: {
      backgroundColor: t.surface2,
    },
    dialogBtnDanger: {
      backgroundColor: t.neg,
    },
    dialogBtnDangerPressed: {
      opacity: 0.88,
    },
    dialogBtnGhostText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 14.5,
      color: t.ink2,
    },
    dialogBtnDangerText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 14.5,
      color: '#FFFFFF',
    },
    voiceBlock: {
      minWidth: 176,
      gap: 8,
    },
    user: {
      fontFamily: 'Inter_400Regular',
      fontSize: 15,
      lineHeight: 22,
      color: t.ink,
    },
    userCaption: {
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      lineHeight: 20,
      color: t.ink,
    },
    userInput: {
      fontFamily: 'Inter_400Regular',
      fontSize: 15,
      lineHeight: 22,
      color: t.ink,
      padding: 0,
      margin: 0,
      minWidth: 120,
    },
    userStamp: {
      marginTop: 6,
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      lineHeight: 14,
      color: t.ink3,
    },
    tooltipAnchor: {
      position: 'absolute',
      right: 0,
      bottom: '100%',
      marginBottom: 8,
      alignItems: 'flex-end',
      zIndex: 30,
    },
    tooltip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.islandBg,
      borderRadius: 16,
      paddingHorizontal: 3,
      paddingVertical: 3,
      shadowColor: '#000',
      shadowOpacity: 0.22,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    tooltipItem: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    tooltipDivider: {
      width: StyleSheet.hairlineWidth,
      height: 14,
      backgroundColor: t.islandLine,
    },
    tooltipCaret: {
      width: 8,
      height: 8,
      marginTop: -4,
      marginRight: 18,
      backgroundColor: t.islandBg,
      transform: [{ rotate: '45deg' }],
    },
    tooltipBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingVertical: 7,
      paddingHorizontal: 10,
      borderRadius: 13,
    },
    tooltipBtnPressed: {
      backgroundColor: t.islandLine,
    },
    tooltipBtnDisabled: {
      opacity: 0.45,
    },
    tooltipLabel: {
      fontFamily: 'Inter_500Medium',
      fontSize: 12,
      color: t.islandInk,
    },
    tooltipLabelDisabled: {
      color: t.islandDim,
    },
    clearedWrap: {
      alignItems: 'center',
      marginVertical: 18,
    },
    cleared: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12.5,
      color: t.ink3,
    },
  });
}
