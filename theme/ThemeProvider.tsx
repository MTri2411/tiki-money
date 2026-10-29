import { StatusBar } from 'expo-status-bar';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';

import { dark, light, type ThemeTokens } from '@/theme/tokens';

export type ThemeMode = 'light' | 'dark' | 'system';

type ThemeContextValue = {
  tokens: ThemeTokens;
  scheme: 'light' | 'dark';
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  cycleMode: () => void;
  reduceMotion: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const MODE_ORDER: ThemeMode[] = ['system', 'light', 'dark'];

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>('system');
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduceMotion(value);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const scheme: 'light' | 'dark' = mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
  const tokens = scheme === 'dark' ? dark : light;

  const cycleMode = useCallback(() => {
    setMode((current) => MODE_ORDER[(MODE_ORDER.indexOf(current) + 1) % MODE_ORDER.length]);
  }, []);

  const value = useMemo(
    () => ({ tokens, scheme, mode, setMode, cycleMode, reduceMotion }),
    [tokens, scheme, mode, cycleMode, reduceMotion]
  );

  return (
    <ThemeContext.Provider value={value}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
