import { makeRedirectUri } from 'expo-auth-session';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { readAuthCallback } from '@/lib/auth-callback';
import { supabase } from '@/lib/supabase';

const handled = new Set<string>();

export function gmailRedirectUri() {
  if (Platform.OS === 'web') return makeRedirectUri({ scheme: 'tikimoney', path: 'dang-nhap' });
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return 'exp://oauthredirect';
  return 'tikimoney://oauthredirect';
}

export async function completeAuthRedirect(url: string): Promise<'done' | 'empty' | 'already'> {
  const callback = readAuthCallback(url);
  if (!callback) return 'empty';
  if (callback.kind === 'error') throw new Error(callback.message);
  const key = callback.kind === 'code' ? callback.code : callback.accessToken;
  if (handled.has(key)) return 'already';
  handled.add(key);
  try {
    if (callback.kind === 'code') {
      const { error } = await supabase.auth.exchangeCodeForSession(callback.code);
      if (error) throw error;
    } else {
      const { error } = await supabase.auth.setSession({
        access_token: callback.accessToken,
        refresh_token: callback.refreshToken,
      });
      if (error) throw error;
    }
    return 'done';
  } catch (err) {
    handled.delete(key);
    throw err;
  }
}

export async function signInWithGmail(): Promise<'ok' | 'cancel'> {
  const redirectTo = gmailRedirectUri();
  const queryParams = { prompt: 'select_account', hl: 'vi' };
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: Platform.OS !== 'web',
      queryParams,
    },
  });
  if (error) throw error;
  if (Platform.OS === 'web') return 'ok';
  if (!data.url) throw new Error('Supabase không tạo được đường dẫn Google.');
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type === 'cancel' || result.type === 'dismiss') return 'cancel';
  if (result.type !== 'success') throw new Error('Không đăng nhập được bằng Gmail.');
  const outcome = await completeAuthRedirect(result.url);
  if (outcome === 'empty') throw new Error('Google không trả về phiên đăng nhập.');
  return 'ok';
}

export function authFailureMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : '';
  const lower = raw.toLowerCase();
  if (lower.includes('redirect') || lower.includes('not allowed')) {
    return 'Supabase chưa cho phép đường dẫn quay lại. Thêm exp://** và tikimoney://** trong Authentication → URL Configuration.';
  }
  if (lower.includes('provider') && (lower.includes('not enabled') || lower.includes('unsupported'))) {
    return 'Google chưa được bật trên Supabase.';
  }
  return 'Không đăng nhập được bằng Gmail. Thử lại nhé.';
}
