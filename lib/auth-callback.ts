export type AuthCallback =
  | { kind: 'code'; code: string }
  | { kind: 'session'; accessToken: string; refreshToken: string }
  | { kind: 'error'; message: string };

export function readAuthCallback(url: string): AuthCallback | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const query = parsed.searchParams;
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const get = (key: string) => hash.get(key) || query.get(key) || '';
  const message = get('error_description') || get('error');
  if (message) return { kind: 'error', message };
  const code = get('code');
  if (code) return { kind: 'code', code };
  const accessToken = get('access_token');
  const refreshToken = get('refresh_token');
  if (accessToken && refreshToken) return { kind: 'session', accessToken, refreshToken };
  return null;
}
