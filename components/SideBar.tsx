import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Account } from '@/lib/account';
import { formatVndCompact } from '@/lib/money';
import { useTheme } from '@/theme/ThemeProvider';
import type { ThemeTokens } from '@/theme/tokens';

export type ChatDayRow = {
  date: string;
  label: string;
  spend: number;
  income: number;
  count: number;
};

type Props = {
  open: boolean;
  days: ChatDayRow[];
  selectedDate: string;
  monthSpend: number;
  monthIncome: number;
  account: Account | null;
  onManageCategories: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onClose: () => void;
  onSelectDay: (date: string) => void;
  onDeleteDay: (day: ChatDayRow) => void;
  onResetData: () => void;
};

const MORPH = Easing.bezier(0.32, 1, 0.5, 1);

export function SideBar({
  open,
  days,
  selectedDate,
  monthSpend,
  monthIncome,
  account,
  onManageCategories,
  onSignIn,
  onSignOut,
  onClose,
  onSelectDay,
  onDeleteDay,
  onResetData,
}: Props) {
  const { tokens, cycleMode, scheme, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const panelW = Math.min(320, Math.round(width * 0.82));
  const x = useSharedValue(-panelW);
  const scrim = useSharedValue(0);

  useEffect(() => {
    const dur = reduceMotion ? 0 : 340;
    x.value = withTiming(open ? 0 : -panelW, { duration: dur, easing: MORPH });
    scrim.value = withTiming(open ? 1 : 0, { duration: dur });
  }, [open, panelW, reduceMotion, x, scrim]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));

  return (
    <View pointerEvents={open ? 'auto' : 'none'} style={styles.root}>
      <Animated.View style={[styles.scrim, scrimStyle]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đóng menu"
          onPress={onClose}
          style={styles.scrimHit}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.panel,
          { width: panelW, paddingTop: insets.top + 10, paddingBottom: insets.bottom + 12 },
          panelStyle,
        ]}
      >
        <View style={styles.panelHead}>
          <Text style={styles.brand}>TIKI MONEY</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đóng menu"
            hitSlop={8}
            onPress={onClose}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconPressed]}
          >
            <Feather name="x" size={20} color={tokens.ink2} />
          </Pressable>
        </View>

        <View style={styles.userCard}>
          <UserAvatar
            name={account?.name ?? 'Bạn'}
            picture={account?.picture ?? null}
            styles={styles}
          />
          <View style={styles.userCopy}>
            <Text style={styles.userName} numberOfLines={2}>
              {account?.name ?? 'Bạn'}
            </Text>
            <Text style={styles.userMeta} numberOfLines={1}>
              {account?.email ?? 'Dùng trên máy này'}
            </Text>
          </View>
        </View>
        <Text style={styles.monthLine}>
          Tháng này :{' '}
          <Text style={monthIncome > 0 ? styles.monthPos : styles.monthMuted}>
            +{formatVndCompact(monthIncome)}
          </Text>
          <Text style={styles.monthDot}>  |  </Text>
          <Text style={monthSpend > 0 ? styles.monthNeg : styles.monthMuted}>
            −{formatVndCompact(monthSpend)}
          </Text>
        </Text>

        <Text style={styles.section}>Chat theo ngày</Text>
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {days.length === 0 ? (
            <Text style={styles.empty}>Chưa có đoạn chat nào</Text>
          ) : (
            days.map((day) => (
              <HistoryRow
                key={day.date}
                day={day}
                active={day.date === selectedDate}
                tokens={tokens}
                styles={styles}
                onSelect={() => onSelectDay(day.date)}
                onDelete={() => onDeleteDay(day)}
              />
            ))
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quản lý danh mục"
            onPress={onManageCategories}
            style={({ pressed }) => [styles.themeBtn, pressed && styles.iconPressed]}
          >
            <Feather name="grid" size={16} color={tokens.ink2} />
            <Text style={styles.themeText}>Quản lý danh mục</Text>
          </Pressable>
          {account ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đăng xuất"
              onPress={onSignOut}
              style={({ pressed }) => [styles.themeBtn, pressed && styles.iconPressed]}
            >
              <Feather name="log-out" size={16} color={tokens.ink2} />
              <Text style={styles.themeText}>Đăng xuất</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Gắn Gmail"
              onPress={onSignIn}
              style={({ pressed }) => [styles.themeBtn, pressed && styles.iconPressed]}
            >
              <Feather name="user" size={16} color={tokens.ink2} />
              <Text style={styles.themeText}>Gắn Gmail</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đổi giao diện"
            onPress={cycleMode}
            style={({ pressed }) => [styles.themeBtn, pressed && styles.iconPressed]}
          >
            <Feather name={scheme === 'dark' ? 'moon' : 'sun'} size={16} color={tokens.ink2} />
            <Text style={styles.themeText}>
              {scheme === 'dark' ? 'Nền tối' : 'Nền sáng'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reset dữ liệu"
            onPress={onResetData}
            style={({ pressed }) => [styles.resetBtn, pressed && styles.resetBtnPressed]}
          >
            <Feather name="rotate-ccw" size={16} color={tokens.neg} />
            <Text style={styles.resetText}>Reset dữ liệu</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

function UserAvatar({
  name,
  picture,
  styles,
}: {
  name: string;
  picture: string | null;
  styles: ReturnType<typeof makeStyles>;
}) {
  const [broken, setBroken] = useState(false);
  const letter = name.trim().charAt(0).toUpperCase() || 'B';
  if (picture && !broken) {
    return (
      <Image
        source={{ uri: picture }}
        style={styles.avatar}
        contentFit="cover"
        onError={() => setBroken(true)}
        accessibilityLabel={`Ảnh của ${name}`}
      />
    );
  }
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarLetter}>{letter}</Text>
    </View>
  );
}

function HistoryRow({
  day,
  active,
  tokens,
  styles,
  onSelect,
  onDelete,
}: {
  day: ChatDayRow;
  active: boolean;
  tokens: ThemeTokens;
  styles: ReturnType<typeof makeStyles>;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const hot = hovered || active;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={day.label}
      accessibilityState={{ selected: active }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={onSelect}
      style={({ pressed }) => [
        styles.dayRow,
        hovered && !active && styles.dayRowHover,
        active && styles.dayRowActive,
        pressed && !active && styles.dayRowPressed,
      ]}
    >
      <View style={[styles.dayRail, active && styles.dayRailOn]} />
      <View style={styles.dayMain}>
        <View style={styles.dayTop}>
          <Text style={[styles.dayLabel, active && styles.dayLabelActive]}>{day.label}</Text>
          <View style={[styles.dayChip, active && styles.dayChipActive, hovered && !active && styles.dayChipHover]}>
            <Text style={[styles.dayCount, active && styles.dayCountActive]}>{day.count}</Text>
          </View>
        </View>
        <Text style={styles.dayMoney} numberOfLines={1}>
          <Text style={day.income > 0 ? styles.dayMoneyPos : styles.dayMoneyMuted}>
            +{formatVndCompact(day.income)}
          </Text>
          <Text style={styles.dayMoneyDot}>  ·  </Text>
          <Text style={day.spend > 0 ? styles.dayMoneyNeg : styles.dayMoneyMuted}>
            −{formatVndCompact(day.spend)}
          </Text>
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Xoá ${day.label}`}
        hitSlop={6}
        onPress={onDelete}
        style={({ pressed }) => [
          styles.dayDelete,
          hot && styles.dayDeleteHot,
          pressed && styles.iconPressed,
        ]}
      >
        <Feather name="trash-2" size={14} color={active ? tokens.accent : tokens.ink3} />
      </Pressable>
    </Pressable>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    root: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: 40,
    },
    scrim: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: 'rgba(10,9,7,0.38)',
    },
    scrimHit: {
      flex: 1,
    },
    panel: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      backgroundColor: t.paper,
      paddingHorizontal: 16,
      borderRightWidth: 1,
      borderRightColor: t.line,
    },
    panelHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 18,
    },
    brand: {
      fontFamily: 'Lora_500Medium',
      fontSize: 20,
      color: t.ink,
      textTransform: 'uppercase',
      letterSpacing: 0.7,
    },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconPressed: {
      backgroundColor: t.surface2,
    },
    userCard: {
      alignItems: 'center',
      gap: 10,
    },
    avatar: {
      width: 46,
      height: 46,
      borderRadius: 23,
      overflow: 'hidden',
      backgroundColor: t.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarLetter: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 18,
      color: t.accentInk,
    },
    userCopy: {
      alignItems: 'center',
    },
    userName: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 16,
      color: t.ink,
      textAlign: 'center',
    },
    userMeta: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12.5,
      color: t.ink3,
      marginTop: 2,
      textAlign: 'center',
    },
    monthLine: {
      marginTop: 12,
      marginBottom: 22,
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: t.ink2,
    },
    monthPos: {
      fontFamily: 'Inter_600SemiBold',
      color: t.pos,
    },
    monthNeg: {
      fontFamily: 'Inter_600SemiBold',
      color: t.accent,
    },
    monthMuted: {
      fontFamily: 'Inter_600SemiBold',
      color: t.ink3,
    },
    monthDot: {
      color: t.ink3,
    },
    section: {
      fontFamily: 'Inter_500Medium',
      fontSize: 12,
      color: t.ink3,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    list: {
      flex: 1,
    },
    listContent: {
      paddingBottom: 12,
      gap: 2,
    },
    empty: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: t.ink3,
      paddingVertical: 12,
    },
    dayRow: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 16,
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: 'transparent',
    },
    dayRowHover: {
      backgroundColor: t.surface,
      borderColor: t.line,
    },
    dayRowActive: {
      backgroundColor: t.accentSoft,
      borderColor: 'transparent',
    },
    dayRowPressed: {
      backgroundColor: t.surface2,
      borderColor: t.line,
    },
    dayRail: {
      position: 'absolute',
      left: 6,
      top: 10,
      bottom: 10,
      width: 2.5,
      borderRadius: 2,
      backgroundColor: 'transparent',
    },
    dayRailOn: {
      backgroundColor: t.accent,
    },
    dayMain: {
      flex: 1,
      paddingVertical: 11,
      paddingLeft: 16,
      paddingRight: 4,
    },
    dayDelete: {
      width: 36,
      height: 36,
      marginRight: 6,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      opacity: 0.72,
    },
    dayDeleteHot: {
      opacity: 1,
    },
    dayTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    dayLabel: {
      fontFamily: 'Inter_500Medium',
      fontSize: 14,
      color: t.ink,
    },
    dayLabelActive: {
      color: t.accent,
    },
    dayChip: {
      minWidth: 22,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: 'transparent',
      alignItems: 'center',
    },
    dayChipHover: {
      backgroundColor: t.line2,
    },
    dayChipActive: {
      backgroundColor: t.surface,
    },
    dayCount: {
      fontFamily: 'Inter_500Medium',
      fontSize: 11,
      color: t.ink3,
    },
    dayCountActive: {
      color: t.accent,
    },
    dayMoney: {
      marginTop: 3,
      fontFamily: 'Inter_500Medium',
      fontSize: 12,
    },
    dayMoneyPos: {
      color: t.pos,
    },
    dayMoneyNeg: {
      color: t.neg,
    },
    dayMoneyMuted: {
      color: t.ink3,
    },
    dayMoneyDot: {
      color: t.ink3,
    },
    footer: {
      marginTop: 8,
      gap: 2,
    },
    themeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 4,
      borderRadius: 12,
    },
    themeText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13.5,
      color: t.ink2,
    },
    resetBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 4,
      borderRadius: 12,
    },
    resetBtnPressed: {
      backgroundColor: t.accentSoft,
    },
    resetText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13.5,
      color: t.neg,
    },
  });
}
