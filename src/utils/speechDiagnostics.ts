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
 * Which engine a browser can reach differs, and getting this wrong sends a
 * learner to a browser they do not have. Safari implements the API against
 * Apple's own speech services and works; Firefox does not implement it at all;
 * several Chromium forks ship the API without access to the service behind it,
 * which surfaces as `service-not-allowed` no matter what the user permits.
 */
function browserNote(): SpeechDiagnostic | null {
    const ua = navigator.userAgent;
    // Safari must be tested before Chromium: Chrome on iOS is WebKit underneath
    // and every iOS browser carries "Safari" in its user agent.
    const isSafari = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua);
    const isChromium = /Chrome|Chromium|CriOS|Edg/i.test(ua);
    const cannotReachService = /SamsungBrowser|Brave|Vivaldi|OPR|YaBrowser|DuckDuckGo/i.test(ua);
    const noImplementation = /Firefox|FxiOS/i.test(ua);

    if (noImplementation) {
        return {
            label: 'Browser',
            ok: false,
            fix: 'Firefox does not implement speech recognition. Use Chrome, Edge or Safari.',
        };
    }
    if (cannotReachService) {
        return {
            label: 'Browser',
            ok: false,
            fix: 'This browser usually cannot reach a speech service. Try Chrome, Edge or Safari.',
        };
    }
    // Safari and the Chromium family both work; anything else is unknown rather
    // than known-broken, so do not claim it fails.
    if (isSafari || isChromium) return { label: 'Browser', ok: true };
    return null;
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
