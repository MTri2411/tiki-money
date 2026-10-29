import { describe, expect, it } from 'vitest';

import { readAuthCallback } from '../lib/auth-callback';

describe('địa chỉ quay lại sau Google', () => {
  it('đọc mã PKCE trên query', () => {
    expect(readAuthCallback('exp://192.168.1.10:8090?code=abc')).toEqual({ kind: 'code', code: 'abc' });
  });

  it('đọc token trong hash', () => {
    expect(readAuthCallback('tikimoney://#access_token=a&refresh_token=b')).toEqual({
      kind: 'session',
      accessToken: 'a',
      refreshToken: 'b',
    });
  });

  it('đọc lỗi uỷ quyền', () => {
    expect(readAuthCallback('tikimoney://?error=invalid_request&error_description=redirect%20not%20allowed')).toEqual({
      kind: 'error',
      message: 'redirect not allowed',
    });
  });

  it('bỏ qua địa chỉ không phải phiên', () => {
    expect(readAuthCallback('exp://192.168.1.10:8090')).toBeNull();
    expect(readAuthCallback('không phải url')).toBeNull();
  });
});
