import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';

const SWEEP = Easing.inOut(Easing.cubic);

export function MirrorGlaze() {
  const { scheme, reduceMotion } = useTheme();
  const [span, setSpan] = useState(0);
  const x = useSharedValue(0);
  const phase = useRef(640 + Math.round(Math.random() * 1200));
  const dark = scheme === 'dark';

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0) setSpan((prev) => (prev === next ? prev : next));
  };

  useEffect(() => {
    if (reduceMotion || span <= 0) return;
    const band = Math.max(108, span * 0.58);
    const from = -band - span * 0.75;
    const to = span * 1.55;
    x.value = from;
    x.value = withDelay(
      phase.current,
      withRepeat(
        withSequence(
          withTiming(to, { duration: 2400, easing: SWEEP }),
          withTiming(to, { duration: 3400 }),
          withTiming(from, { duration: 1 }),
        ),
        -1,
        false,
      ),
    );
  }, [reduceMotion, span, x]);

  const bandStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { skewX: '-18deg' }],
  }));

  const bandWidth = Math.max(108, span * 0.58);

  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={styles.clip}
      onLayout={onLayout}
    >
      <LinearGradient
        colors={
          dark
            ? ['rgba(255,255,255,0.13)', 'rgba(255,255,255,0.02)', 'rgba(0,0,0,0.12)']
            : ['rgba(255,255,255,0.5)', 'rgba(255,255,255,0)', 'rgba(88,58,28,0.05)']
        }
        locations={[0, 0.42, 1]}
        start={{ x: 0.12, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {reduceMotion ? (
        <LinearGradient
          colors={
            dark
              ? ['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0.05)']
              : ['rgba(255,226,198,0.34)', 'rgba(255,226,198,0)', 'rgba(255,226,198,0.08)']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {reduceMotion || span <= 0 ? null : (
        <Animated.View style={[styles.band, { width: bandWidth }, bandStyle]}>
          <LinearGradient
            colors={
              dark
                ? [
                    'rgba(255,255,255,0)',
                    'rgba(255,255,255,0.05)',
                    'rgba(255,255,255,0.28)',
                    'rgba(255,255,255,0.05)',
                    'rgba(255,255,255,0)',
                  ]
                : [
                    'rgba(255,206,164,0)',
                    'rgba(255,196,148,0.14)',
                    'rgba(255,226,198,0.62)',
                    'rgba(255,196,148,0.14)',
                    'rgba(255,206,164,0)',
                  ]
            }
            locations={[0, 0.36, 0.5, 0.64, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={
              dark
                ? ['rgba(255,255,255,0)', 'rgba(255,255,255,0.72)', 'rgba(255,255,255,0)']
                : ['rgba(255,236,214,0)', 'rgba(255,248,238,0.94)', 'rgba(255,236,214,0)']
            }
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.core}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    borderRadius: 22,
  },
  band: {
    position: 'absolute',
    top: -24,
    bottom: -24,
  },
  core: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '40%',
    width: '16%',
  },
});
