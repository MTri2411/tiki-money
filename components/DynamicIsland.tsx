/* eslint-disable react-hooks/immutability */
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { CategoryGlyph } from '@/components/CategoryGlyph';
import { useCategories } from '@/components/CategoryProvider';
import {
  formatClock,
  formatDayMarker,
  formatWeekdayDate,
  localDateIso,
  type DayTotals,
  type TxRow,
} from '@/lib/db';
import { formatVndCompact } from '@/lib/money';
import { useTheme } from '@/theme/ThemeProvider';
import type { ThemeTokens } from '@/theme/tokens';

export type IslandState = 'pill' | 'alert' | 'panel';

export type IslandAlert = {
  title: string;
  subtitle: string;
};

type Props = {
  topOffset: number;
  date: string;
  totals: DayTotals;
  txs: TxRow[];
  monthSpend: number;
  monthOutflow: number;
  forecast: { left: number; ratio: number; goalPercent: number | null } | null;
  alert: IslandAlert | null;
  onUndo: () => void;
  onAlertFinished: () => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PILL_H = 34;
const LIST_ROW = 38;
const LIST_MAX = 190;
const PANEL_BASE = 148;
const HEADER_SIDE = 64;
const MORPH = Easing.bezier(0.32, 1.28, 0.5, 1);

function amountLabel(amount: number, sign: '−' | '+') {
  return `${sign}${formatVndCompact(amount)}`;
}

function pillMax(screenW: number) {
  return Math.max(172, screenW - HEADER_SIDE * 2);
}

function pillWidth(screenW: number, totals: DayTotals, dateLabel: string) {
  let w = 36 + Math.ceil(dateLabel.length * 9);
  if (totals.income > 0) w += 10 + Math.ceil(amountLabel(totals.income, '+').length * 8.6);
  if (totals.spend > 0) w += 10 + Math.ceil(amountLabel(totals.spend, '−').length * 8.6);
  if (totals.income > 0 && totals.spend > 0) w += 14;
  return Math.min(Math.max(w, 172), pillMax(screenW));
}

function forecastExtra(
  forecast: { left: number; ratio: number; goalPercent: number | null } | null,
  count: number
) {
  if (!forecast) return 16;
  return forecast.goalPercent != null && count > 0 ? 68 : 50;
}

function panelSize(screenW: number, listOpen: boolean, count: number, extra = 0) {
  let h = PANEL_BASE + extra;
  if (count === 0) h += 16;
  if (listOpen && count > 0) h += Math.min(count * LIST_ROW, LIST_MAX) + 6;
  return { w: screenW - 20, h, r: 32 };
}

function islandTarget(
  width: number,
  next: IslandState,
  totals: DayTotals,
  dateLabel: string,
  listOpen: boolean,
  txCount: number,
  extra = 0
) {
  if (next === 'pill') return { w: pillWidth(width, totals, dateLabel), h: PILL_H, r: 17 };
  if (next === 'alert') return { w: 270, h: 48, r: 24 };
  return panelSize(width, listOpen, txCount, extra);
}

export function DynamicIsland({
  topOffset,
  date,
  totals,
  txs,
  monthSpend,
  monthOutflow,
  forecast,
  alert,
  onUndo,
  onAlertFinished,
}: Props) {
  const { tokens, reduceMotion } = useTheme();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [active, setActive] = useState<IslandState>('pill');
  const [listOpen, setListOpen] = useState(false);
  const activeRef = useRef<IslandState>('pill');
  const listOpenRef = useRef(false);
  const alertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const today = localDateIso();
  const dateLabel = formatWeekdayDate(date);
  const heading = date === today ? 'Chi tiêu hôm nay' : formatDayMarker(date, today);
  const spend = Number(totals.spend) || 0;
  const income = Number(totals.income) || 0;
  const count = Number(totals.count) || 0;
  const start = pillWidth(width, { spend, income, count }, dateLabel);
  const measuredPillW = useRef(start);

  const w = useSharedValue(start);
  const h = useSharedValue(PILL_H);
  const r = useSharedValue(17);
  const pillO = useSharedValue(1);
  const alertO = useSharedValue(0);
  const panelO = useSharedValue(0);
  const scrimO = useSharedValue(0);

  const goTo = useCallback(
    (next: IslandState) => {
      if (next === 'panel') {
        const open = txs.length > 0;
        listOpenRef.current = open;
        setListOpen(open);
      } else {
        listOpenRef.current = false;
        setListOpen(false);
      }
      const day = { spend, income, count };
      const t =
        next === 'pill'
          ? { w: Math.max(measuredPillW.current, pillWidth(width, day, dateLabel)), h: PILL_H, r: 17 }
          : islandTarget(width, next, day, dateLabel, listOpenRef.current, txs.length, forecastExtra(forecast, txs.length));
      const morphDur = reduceMotion ? 0 : 520;
      const fadeDur = reduceMotion ? 0 : 150;
      const scrimDur = reduceMotion ? 0 : 340;
      const morph = { duration: morphDur, easing: MORPH };
      const fade = { duration: fadeDur };
      w.value = withTiming(t.w, morph);
      h.value = withTiming(t.h, morph);
      r.value = withTiming(t.r, morph);
      if (reduceMotion) {
        pillO.value = next === 'pill' ? 1 : 0;
        alertO.value = next === 'alert' ? 1 : 0;
        panelO.value = next === 'panel' ? 1 : 0;
      } else {
        pillO.value = next === 'pill' ? withDelay(200, withTiming(1, fade)) : withTiming(0, fade);
        alertO.value = next === 'alert' ? withDelay(150, withTiming(1, fade)) : withTiming(0, fade);
        panelO.value = next === 'panel' ? withDelay(200, withTiming(1, fade)) : withTiming(0, fade);
      }
      scrimO.value = withTiming(next === 'panel' ? 1 : 0, { duration: scrimDur });
      activeRef.current = next;
      setActive(next);
    },
    [width, spend, income, count, dateLabel, txs.length, forecast, reduceMotion, w, h, r, pillO, alertO, panelO, scrimO]
  );

  useEffect(() => {
    const morph = { duration: reduceMotion ? 0 : 320, easing: MORPH };
    if (activeRef.current === 'pill') {
      w.value = withTiming(pillWidth(width, { spend, income, count }, dateLabel), morph);
      return;
    }
    if (activeRef.current === 'panel') {
      const t = panelSize(width, listOpenRef.current, txs.length, forecastExtra(forecast, txs.length));
      w.value = t.w;
      h.value = withTiming(t.h, morph);
    }
  }, [width, spend, income, count, dateLabel, txs.length, forecast, reduceMotion, w, h]);

  useEffect(() => {
    if (!alert) return;
    if (alertTimer.current) clearTimeout(alertTimer.current);
    const startAlert = setTimeout(() => goTo('alert'), 0);
    alertTimer.current = setTimeout(() => {
      alertTimer.current = null;
      goTo('pill');
      onAlertFinished();
    }, 2800);
    return () => {
      clearTimeout(startAlert);
      if (alertTimer.current) {
        clearTimeout(alertTimer.current);
        alertTimer.current = null;
      }
    };
  }, [alert, goTo, onAlertFinished]);

  useEffect(() => {
    return () => {
      if (alertTimer.current) clearTimeout(alertTimer.current);
    };
  }, []);

  const onToggle = useCallback(() => {
    if (activeRef.current === 'alert') return;
    if (activeRef.current === 'panel') {
      goTo('pill');
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    goTo('panel');
  }, [goTo]);

  const onPillContentLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const estimated = pillWidth(width, { spend, income, count }, dateLabel);
      const measured = Math.round(e.nativeEvent.layout.width + 26);
      const next = Math.min(Math.max(measured, estimated), pillMax(width));
      if (Math.abs(next - measuredPillW.current) < 2) return;
      measuredPillW.current = next;
      if (activeRef.current === 'pill') {
        w.value = withTiming(next, { duration: reduceMotion ? 0 : 280, easing: MORPH });
      }
    },
    [width, spend, income, count, dateLabel, reduceMotion, w]
  );

  const onSeeAll = useCallback(() => {
    if (activeRef.current !== 'panel') return;
    const next = !listOpenRef.current;
    listOpenRef.current = next;
    setListOpen(next);
    void Haptics.selectionAsync();
    const t = panelSize(width, next, txs.length, forecastExtra(forecast, txs.length));
    h.value = withTiming(t.h, { duration: reduceMotion ? 0 : 420, easing: MORPH });
  }, [width, txs.length, forecast, reduceMotion, h]);

  const onScrim = useCallback(() => {
    if (activeRef.current === 'panel') goTo('pill');
  }, [goTo]);

  const handleUndo = useCallback(() => {
    if (alertTimer.current) {
      clearTimeout(alertTimer.current);
      alertTimer.current = null;
    }
    onUndo();
    goTo('pill');
    onAlertFinished();
  }, [onUndo, goTo, onAlertFinished]);

  const outerStyle = useAnimatedStyle(() => ({
    width: w.value,
    height: h.value,
    borderRadius: r.value,
  }));

  const innerStyle = useAnimatedStyle(() => ({
    borderRadius: r.value,
  }));

  const pillStyle = useAnimatedStyle(() => ({ opacity: pillO.value }));
  const alertStyle = useAnimatedStyle(() => ({ opacity: alertO.value }));
  const panelStyle = useAnimatedStyle(() => ({ opacity: panelO.value }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrimO.value }));

  const hasSpend = spend > 0;
  const hasIncome = income > 0;
  const spendLabel = amountLabel(spend, '−');
  const incomeLabel = amountLabel(income, '+');
  const pillA11y = [dateLabel, hasSpend ? `chi ${formatVndCompact(spend)}` : null, hasIncome ? `thu ${formatVndCompact(income)}` : null]
    .filter(Boolean)
    .join('. ');

  const layerBase: StyleProp<ViewStyle> = [styles.layerFill, styles.layer];

  return (
    <View pointerEvents="box-none" style={styles.root}>
      <Animated.View
        pointerEvents={active === 'panel' ? 'auto' : 'none'}
        style={[styles.scrim, scrimStyle]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đóng chi tiêu hôm nay"
          onPress={onScrim}
          style={styles.scrimHit}
        />
      </Animated.View>

      <View pointerEvents="box-none" style={[styles.islandWrap, { top: topOffset }]}>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={pillA11y}
          accessibilityState={{ expanded: active === 'panel' }}
          onPress={active === 'pill' ? onToggle : undefined}
          style={[styles.outer, outerStyle]}
        >
          <Animated.View style={[styles.inner, innerStyle]}>
            <Animated.View
              pointerEvents={active === 'pill' ? 'auto' : 'none'}
              style={[layerBase, styles.pillLayer, pillStyle]}
            >
              <View style={styles.pillInner} onLayout={onPillContentLayout}>
                <Text style={styles.pillDate} numberOfLines={1}>
                  {dateLabel}
                </Text>
                {hasIncome ? <Text style={styles.pillIncome}>{incomeLabel}</Text> : null}
                {hasIncome && hasSpend ? <Text style={styles.pillPipe}>|</Text> : null}
                {hasSpend ? <Text style={styles.pillSpend}>{spendLabel}</Text> : null}
              </View>
            </Animated.View>

            <Animated.View
              pointerEvents={active === 'alert' ? 'auto' : 'none'}
              style={[layerBase, styles.alertLayer, alertStyle]}
            >
              <View style={styles.alertIcon}>
                <Feather name="check" size={15} color={tokens.accentInk} />
              </View>
              <View style={styles.alertCopy}>
                <Text style={styles.alertTitle} numberOfLines={1}>
                  {alert?.title ?? ''}
                </Text>
                <Text style={styles.alertSub} numberOfLines={1}>
                  {alert?.subtitle ?? ''}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Hoàn tác"
                hitSlop={10}
                onPress={handleUndo}
              >
                <Text style={styles.undo}>Hoàn tác</Text>
              </Pressable>
            </Animated.View>

            <Animated.View
              pointerEvents={active === 'panel' ? 'auto' : 'none'}
              style={[layerBase, styles.panelLayer, panelStyle]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng chi tiêu hôm nay"
                onPress={onToggle}
              >
                <View style={styles.panelTop}>
                  <Text style={styles.islandHeading}>{heading}</Text>
                  <Text style={styles.islandDate}>{dateLabel}</Text>
                </View>
                <View style={styles.amountRow}>
                  <Text style={styles.amountCol} numberOfLines={1}>
                    <Text style={styles.amountKind}>Thu: </Text>
                    <Text style={[styles.panelAmount, styles.panelPos]}>
                      {hasIncome ? `+${formatVndCompact(income)}` : '0'}
                    </Text>
                    <Text style={styles.panelSuffix}>/VND</Text>
                  </Text>
                  <Text style={styles.amountPipe}>|</Text>
                  <Text style={styles.amountCol} numberOfLines={1}>
                    <Text style={styles.amountKind}>Chi: </Text>
                    <Text style={[styles.panelAmount, styles.panelNeg]}>
                      {hasSpend ? `−${formatVndCompact(spend)}` : '0'}
                    </Text>
                    <Text style={styles.panelSuffix}>/VND</Text>
                  </Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.meta}>{`${count} giao dịch`}</Text>
                </View>
              </Pressable>
              {count === 0 ? (
                <Text style={styles.emptyDay}>
                  {date === today ? 'Chưa có khoản nào hôm nay' : 'Chưa có khoản nào ngày này'}
                </Text>
              ) : null}
              {listOpen && txs.length > 0 ? (
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  style={styles.txList}
                >
                  {txs.map((tx) => (
                    <TxLine key={tx.id} tx={tx} styles={styles} tokens={tokens} />
                  ))}
                </ScrollView>
              ) : null}
              {forecast ? (
                <View style={styles.forecast}>
                  <Text style={styles.footerMonth} numberOfLines={1}>
                    Còn lại tháng này <Text style={styles.footerFigure}>{formatVndCompact(forecast.left)}</Text> đ
                  </Text>
                  <View style={styles.track}>
                    <View style={[styles.trackFill, { width: `${Math.max(4, Math.min(100, Math.round(forecast.ratio * 100)))}%` }]} />
                  </View>
                  {forecast.goalPercent != null && count > 0 ? (
                    <Text style={styles.footerMonth} numberOfLines={1}>
                      Mục tiêu {forecast.goalPercent}%
                    </Text>
                  ) : null}
                </View>
              ) : null}
              <View style={styles.footer}>
                <View style={styles.footerMonths}>
                  <Text style={styles.footerMonth}>
                    Chi tiêu <Text style={styles.footerFigure}>{formatVndCompact(monthSpend)}</Text>
                  </Text>
                  <Text style={styles.footerMonth}>
                    Dòng tiền ra <Text style={styles.footerFigure}>{formatVndCompact(monthOutflow)}</Text>
                  </Text>
                </View>
                {count > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={listOpen ? 'Thu gọn giao dịch hôm nay' : 'Xem tất cả giao dịch hôm nay'}
                    accessibilityState={{ expanded: listOpen }}
                    hitSlop={8}
                    onPress={onSeeAll}
                    style={styles.seeAll}
                  >
                    <Text style={styles.seeAllText}>{listOpen ? 'Thu gọn' : 'Xem tất cả'}</Text>
                    <Feather
                      name={listOpen ? 'chevron-up' : 'chevron-down'}
                      size={13}
                      color={tokens.islandInk}
                    />
                  </Pressable>
                ) : null}
              </View>
            </Animated.View>
          </Animated.View>
        </AnimatedPressable>
      </View>
    </View>
  );
}

function TxLine({
  tx,
  styles,
  tokens,
}: {
  tx: TxRow;
  styles: ReturnType<typeof makeStyles>;
  tokens: ThemeTokens;
}) {
  const { iconFor } = useCategories();
  const income = tx.direction === 'thu';
  const label = tx.note?.trim() || tx.category;
  return (
    <View style={styles.txRow}>
      <View style={styles.txIcon}>
        <CategoryGlyph icon={iconFor(tx.category, tx.note)} size={22} />
      </View>
      <Text style={styles.txNote} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.txTime}>{formatClock(tx.created_at)}</Text>
      <Text style={[styles.txAmount, income ? styles.txPos : styles.txNeg]}>
        {amountLabel(tx.amount, income ? '+' : '−')}
      </Text>
    </View>
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
      zIndex: 24,
    },
    scrim: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: 'rgba(10,9,7,0.34)',
      zIndex: 1,
      elevation: 8,
    },
    scrimHit: {
      flex: 1,
    },
    islandWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 2,
    },
    outer: {
      backgroundColor: t.islandBg,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.24,
      shadowRadius: 18,
      elevation: 12,
    },
    inner: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      overflow: 'hidden',
    },
    layerFill: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    layer: {
      paddingHorizontal: 0,
    },
    pillLayer: {
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 13,
    },
    pillInner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    pillDate: {
      flexShrink: 1,
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      color: t.islandInk,
    },
    pillSpend: {
      flexShrink: 0,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: t.accent,
    },
    pillIncome: {
      flexShrink: 0,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: t.pos,
    },
    pillPipe: {
      flexShrink: 0,
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: t.islandDim,
    },
    alertLayer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingHorizontal: 16,
    },
    alertIcon: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: t.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    alertCopy: {
      flex: 1,
    },
    alertTitle: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: t.islandInk,
    },
    alertSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11.5,
      color: t.islandDim,
    },
    undo: {
      fontFamily: 'Inter_500Medium',
      fontSize: 12.5,
      color: t.islandInk,
      textDecorationLine: 'underline',
    },
    panelLayer: {
      paddingTop: 15,
      paddingHorizontal: 18,
      paddingBottom: 14,
      flexDirection: 'column',
      flex: 1,
    },
    panelTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    islandHeading: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      color: t.islandDim,
    },
    islandDate: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      color: t.islandDim,
    },
    amountRow: {
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'baseline',
    },
    amountCol: {
      flex: 1,
    },
    amountKind: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      color: t.islandDim,
    },
    amountPipe: {
      fontFamily: 'Inter_400Regular',
      fontSize: 16,
      color: t.islandDim,
      marginHorizontal: 10,
    },
    panelAmount: {
      fontFamily: 'Lora_500Medium',
      fontSize: 20,
      letterSpacing: -0.3,
      color: t.islandInk,
    },
    panelPos: {
      color: t.pos,
    },
    panelNeg: {
      color: t.accent,
    },
    panelSuffix: {
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      color: t.islandDim,
    },
    metaRow: {
      flexDirection: 'row',
      gap: 14,
      marginTop: 4,
    },
    meta: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11.5,
      color: t.islandDim,
    },
    emptyDay: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11.5,
      color: t.islandDim,
      marginTop: 12,
    },
    txList: {
      marginTop: 8,
      maxHeight: LIST_MAX,
    },
    txRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: LIST_ROW,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.islandLine,
    },
    txIcon: {
      width: 22,
      height: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    txNote: {
      flex: 1,
      fontFamily: 'Inter_400Regular',
      fontSize: 12.5,
      color: t.islandInk,
    },
    txTime: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: t.islandDim,
    },
    txAmount: {
      minWidth: 64,
      fontFamily: 'Inter_500Medium',
      fontSize: 12.5,
      color: t.islandInk,
      textAlign: 'right',
    },
    txPos: {
      color: t.pos,
    },
    txNeg: {
      color: t.accent,
    },
    forecast: { marginTop: 10, gap: 4 },
    track: { height: 3, borderRadius: 2, backgroundColor: t.islandLine, overflow: 'hidden' },
    trackFill: { height: 3, backgroundColor: t.accent },
    footerMonths: { gap: 2 },
    footer: {
      marginTop: 'auto',
      paddingTop: 11,
      borderTopWidth: 1,
      borderTopColor: t.islandLine,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    footerMonth: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11.5,
      color: t.islandDim,
    },
    footerFigure: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11.5,
      color: t.islandInk,
    },
    seeAll: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    seeAllText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 11.5,
      color: t.islandInk,
    },
  });
}
