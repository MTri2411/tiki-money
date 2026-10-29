import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'tiki.account';

export type Account = {
  id: string;
  name: string;
  email: string;
  picture: string | null;
};

function parseAccount(raw: string | null): Account | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Account>;
    if (typeof value.id !== 'string' || !value.id) return null;
    if (typeof value.name !== 'string' || !value.name) return null;
    if (typeof value.email !== 'string' || !value.email) return null;
    return {
      id: value.id,
      name: value.name,
      email: value.email,
      picture: typeof value.picture === 'string' && value.picture ? value.picture : null,
    };
  } catch {
    return null;
  }
}

async function readRaw() {
  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(KEY);
  }
  return SecureStore.getItemAsync(KEY);
}

async function writeRaw(value: string | null) {
  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') return;
    if (value === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, value);
    return;
  }
  if (value === null) await SecureStore.deleteItemAsync(KEY);
  else await SecureStore.setItemAsync(KEY, value);
}

export async function loadAccount() {
  return parseAccount(await readRaw());
}

export async function saveAccount(account: Account) {
  await writeRaw(JSON.stringify(account));
}

export async function clearAccount() {
  await writeRaw(null);
}
