import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ITEMS_TO_WIN, MAX_STRIKES, THRESHOLD_STEP } from '../hooks/usePracticeSession';

interface Props {
    open: boolean;
    onClose: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="border-t border-white/10 pt-5">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-white/70">{title}</h3>
            <div className="space-y-2 text-sm leading-relaxed text-white/60">{children}</div>
        </section>
    );
}

export function AboutDialog({ open, onClose }: Props) {
    const closeRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!open) return;
        closeRef.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        // Stop the page behind the dialog from scrolling with it.
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = previous;
        };
    }, [open, onClose]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/90 p-4 backdrop-blur-md sm:p-8"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                >
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="about-title"
                        className="my-auto w-full max-w-2xl rounded-3xl border border-white/15 bg-slate-900 p-6 shadow-2xl shadow-black/60 sm:p-8"
                        initial={{ opacity: 0, y: 24, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 16, scale: 0.98 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="mb-5 flex items-start justify-between gap-4">
                            <div>
                                <h2 id="about-title" className="text-2xl font-extrabold text-white">
                                    Norsk uttale
                                </h2>
                                <p className="mt-1 text-sm text-white/50">
                                    Practise Norwegian out loud and see your intonation
                                </p>
                            </div>
                            <button
                                ref={closeRef}
                                onClick={onClose}
                                aria-label="Close"
                                className="shrink-0 rounded-lg border border-white/20 px-3 py-1.5 text-sm font-semibold text-white/70 transition hover:border-white/40 hover:bg-white/10 hover:text-white"
                            >
                                Close
                            </button>
                        </div>

                        <div className="space-y-5">
                            <p className="text-sm leading-relaxed text-white/70">
                                You say a Norwegian phrase out loud and the app scores how close you got —
                                word by word and sound by sound. It also draws the <strong>pitch</strong> of
                                your voice, because Norwegian is a pitch-accent language, and flat delivery is
                                the most common thing that marks someone out as a non-native speaker.
                            </p>

                            <Section title="How to practise">
                                <ol className="list-decimal space-y-1.5 pl-5">
                                    <li>Choose a level, or an occupation if you want work vocabulary.</li>
                                    <li>
                                        Press <strong className="text-white/80">Hear it</strong> first if you
                                        want the phrase read to you. The words light up as it speaks.
                                    </li>
                                    <li>Tap the microphone and say the phrase.</li>
                                    <li>
                                        Clear <strong className="text-white/80">{ITEMS_TO_WIN}</strong> phrases
                                        before you lose <strong className="text-white/80">{MAX_STRIKES}</strong>{' '}
                                        lives. The pass mark rises by {THRESHOLD_STEP} points each time you
                                        clear one, so it gets harder as you go.
                                    </li>
                                </ol>
                            </Section>

                            <Section title="Reading your result">
                                <ul className="space-y-1.5">
                                    <li>
                                        <strong className="text-white/80">The score (0–100)</strong> measures how
                                        close each word&rsquo;s sounds were, not merely right or wrong — a
                                        near-miss scores higher than a completely different word.
                                    </li>
                                    <li>
                                        <strong className="text-white/80">Green and red chips</strong> show which
                                        words were recognised. Tap a red one for the sound-by-sound breakdown.
                                    </li>
                                    <li>
                                        <strong className="text-white/80">Your melody</strong> is your pitch over
                                        time. On a single word, the dashed line is the expected tone-accent
                                        shape — Norwegian uses two, and they can change a word&rsquo;s meaning.
                                    </li>
                                    <li>
                                        <strong className="text-white/80">Compare</strong> plays your own
                                        recording against the reference voice. Desktop only, see below.
                                    </li>
                                </ul>
                            </Section>

                            <Section title="The settings at the bottom">
                                <ul className="space-y-1.5">
                                    <li>
                                        <strong className="text-white/80">Dialect</strong> changes the phonetic
                                        transcription shown under each phrase, using real per-region data. It
                                        does <em>not</em> change the sentences or the voice.
                                    </li>
                                    <li>
                                        <strong className="text-white/80">Voice</strong> lists the Norwegian
                                        voices your device has. Which ones exist is decided by your operating
                                        system and browser, not by this app.
                                    </li>
                                    <li>
                                        <strong className="text-white/80">Speed</strong> slows the reference
                                        voice down when a phrase goes past too quickly.
                                    </li>
                                </ul>
                            </Section>

                            <Section title="What you need">
                                <p>
                                    <strong className="text-white/80">Any current browser</strong> — Firefox,
                                    Chrome, Edge or Safari — on a computer, phone or tablet, plus a microphone.
                                    Recognition is a speech model running inside this page rather than a
                                    browser feature, so there is no browser that gets locked out any more, and
                                    listen-back and the melody chart work everywhere.
                                </p>
                                <p>
                                    The first time you use it, about 82&nbsp;MB is downloaded: the model and
                                    the runtime it needs. That happens once and is kept in your browser, so
                                    afterwards practising works with no connection at all. Expect a second or
                                    two of thinking time after each attempt while the model reads it, and a
                                    little longer on an older phone.
                                </p>
                            </Section>

                            <Section title="Privacy">
                                <p>
                                    There is no account, no server of mine, no tracking and no analytics. Your
                                    progress is saved only in this browser and never leaves it.
                                </p>
                                <p className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-3 text-emerald-100/80">
                                    <strong className="text-emerald-100">Your voice stays here.</strong> Speech
                                    recognition used to be handed to the browser&rsquo;s own service, which meant
                                    the audio went to Google&rsquo;s, Microsoft&rsquo;s or Apple&rsquo;s servers
                                    to be transcribed. It now runs as a speech model inside this page instead:
                                    about 82&nbsp;MB is downloaded the first time you use it and kept in your
                                    browser, and after that nothing about your recordings — not the audio, not
                                    the transcript — leaves the device, with or without a network connection.
                                </p>
                            </Section>

                            <Section title="Credits">
                                <p>
                                    Pronunciation and pitch-accent data comes from{' '}
                                    <a
                                        href="https://www.nb.no/sprakbanken/en/resource-catalogue/oai-nb-no-sbr-79/"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sky-300 underline decoration-sky-300/40 underline-offset-2 hover:text-sky-200"
                                    >
                                        NB Uttale
                                    </a>
                                    , published by Språkbanken at Nasjonalbiblioteket under CC0. It is a
                                    lexicon of real Norwegian pronunciations by region, so the transcriptions
                                    here are not guesswork.
                                </p>
                                <p>
                                    Where a word is missing from that lexicon, the app falls back to its own
                                    letter-to-sound rules, which are an approximation and do not model pitch
                                    accent.
                                </p>
                                <p>
                                    Built by <strong className="text-white/80">Sushant Kr Srivastava</strong>,
                                    who was learning Norwegian and could not find an app that actually listened
                                    properly.
                                </p>
                            </Section>
                        </div>

                        <div className="mt-6 border-t border-white/10 pt-4 text-center">
                            <button
                                onClick={onClose}
                                className="min-h-[44px] w-full rounded-xl bg-white font-bold text-slate-900 transition hover:bg-white/90"
                            >
                                Got it
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
