/**
 * Why recognition might not be working on this device.
 *
 * "Speech recognition was blocked" on its own is a dead end for a learner, and
 * worse on someone else's phone where you cannot open developer tools. These
 * checks turn it into something actionable.
 *
 * The list changed shape when recognition moved on-device. It used to be
 * dominated by which browser you were in, because the Web Speech API was a
 * vendor service reached through the browser: Firefox never implemented it,
 * several Chromium forks shipped the interface without access to the service,
 * and an installed shortcut was often refused outright. None of that applies to
 * a model running in this page — every browser with a microphone can run it —
 * so what is left is the microphone itself and whether the model can be fetched
 * and kept.
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
 * Whether the model can be kept between visits.
 *
 * transformers.js stores the weights in the Cache API. Private windows and
 * "block site data" settings make that fail silently, and the only symptom is
 * that the learner re-downloads 40 MB every single session — worth naming.
 */
async function modelCacheCheck(): Promise<SpeechDiagnostic> {
    if (typeof caches === 'undefined') {
        return {
            label: 'Model storage',
            ok: false,
            fix: 'This browser will not let the page store the speech model, so it has to be downloaded again each visit.',
        };
    }
    try {
        await caches.open('npa-storage-probe');
        return { label: 'Model storage', ok: true };
    } catch {
        return {
            label: 'Model storage',
            ok: false,
            fix: 'Site storage is blocked — often a private window. The speech model will be downloaded again each visit.',
        };
    }
}

export async function collectSpeechDiagnostics(): Promise<SpeechDiagnostic[]> {
    const out: SpeechDiagnostic[] = [];

    out.push({
        label: 'Secure connection',
        ok: window.isSecureContext,
        fix: window.isSecureContext ? undefined : 'The page must be served over HTTPS to use the microphone.',
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

    // TypeScript types getUserMedia as always present, so the check has to be
    // made at runtime against the actual object — which on an insecure origin,
    // or in an old WebView, is genuinely missing.
    const hasMicrophone = typeof navigator.mediaDevices?.getUserMedia === 'function';
    out.push({
        label: 'Microphone available',
        ok: hasMicrophone,
        fix: hasMicrophone ? undefined : 'This browser exposes no microphone to the page.',
    });

    const canRunModel = typeof WebAssembly !== 'undefined' && typeof Worker !== 'undefined';
    out.push({
        label: 'Runs the speech model',
        ok: canRunModel,
        fix: canRunModel
            ? undefined
            : 'Recognition needs WebAssembly and web workers, which this browser has disabled.',
    });

    out.push(await modelCacheCheck());

    // Only worth mentioning while the model has yet to be fetched: once it is
    // cached, being offline is fine, which is rather the point.
    if (typeof navigator.onLine === 'boolean' && !navigator.onLine) {
        out.push({
            label: 'Network',
            ok: false,
            fix: 'You are offline. That is fine once the speech model has been downloaded once, but the first download needs a connection.',
        });
    }

    return out;
}
