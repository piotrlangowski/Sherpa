import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/lib/shared/**'],
        thresholds: {
          lines: 80,
          functions: 80,
          branches: 65
        }
      }
    }
  })
);
