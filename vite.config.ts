import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
    // GitHub Pages serves the app from /<repo-name>/, so built asset URLs need
    // that prefix. The dev server stays at / for convenience.
    base: command === 'build' ? '/norwegian-pronunciation-app/' : '/',
    plugins: [react()],
    test: {
        environment: 'jsdom',
        setupFiles: './src/setupTests.ts',
    },
}));
