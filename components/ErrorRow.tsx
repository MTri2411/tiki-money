import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { errorCopy, type GeminiErrorKind } from '@/lib/gemini';
import { useTheme } from '@/theme/ThemeProvider';
import type { ThemeTokens } from '@/theme/tokens';

type Props = {
  kind: GeminiErrorKind;
  onRetry: () => void;
};

export function ErrorRow({ kind, onRetry }: Props) {
  const { tokens, reduceMotion } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);

  return (
    <Animated.View layout={LinearTransition.duration(reduceMotion ? 0 : 280)} style={styles.wrap}>
      <Text style={styles.copy}>{errorCopy(kind)}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Thử lại"
        hitSlop={8}
        onPress={onRetry}
      >
        <Text style={styles.retry}>Thử lại</Text>
      </Pressable>
    </Animated.View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    wrap: {
      marginVertical: 16,
      maxWidth: 250,
    },
    copy: {
      fontFamily: 'Inter_400Regular',
      fontSize: 15,
      lineHeight: 23,
      color: t.ink2,
    },
    retry: {
      marginTop: 6,
      fontFamily: 'Inter_500Medium',
      fontSize: 13.5,
      color: t.accent,
    },
  });
}
