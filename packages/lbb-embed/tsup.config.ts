import { defineConfig } from 'tsup'

export default defineConfig([
  { entry: { index: 'src/index.ts' }, format: ['esm', 'cjs'], dts: true, clean: true, target: 'es2019', platform: 'browser' },
  // Script-tag build: <script src="https://unpkg.com/@apptaptap/lbb-embed/dist/lbb-embed.global.js"> → window.LBBEmbed
  { entry: { 'lbb-embed': 'src/index.ts' }, format: ['iife'], globalName: 'LBBEmbed', minify: true, target: 'es2019', platform: 'browser' },
  { entry: { react: 'src/react.tsx' }, format: ['esm', 'cjs'], dts: true, target: 'es2019', platform: 'browser', external: ['react', 'react/jsx-runtime'], banner: { js: '"use client";' } },
  { entry: { server: 'src/server.ts' }, format: ['esm', 'cjs'], dts: true, target: 'node18', platform: 'node' },
])
