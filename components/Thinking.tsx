import { useEffect, useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';
import type { ThemeTokens } from '@/theme/tokens';

function Dot({ delay, reduceMotion, color }: { delay: number; reduceMotion: boolean; color: string }) {
  const opacity = useSharedValue(reduceMotion ? 1 : 0.35);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      return;
    }
    opacity.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 600 }), -1, true)
    );
  }, [delay, opacity, reduceMotion]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

export function Thinking() {
  const { tokens, reduceMotion } = useTheme();
  const themed = useMemo(() => makeStyles(tokens), [tokens]);

  if (reduceMotion) {
    return (
      <Animated.View layout={LinearTransition.duration(0)}>
        <Text style={themed.static}>Đang ghi…</Text>
      </Animated.View>
    );
  }

  return (
    <Animated.View layout={LinearTransition.duration(280)} style={themed.row}>
      <Dot delay={0} reduceMotion={false} color={tokens.ink3} />
      <Dot delay={150} reduceMotion={false} color={tokens.ink3} />
      <Dot delay={300} reduceMotion={false} color={tokens.ink3} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
});

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginVertical: 16,
    },
    static: {
      fontFamily: 'Inter_400Regular',
      fontSize: 15,
      color: t.ink3,
      marginVertical: 16,
    },
  });
}
