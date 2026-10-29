import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Cùng alias "@/*" với tsconfig, để test nạp được các module thuần trong lib/.
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
