import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectSpeechDiagnostics } from '../speechDiagnostics';

const find = (checks: Awaited<ReturnType<typeof collectSpeechDiagnostics>>, prefix: string) =>
    checks.find(c => c.label.startsWith(prefix));

/**
 * jsdom has neither the Cache API nor Worker, both of which a real browser has.
 * Tests that are not about those supply them here.
 */
function stubBrowser(open: () => Promise<unknown> = async () => ({})) {
    vi.stubGlobal('caches', { open });
    vi.stubGlobal('Worker', class {});
}

afterEach(() => vi.unstubAllGlobals());

describe('collectSpeechDiagnostics', () => {
    it('passes a browser that can actually run the model', async () => {
        stubBrowser();
        vi.stubGlobal('window', { ...window, isSecureContext: true });
        vi.stubGlobal('navigator', {
            ...navigator,
            onLine: true,
            mediaDevices: { getUserMedia: () => Promise.resolve({}) },
            permissions: { query: async () => ({ state: 'granted' }) },
        });

        const checks = await collectSpeechDiagnostics();
        expect(checks.every(c => c.ok)).toBe(true);
        // Nothing to fix means nothing is offered as a fix.
        expect(checks.every(c => c.fix === undefined)).toBe(true);
    });

    /**
     * The bug this replaces: the old checks told Firefox users to install
     * Chrome, because the Web Speech API did not exist there. The model does.
     */
    it('does not judge the browser at all', async () => {
        stubBrowser();
        vi.stubGlobal('window', { ...window, isSecureContext: true });
        vi.stubGlobal('navigator', {
            ...navigator,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
            onLine: true,
            mediaDevices: { getUserMedia: () => Promise.resolve({}) },
            permissions: { query: async () => ({ state: 'granted' }) },
        });

        const checks = await collectSpeechDiagnostics();
        // Nothing may name another browser to go and install — that was the bug.
        expect(checks.some(c => /chrome|edge|safari|firefox/i.test(c.fix ?? ''))).toBe(false);
        expect(checks.every(c => c.ok)).toBe(true);
    });

    it('flags a denied microphone with the fix', async () => {
        stubBrowser();
        vi.stubGlobal('window', { ...window, isSecureContext: true });
        vi.stubGlobal('navigator', {
            ...navigator,
            onLine: true,
            mediaDevices: { getUserMedia: () => Promise.resolve({}) },
            permissions: { query: async () => ({ state: 'denied' }) },
        });

        const check = find(await collectSpeechDiagnostics(), 'Microphone permission');
        expect(check?.ok).toBe(false);
        expect(check?.fix).toMatch(/Site settings/i);
    });

    it('flags an insecure origin, which no microphone will work on', async () => {
        stubBrowser();
        vi.stubGlobal('window', { ...window, isSecureContext: false });
        const check = find(await collectSpeechDiagnostics(), 'Secure connection');
        expect(check?.ok).toBe(false);
        expect(check?.fix).toMatch(/HTTPS/i);
    });

    it('warns when the model cannot be cached between visits', async () => {
        stubBrowser(() => Promise.reject(new Error('blocked')));
        vi.stubGlobal('window', { ...window, isSecureContext: true });
        const check = find(await collectSpeechDiagnostics(), 'Model storage');
        expect(check?.ok).toBe(false);
        expect(check?.fix).toMatch(/downloaded again/i);
    });

    it('mentions the network only while offline, since that is the one thing it blocks', async () => {
        stubBrowser();
        vi.stubGlobal('window', { ...window, isSecureContext: true });
        vi.stubGlobal('navigator', { ...navigator, onLine: false });
        const offline = find(await collectSpeechDiagnostics(), 'Network');
        expect(offline?.ok).toBe(false);
        expect(offline?.fix).toMatch(/first download/i);

        vi.stubGlobal('navigator', { ...navigator, onLine: true });
        expect(find(await collectSpeechDiagnostics(), 'Network')).toBeUndefined();
    });
});
