import { defineConfig } from 'vitest/config';

// Vitest config. Default environment is `node` for pure-logic and pixel tests
// (pixel tests render through @napi-rs/canvas, a dev-only dependency). UI/export
// tests opt into jsdom per-file via a `// @vitest-environment jsdom` pragma.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
