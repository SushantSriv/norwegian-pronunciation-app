import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Where the built app will be served from.
 *
 * Cloudflare Pages (and a custom domain) serve from the root, so '/' is the
 * default. GitHub Pages serves from /<repo>/ and needs VITE_BASE_PATH set to
 * match, otherwise every asset URL 404s.
 */
const DEFAULT_BASE = '/';

/** Absolute origin, needed because social crawlers do not resolve relative URLs. */
const DEFAULT_SITE_URL = 'https://norwegian-pronunciation-app.sushantsrivastava198.workers.dev';

export default defineConfig(({ command, mode }) => {
    const env = loadEnv(mode, '.', 'VITE_');
    const base = command === 'build' ? (env.VITE_BASE_PATH || DEFAULT_BASE) : '/';
    const siteUrl = (env.VITE_SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, '');

    return {
        base,
        plugins: [
            react(),
            {
                // index.html carries absolute Open Graph URLs. Rather than hard-code
                // a domain, substitute it at build time so moving hosts is one env var.
                name: 'inject-site-url',
                transformIndexHtml(html: string) {
                    return html.replaceAll('__SITE_URL__', siteUrl);
                },
            },
            VitePWA({
                registerType: 'autoUpdate',
                includeAssets: [
                    'icon-192.png',
                    'icon-512.png',
                    'icon-maskable-512.png',
                    'og-image.png',
                ],
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
    };
});
