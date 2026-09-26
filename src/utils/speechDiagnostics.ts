/**
 * Why recognition might not be working on this device.
 *
 * "Speech recognition was blocked" on its own is a dead end for a learner, and
 * worse on someone else's phone where you cannot open developer tools. These
 * checks turn it into something actionable.
 *
 * The list has changed shape twice. It was dominated by which browser you were
 * in, because recognition was the Web Speech API; then recognition moved to a
 * model inside the page and the browser stopped mattering; and now the model is
 * gone and the browser matters again. So the first question is back to being
 * the hard one: does this browser have a speech service at all.
 */
import { cloudTakesMicrophone, webSpeechAvailable } from './webSpeech';

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

    // The one that rules whole browsers out. Firefox has never enabled its
    // speech service, so naming it plainly beats a microphone button that
    // looks fine and does nothing.
    const hasService = webSpeechAvailable();
    out.push({
        label: 'Speech recognition service',
        ok: hasService,
        fix: hasService
            ? undefined
            : 'This browser has no speech recognition service. Chrome, Edge and Safari do; Firefox does not.',
    });

    if (hasService && cloudTakesMicrophone()) {
        out.push({
            label: 'Microphone shared with recognition',
            ok: false,
            fix: 'On this device the speech service takes the microphone for itself, so the pitch and melody charts cannot be drawn. Scoring still works.',
        });
    }

    // Recognition is a network service now. There is no offline path: the
    // on-device model that used to provide one has been removed.
    if (typeof navigator.onLine === 'boolean' && !navigator.onLine) {
        out.push({
            label: 'Network',
            ok: false,
            fix: 'You are offline. Recognition is provided by the browser, which needs a connection.',
        });
    }

    return out;
}
