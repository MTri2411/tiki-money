import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { resolveCategoryIcon } from '@/lib/category-icons';

type Props = {
  icon: string;
  size?: number;
};

export function CategoryGlyph({ icon, size = 36 }: Props) {
  const visual = resolveCategoryIcon(icon);
  const styles = useMemo(() => makeStyles(size), [size]);
  return (
    <View style={styles.tile}>
      <Text allowFontScaling={false} style={styles.emoji}>
        {visual.emoji}
      </Text>
    </View>
  );
}

function makeStyles(size: number) {
  return StyleSheet.create({
    tile: {
      width: size,
      height: size,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emoji: {
      fontSize: Math.round(size * 0.78),
      lineHeight: Math.round(size * 0.9),
      textAlign: 'center',
    },
  });
}
