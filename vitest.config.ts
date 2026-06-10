import { defineConfig, mergeConfig, coverageConfigDefaults } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/lib/shared/**'],
        // DB bootstrap and the static provider catalog are integration plumbing,
        // not the pure math the thresholds are meant to guard
        exclude: [
          ...coverageConfigDefaults.exclude,
          'src/lib/shared/db-schema.ts',
          'src/lib/shared/seed.ts',
          'src/lib/shared/provider-catalog.ts'
        ],
        thresholds: {
          lines: 80,
          functions: 80,
          branches: 65
        }
      }
    }
  })
);
