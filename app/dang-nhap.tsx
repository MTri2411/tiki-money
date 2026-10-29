import { Redirect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/components/AuthProvider';
import { authFailureMessage, signInWithGmail } from '@/lib/google';
import { supabaseConfigured } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';
import type { ThemeTokens } from '@/theme/tokens';

WebBrowser.maybeCompleteAuthSession();

type Mode = 'login' | 'register';

export default function DangNhapScreen() {
  return (
    <SafeAreaProvider>
      <DangNhapBody />
    </SafeAreaProvider>
  );
}

function DangNhapBody() {
  const router = useRouter();
  const { account, ready } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);

  if (!ready) return null;
  if (account) return <Redirect href="/so-chi-tieu" />;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.hero}>
        <Text style={styles.brand}>TIKI MONEY</Text>
        <Text style={styles.title}>{mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}</Text>
        <Text style={styles.lead}>
          Không bắt buộc. Gắn Gmail để định danh, khi đổi máy bạn đăng nhập lại và giữ sổ của mình. Tên và ảnh lấy theo Gmail.
        </Text>
      </View>

      <View style={styles.switch}>
        <ModeTab
          label="Đăng nhập"
          selected={mode === 'login'}
          onPress={() => setMode('login')}
        />
        <ModeTab
          label="Đăng ký"
          selected={mode === 'register'}
          onPress={() => setMode('register')}
        />
      </View>

      {supabaseConfigured ? (
        <GmailButton mode={mode} />
      ) : (
        <Text style={styles.warn}>
          Chưa cấu hình Supabase. Kiểm tra EXPO_PUBLIC_SUPABASE_URL và EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY trong file .env rồi mở lại app.
        </Text>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dùng không cần tài khoản"
        onPress={() => router.replace('/so-chi-tieu')}
        style={styles.skip}
      >
        <Text style={styles.skipText}>Dùng không cần tài khoản</Text>
      </Pressable>
    </View>
  );
}

function ModeTab({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.tab, selected && styles.tabOn]}
    >
      <Text style={[styles.tabText, selected && styles.tabTextOn]}>{label}</Text>
    </Pressable>
  );
}

function GmailButton({ mode }: { mode: Mode }) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sign = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const outcome = await signInWithGmail();
      if (outcome === 'cancel') return;
    } catch (err) {
      if (__DEV__) console.error('[auth] gmail sign-in failed', err);
      setError(authFailureMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const label = busy
    ? 'Đang mở Gmail…'
    : mode === 'login'
      ? 'Đăng nhập bằng Gmail'
      : 'Đăng ký bằng Gmail';

  return (
    <View style={styles.action}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={busy}
        onPress={() => void sign()}
        style={({ pressed }) => [
          styles.gmail,
          busy && styles.gmailDisabled,
          pressed && !busy && styles.gmailPressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={tokens.ink} />
        ) : (
          <View style={styles.mark}>
            <Text style={styles.markLetter}>G</Text>
          </View>
        )}
        <Text style={styles.gmailText}>{label}</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.note}>
        {mode === 'register'
          ? 'Đăng ký để gắn sổ với Gmail. Chưa đăng ký vẫn ghi thu chi bình thường trên máy này.'
          : 'Đăng nhập lại cùng Gmail khi đổi máy để nhận ra sổ đã gắn.'}
      </Text>
    </View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: t.paper,
      paddingHorizontal: 28,
    },
    hero: {
      marginTop: 36,
    },
    brand: {
      fontFamily: 'Lora_500Medium',
      fontSize: 15,
      letterSpacing: 1.4,
      color: t.accent,
    },
    title: {
      marginTop: 14,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 32,
      letterSpacing: -0.6,
      color: t.ink,
    },
    lead: {
      marginTop: 10,
      fontFamily: 'Inter_400Regular',
      fontSize: 15,
      lineHeight: 22,
      color: t.ink2,
    },
    switch: {
      marginTop: 28,
      flexDirection: 'row',
      padding: 4,
      borderRadius: 16,
      backgroundColor: t.surface2,
    },
    tab: {
      flex: 1,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabOn: {
      backgroundColor: t.surface,
    },
    tabText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 14,
      color: t.ink3,
    },
    tabTextOn: {
      color: t.ink,
    },
    action: {
      marginTop: 22,
      gap: 12,
    },
    gmail: {
      height: 52,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: t.line,
      backgroundColor: t.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    gmailPressed: {
      backgroundColor: t.surface2,
    },
    gmailDisabled: {
      opacity: 0.7,
    },
    mark: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: '#4285F4',
      alignItems: 'center',
      justifyContent: 'center',
    },
    markLetter: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 13,
      color: '#FFFFFF',
    },
    gmailText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 15,
      color: t.ink,
    },
    error: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      lineHeight: 18,
      color: t.neg,
    },
    note: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12.5,
      lineHeight: 18,
      color: t.ink3,
    },
    warn: {
      marginTop: 22,
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      lineHeight: 21,
      color: t.ink2,
    },
    skip: {
      marginTop: 18,
      alignSelf: 'center',
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    skipText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 14,
      color: t.ink2,
    },
  });
}
