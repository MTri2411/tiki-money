import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CategoryGlyph } from '@/components/CategoryGlyph';
import { useCategories } from '@/components/CategoryProvider';
import type { ChipRow } from '@/lib/db';
import { useTheme } from '@/theme/ThemeProvider';
import type { ThemeTokens } from '@/theme/tokens';

type Props = {
  chips: ChipRow[];
  onPick: (chip: ChipRow) => void;
  disabled?: boolean;
};

export function QuickChips({ chips, onPick, disabled }: Props) {
  const { tokens } = useTheme();
  const { iconFor } = useCategories();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {chips.map((chip) => (
          <Pressable
            key={chip.id}
            accessibilityRole="button"
            accessibilityLabel={chip.label}
            disabled={disabled}
            onPress={() => onPick(chip)}
            style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
          >
            <CategoryGlyph icon={iconFor(chip.category, chip.label)} size={22} />
            <Text style={styles.label}>{chip.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', tokens.paper]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.fade}
      />
    </View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    wrap: {
      paddingBottom: 11,
    },
    content: {
      gap: 8,
      paddingHorizontal: 16,
      paddingRight: 40,
    },
    chip: {
      height: 35,
      paddingHorizontal: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: t.line,
      backgroundColor: t.paper,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    chipPressed: {
      backgroundColor: t.surface2,
    },
    label: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13.5,
      color: t.ink2,
    },
    fade: {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 11,
      width: 48,
    },
  });
}
