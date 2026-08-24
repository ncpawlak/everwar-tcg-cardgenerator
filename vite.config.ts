import { defineConfig } from 'vite';

// Vite config for the EverWar card generator.
// Root is the project directory; `assets/` (PSD + OTFs) sits inside root and is
// referenced via `?url` imports so the bundler emits fetchable URLs in dev and build.
// No framework plugins — the app is plain TypeScript + a canvas.
export default defineConfig({
  // Keep the PSD out of the inline-base64 path: assets are always emitted as files.
  assetsInclude: ['**/*.psd', '**/*.otf'],
  build: {
    target: 'es2022',
    // Never inline assets as data URIs (the PSD must resolve to a real URL).
    assetsInlineLimit: 0,
  },
});
