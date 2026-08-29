/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Свой service worker (в нём же — веб-пуши), Workbox только докладывает
      // в него список файлов для прекэша.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // Новая версия ждёт подтверждения — показываем тост «Обновить».
      registerType: 'prompt',
      injectRegister: false,
      // manifest.webmanifest ведём руками (public/), плагин его не трогает.
      manifest: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,woff2,png,webmanifest}'],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    host: true,
    port: 5173,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
})
