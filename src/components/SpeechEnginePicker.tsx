import { useState } from 'react';
import {
    cloudSpeechAllowed,
    cloudSpeechDecided,
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
 * Apple. It is now the default, because the carried model mis-hears people
 * often enough to teach them to distrust the score — see webSpeech.ts.
 *
 * Defaulting to it puts an obligation here rather than removing one: until the
 * learner has actually chosen, this says what is happening in the open and
 * asks them to acknowledge it. A default that uploads someone's voice silently
 * is not a default, it is a trick.
 *
 * Hidden entirely in browsers with no such service — Firefox, most of iOS —
 * because a switch that does nothing is worse than no switch.
 */
export function SpeechEnginePicker({ engine }: Props) {
    const [allowed, setAllowed] = useState(cloudSpeechAllowed);
    const [decided, setDecided] = useState(cloudSpeechDecided);
    if (!webSpeechAvailable()) return null;

    const choose = (next: boolean) => {
        setCloudSpeechAllowed(next);
        setAllowed(next);
        setDecided(true);
    };

    return (
        <div
            className={
                decided
                    ? 'rounded-xl border border-white/10 bg-white/[0.04] p-3'
                    : 'rounded-xl border border-sky-300/30 bg-sky-400/[0.07] p-3'
            }
        >
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
                        Nothing is uploaded. Slower, and mis-hears more — but it is the only
                        path with per-word melody.
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
                    <span className="block font-semibold">
                        Browser service
                        <span className="ml-1.5 font-normal opacity-60">· default</span>
                    </span>
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

            {/* Shown until the learner has actually chosen. A default that
                uploads someone's voice without ever saying so is not a default. */}
            {!decided && allowed && (
                <button
                    onClick={() => choose(true)}
                    className="mt-2 w-full rounded-lg border border-white/20 px-3 py-1.5 text-[11px] font-semibold text-white/75 transition hover:border-white/40 hover:bg-white/10 hover:text-white"
                >
                    Got it &mdash; keep using the browser service
                </button>
            )}
        </div>
    );
}
