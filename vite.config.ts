import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
    // GitHub Pages serves the app from /<repo-name>/, so built asset URLs need
    // that prefix. The dev server stays at / for convenience.
    base: command === 'build' ? '/norwegian-pronunciation-app/' : '/',
    // transformers.js and ONNX Runtime Web ship their own WASM and worker
    // assets. Pre-bundling rewrites the URLs they use to find those at runtime,
    // so the dependency is left alone and served as published.
    optimizeDeps: { exclude: ['@huggingface/transformers'] },
    // Cross-origin isolation unlocks SharedArrayBuffer, which is what lets ONNX
    // Runtime use more than one WASM thread. 'credentialless' rather than
    // 'require-corp' so the model can still be fetched from the Hugging Face
    // CDN, which does not send a CORP header.
    server: {
        headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'credentialless',
        },
    },
    worker: { format: 'es' as const },
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            // og-image.png is deliberately absent: only crawlers fetch it.
            includeAssets: ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
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
                // Supplies COOP/COEP so the page is cross-origin isolated and
                // ONNX Runtime can use more than one WASM thread. GitHub Pages
                // cannot set response headers; a service worker can. See
                // public/coi.js for the measurements that justify it.
                importScripts: ['coi.js'],
                // The parallax background art is large; raise the precache
                // ceiling so the installed app still works offline.
                maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
                // Note the absence of `wasm`. ONNX Runtime's binary is 22 MB
                // (5.7 MB over the wire), and precaching it would put all of
                // that in front of the first page load for a learner who has
                // not pressed the microphone yet. It is cached on first use
                // instead, by the rule below.
                globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
                runtimeCaching: [
                    {
                        // Fetched once, when the speech model first starts, and
                        // then served from cache forever — including offline,
                        // which is the whole reason recognition moved on-device.
                        urlPattern: ({ url }) => url.pathname.endsWith('.wasm'),
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'onnx-runtime',
                            expiration: { maxEntries: 4 },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                ],
                // The model weights themselves are not handled here at all:
                // transformers.js fetches them from the Hugging Face CDN and
                // keeps them in its own Cache Storage entry, which already
                // survives reloads and works offline.
            },
        }),
    ],
    test: {
        environment: 'jsdom',
        setupFiles: './src/setupTests.ts',
    },
}));
