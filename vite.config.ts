import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
    // GitHub Pages serves the app from /<repo-name>/, so built asset URLs need
    // that prefix. The dev server stays at / for convenience.
    base: command === 'build' ? '/norwegian-pronunciation-app/' : '/',
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'og-image.png'],
            manifest: {
                name: 'Norsk uttale — Norwegian pronunciation practice',
                short_name: 'Norsk uttale',
                description:
                    'Say Norwegian phrases out loud and get instant phoneme-level scoring plus a pitch-accent melody chart, entirely in your browser.',
                lang: 'nb',
                theme_color: '#0b1120',
                background_color: '#0b1120',
                display: 'standalone',
                orientation: 'portrait',
                start_url: '.',
                scope: '.',
                categories: ['education'],
                icons: [
                    { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
                    {
                        src: 'icon-maskable-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable',
                    },
                ],
            },
            workbox: {
                // The parallax background art is large; raise the precache
                // ceiling so the installed app still works offline.
                maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
                globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
            },
        }),
    ],
    test: {
        environment: 'jsdom',
        setupFiles: './src/setupTests.ts',
    },
}));
