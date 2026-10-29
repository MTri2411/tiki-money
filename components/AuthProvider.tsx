import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as Linking from 'expo-linking';

import { clearAccount, loadAccount, saveAccount, type Account } from '@/lib/account';
import { completeAuthRedirect } from '@/lib/google';
import { supabase, supabaseConfigured } from '@/lib/supabase';

type AuthContextValue = {
  account: Account | null;
  ready: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      if (!supabaseConfigured) return loadAccount();
      const { data } = await supabase.auth.getSession();
      return accountFromUser(data.session?.user);
    };
    bootstrap()
      .then(async (stored) => {
        if (!mounted) return;
        setAccount(stored);
      })
      .finally(() => {
        if (mounted) setReady(true);
      });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = accountFromUser(session?.user);
      setAccount(next);
      if (next) void saveAccount(next);
      else void clearAccount();
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const apply = (url: string | null) => {
      if (!url || !supabaseConfigured) return;
      void completeAuthRedirect(url).catch((err) => {
        if (__DEV__) console.error('[auth] redirect failed', err);
      });
    };
    void Linking.getInitialURL().then(apply);
    const subscription = Linking.addEventListener('url', ({ url }) => apply(url));
    return () => subscription.remove();
  }, []);

  const signOut = useCallback(async () => {
    if (supabaseConfigured) await supabase.auth.signOut();
    await clearAccount();
    setAccount(null);
  }, []);

  const value = useMemo(() => ({ account, ready, signOut }), [account, ready, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function accountFromUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null | undefined): Account | null {
  if (!user) return null;
  const meta = user.user_metadata ?? {};
  const email = user.email ?? (typeof meta.email === 'string' ? meta.email : '');
  const name =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    email.split('@')[0] ||
    'Bạn';
  const picture =
    (typeof meta.avatar_url === 'string' && meta.avatar_url) ||
    (typeof meta.picture === 'string' && meta.picture) ||
    null;
  return { id: user.id, name, email, picture };
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return value;
}
