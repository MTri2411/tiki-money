import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

export const supabaseConfigured = Boolean(url && key);

class StaticRenderWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly readyState = StaticRenderWebSocket.CLOSED;
  constructor(_url: string | URL, _protocols?: string | string[]) {}
  close() {}
  send() {}
  addEventListener() {}
  removeEventListener() {}
}

const realtimeTransport =
  (globalThis.WebSocket ?? StaticRenderWebSocket) as unknown as typeof WebSocket;
const serverStorage = {
  getItem: async (_key: string) => null,
  setItem: async (_key: string, _value: string) => {},
  removeItem: async (_key: string) => {},
};
const authStorage = typeof window === 'undefined' ? serverStorage : AsyncStorage;

export const supabase = createClient(
  url || 'https://invalid.supabase.co',
  key || 'missing-publishable-key',
  {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: typeof window !== 'undefined',
      flowType: 'pkce',
    },
    realtime: {
      transport: realtimeTransport,
    },
  }
);
