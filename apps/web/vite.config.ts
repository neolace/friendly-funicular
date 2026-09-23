/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const REQUIRED = [
  'VITE_ENTRA_TENANT_ID',
  'VITE_ENTRA_CLIENT_ID',
  'VITE_ENTRA_API_SCOPE',
  'VITE_API_BASE_URL',
] as const;

// Anything prefixed VITE_ ships to the browser. Refuse names that suggest a
// secret so one can never be bundled by accident.
const SECRET_LIKE = /SECRET|PASSWORD|PRIVATE|ACCESS_KEY|CREDENTIAL|CERT/i;

function environmentGuard(mode: string): Plugin {
  return {
    name: 'environment-guard',
    apply: 'build',
    configResolved() {
      const env = loadEnv(mode, process.cwd(), 'VITE_');
      const secretLike = Object.keys(env).filter((k) => SECRET_LIKE.test(k));
      if (secretLike.length > 0) {
        throw new Error(
          `Refusing to build: browser-exposed variables look like secrets: ${secretLike.join(', ')}`,
        );
      }
      const missing = REQUIRED.filter((k) => !env[k]);
      if (missing.length > 0) {
        throw new Error(
          `Refusing to build: missing required variables: ${missing.join(', ')}`,
        );
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), environmentGuard(mode)],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    sourcemap: true,
    rolldownOptions: {
      output: {
        // Long-lived vendor chunks cache well across app releases.
        codeSplitting: {
          groups: [
            { name: 'msal', test: /node_modules[\\/]@azure[\\/]msal/ },
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|react-router|scheduler)/,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/main.tsx'],
      reporter: ['text', 'lcov'],
    },
  },
}));
