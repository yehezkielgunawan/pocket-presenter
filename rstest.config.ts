import { withRsbuildConfig } from '@rstest/adapter-rsbuild';
import { defineConfig } from '@rstest/core';

// Docs: https://rstest.rs/config/
export default defineConfig({
  extends: withRsbuildConfig(),
  testEnvironment: 'jsdom',
  include: ['tests/**/*.test.{ts,tsx}'],
  exclude: ['tests/workers/**'],
  setupFiles: ['./tests/rstest.setup.ts'],
});
