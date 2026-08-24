import { describe, expect, it, vi, afterEach } from 'vitest';

/** Swap the user agent, then load the module fresh so it reads the new value. */
async function noteFor(ua: string) {
    vi.stubGlobal('navigator', { ...navigator, userAgent: ua });
    vi.resetModules();
    const mod = await import('../speechDiagnostics');
    vi.stubGlobal('window', { ...window, isSecureContext: true, matchMedia: () => ({ matches: false }) });
    const checks = await mod.collectSpeechDiagnostics();
    return checks.find(c => c.label === 'Browser') ?? null;
}

const SAFARI_MAC =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const SAFARI_IPAD =
    'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const CHROME =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';
const BRAVE =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Brave/131';

afterEach(() => vi.unstubAllGlobals());

describe('browser diagnosis', () => {
    // Safari implements the API against Apple's speech services. Telling a
    // Safari user to go and install Chrome would be wrong, and was the bug.
    it.each([
        ['Safari on macOS', SAFARI_MAC],
        ['Safari on iPad', SAFARI_IPAD],
        ['Chrome', CHROME],
    ])('does not report %s as unsupported', async (_name, ua) => {
        const note = await noteFor(ua);
        expect(note?.ok).toBe(true);
    });

    it('flags Firefox, which has no implementation at all', async () => {
        const note = await noteFor(FIREFOX);
        expect(note?.ok).toBe(false);
        expect(note?.fix).toMatch(/Firefox/i);
    });

    it('flags Chromium forks that cannot reach a speech service', async () => {
        const note = await noteFor(BRAVE);
        expect(note?.ok).toBe(false);
    });

    it('never tells a working browser to switch to a different one', async () => {
        for (const ua of [SAFARI_MAC, SAFARI_IPAD, CHROME]) {
            const note = await noteFor(ua);
            expect(note?.fix).toBeUndefined();
        }
    });
});
