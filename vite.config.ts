import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
/**
 * Where the built app will be served from.
 *
 * GitHub Pages serves a project site from /<repo-name>/, so asset URLs need
 * that prefix. A custom domain — on Cloudflare Pages or anywhere else — serves
 * from the root instead, and the same build would then ask for every asset one
 * directory too deep.
 *
 * So it is an environment variable with the Pages path as its default: nothing
 * changes for the existing deployment, and deploying to a domain is
 * VITE_BASE=/ rather than a code change. The manifest's start_url and scope are
 * already relative, so they follow along.
 */
const BASE = process.env.VITE_BASE ?? '/norwegian-pronunciation-app/';

/**
 * The public address, for link previews only.
 *
 * Open Graph and Twitter cards must carry absolute URLs — crawlers do not
 * resolve relative ones — so these are the only URLs in the app that cannot
 * simply follow the base path. Hard-coded, they meant every link shared from a
 * new domain advertised the old one.
 *
 * The default is the intended home, saynorwegian.app, rather than whichever
 * address happens to be serving. That is deliberate: previews and the canonical
 * link should point at the address people are meant to keep, and the app is
 * currently live at three (GitHub Pages, workers.dev, and a stale Vercel copy).
 * Pointing them all at one consolidates the site rather than competing with it.
 *
 * Until that domain resolves, `npm run check:deploy` reports the preview image
 * as unreachable. That is correct, and it clears itself the moment DNS is live.
 */
const SITE_URL = (process.env.VITE_SITE_URL ?? 'https://saynorwegian.app/').replace(/\/?$/, '/');

/**
 * Substitute %BASE_URL% and %SITE_URL% in index.html.
 *
 * Done here rather than relying on Vite's own %VITE_*% replacement so that both
 * have a guaranteed default: a placeholder that survives into the built HTML
 * is a broken icon or a broken link preview, and neither announces itself.
 */
const htmlEnv = () => ({
    name: 'html-env',
    transformIndexHtml: {
        order: 'pre' as const,
        handler: (html: string) =>
            html.replaceAll('%BASE_URL%', BASE).replaceAll('%SITE_URL%', SITE_URL),
    },
});

export default defineConfig(({ command }) => ({
    base: command === 'build' ? BASE : '/',
    plugins: [
        htmlEnv(),
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
