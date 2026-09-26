import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectSpeechDiagnostics } from '../speechDiagnostics';

const find = (checks: Awaited<ReturnType<typeof collectSpeechDiagnostics>>, prefix: string) =>
    checks.find(c => c.label.startsWith(prefix));

/**
 * jsdom has no speech recognition service, which a supported browser does.
 * Tests that are not about that supply one here.
 */
function stubBrowser() {
    vi.stubGlobal('webkitSpeechRecognition', class {});
}

afterEach(() => vi.unstubAllGlobals());

describe('collectSpeechDiagnostics', () => {
    it('passes a browser with a microphone and a speech service', async () => {
        stubBrowser();
        vi.stubGlobal('window', { ...window, isSecureContext: true, webkitSpeechRecognition: class {} });
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
     * The browser matters again. It stopped mattering when recognition moved
     * into the page, and started again when that model was removed — so a
     * browser without a speech service must be told so plainly rather than
     * left with a microphone button that looks fine and does nothing.
     */
    it('names the missing speech service, and which browsers have one', async () => {
        vi.stubGlobal('window', { ...window, isSecureContext: true });
        vi.stubGlobal('navigator', {
            ...navigator,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
            onLine: true,
            mediaDevices: { getUserMedia: () => Promise.resolve({}) },
            permissions: { query: async () => ({ state: 'granted' }) },
        });

        const check = find(await collectSpeechDiagnostics(), 'Speech recognition service');
        expect(check?.ok).toBe(false);
        expect(check?.fix).toMatch(/Firefox/);
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


    it('mentions the network only while offline, since recognition needs it', async () => {
        stubBrowser();
        vi.stubGlobal('window', { ...window, isSecureContext: true });
        vi.stubGlobal('navigator', { ...navigator, onLine: false });
        const offline = find(await collectSpeechDiagnostics(), 'Network');
        expect(offline?.ok).toBe(false);
        expect(offline?.fix).toMatch(/needs a connection/i);

        vi.stubGlobal('navigator', { ...navigator, onLine: true });
        expect(find(await collectSpeechDiagnostics(), 'Network')).toBeUndefined();
    });
});
