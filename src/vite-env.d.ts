/// <reference types="vite/client" />

// Asset URL module declarations. Vite turns these `?url` imports into fetchable
// URLs (emitted as real files, never inlined) for the PSD and OTF fonts.
declare module '*.psd?url' {
  const url: string;
  export default url;
}
declare module '*.otf?url' {
  const url: string;
  export default url;
}
