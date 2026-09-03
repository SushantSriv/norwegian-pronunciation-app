import { useState } from 'react';
import {
    cloudSpeechAllowed,
    setCloudSpeechAllowed,
    webSpeechAvailable,
} from '../utils/webSpeech';

interface Props {
    /** Which engine answered the last attempt, when one has. */
    engine: 'cloud' | 'local' | null;
}

/**
 * The speed-versus-privacy choice, made by the learner rather than for them.
 *
 * The browser's own recognition is faster and more accurate than the model this
 * app carries, and it works by sending the recording to Google, Microsoft or
 * Apple. That is a real trade and neither answer is obviously right, so it is
 * offered plainly and defaults to the private one.
 *
 * Hidden entirely in browsers with no such service — Firefox, most of iOS —
 * because a switch that does nothing is worse than no switch.
 */
export function SpeechEnginePicker({ engine }: Props) {
    const [allowed, setAllowed] = useState(cloudSpeechAllowed);
    if (!webSpeechAvailable()) return null;

    const choose = (next: boolean) => {
        setCloudSpeechAllowed(next);
        setAllowed(next);
    };

    return (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-white/45">
                    Recognition
                </span>
                {engine && (
                    <span className="text-[10px] uppercase tracking-wide text-white/35">
                        last attempt: {engine === 'cloud' ? 'browser service' : 'on device'}
                    </span>
                )}
            </div>

            <div className="mt-2 flex gap-2">
                <button
                    onClick={() => choose(false)}
                    aria-pressed={!allowed}
                    className={`flex-1 rounded-lg border px-3 py-2 text-left text-xs transition ${
                        !allowed
                            ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100'
                            : 'border-white/15 text-white/60 hover:bg-white/5'
                    }`}
                >
                    <span className="block font-semibold">On this device</span>
                    <span className="block text-[11px] opacity-70">
                        Nothing is uploaded. Slower, and mis-hears more.
                    </span>
                </button>

                <button
                    onClick={() => choose(true)}
                    aria-pressed={allowed}
                    className={`flex-1 rounded-lg border px-3 py-2 text-left text-xs transition ${
                        allowed
                            ? 'border-sky-400/40 bg-sky-400/10 text-sky-100'
                            : 'border-white/15 text-white/60 hover:bg-white/5'
                    }`}
                >
                    <span className="block font-semibold">Browser service</span>
                    <span className="block text-[11px] opacity-70">
                        Faster and more accurate. Sends your recording to your browser
                        vendor.
                    </span>
                </button>
            </div>

            {allowed && (
                <p className="mt-2 text-[11px] leading-relaxed text-amber-200/70">
                    Your recordings go to Google, Microsoft or Apple to be transcribed, exactly as
                    they do on any site using the browser&rsquo;s speech API. Scoring, pitch and
                    melody still run only on your device. Per-word melody is unavailable on this
                    path, because the service reports no word timings.
                </p>
            )}
        </div>
    );
}
