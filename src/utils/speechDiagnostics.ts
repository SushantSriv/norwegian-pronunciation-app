/**
 * Why speech recognition might be refused on this device.
 *
 * "Speech recognition was blocked" on its own is a dead end for a learner, and
 * worse on someone else's phone where you cannot open developer tools. These
 * checks turn it into something actionable.
 */

export interface SpeechDiagnostic {
    /** Short label shown to the learner. */
    label: string;
    ok: boolean;
    /** What to do about it, when there is something to do. */
    fix?: string;
}

/** True when the page is running as an installed app rather than a browser tab. */
export function isStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
    return window.matchMedia?.('(display-mode: standalone)').matches === true || iosStandalone;
}

/**
 * Chromium browsers other than Chrome itself frequently ship the Web Speech API
 * without access to the speech service behind it, which surfaces as
 * `service-not-allowed` no matter what the user permits.
 */
function browserNote(): SpeechDiagnostic | null {
    const ua = navigator.userAgent;
    const isChromium = /Chrome|Chromium|CriOS/i.test(ua);
    const knownLimited = /SamsungBrowser|Brave|Vivaldi|OPR|YaBrowser|DuckDuckGo|Firefox|FxiOS/i.test(ua);

    if (knownLimited) {
        return {
            label: 'Browser',
            ok: false,
            fix: 'This browser usually cannot reach the speech service. Open the site in Chrome.',
        };
    }
    if (!isChromium) {
        return { label: 'Browser', ok: false, fix: 'Speech recognition needs Chrome or Edge.' };
    }
    return { label: 'Browser', ok: true };
}

export async function collectSpeechDiagnostics(): Promise<SpeechDiagnostic[]> {
    const out: SpeechDiagnostic[] = [];

    out.push({
        label: 'Secure connection',
        ok: window.isSecureContext,
        fix: window.isSecureContext ? undefined : 'The page must be served over HTTPS.',
    });

    // Permission may be unqueryable; that is not itself a failure.
    let permission = 'unknown';
    try {
        const status = await navigator.permissions?.query({ name: 'microphone' as PermissionName });
        permission = status?.state ?? 'unknown';
    } catch {
        permission = 'unknown';
    }
    out.push({
        label: `Microphone permission: ${permission}`,
        ok: permission !== 'denied',
        fix:
            permission === 'denied'
                ? 'Allow the microphone for this site: tap the padlock or ⋮ menu → Site settings → Microphone.'
                : undefined,
    });

    if (isStandalone()) {
        out.push({
            label: 'Running as an installed app',
            ok: false,
            fix: 'Installed shortcuts often cannot use the speech service. Open the site in a normal Chrome tab instead.',
        });
    }

    const note = browserNote();
    if (note) out.push(note);

    return out;
}
