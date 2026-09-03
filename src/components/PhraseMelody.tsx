import { useState } from 'react';
import { motion } from 'framer-motion';
import { ACCENT_HINT, ACCENT_LABEL } from '../data/tonelag';
import { problemWords, type WordMelody, type WordMelodyStatus } from '../utils/phraseMelody';
import { sampleContour } from '../utils/melodyScore';
import { targetContour } from '../data/tonelag';
import { resample } from '../utils/dtw';

interface Props {
    melody: WordMelody[];
}

const MARK: Record<WordMelodyStatus, { icon: string; tone: string; label: string }> = {
    good: { icon: '✓', tone: 'text-emerald-300', label: 'melody matched' },
    close: { icon: '~', tone: 'text-amber-300', label: 'melody roughly right' },
    wrong: { icon: '●', tone: 'text-rose-400', label: 'melody wrong' },
    // Deliberately neutral. This word was not accented, which in connected
    // speech is usually correct, so it must not read as a failure.
    'not-judged': { icon: '·', tone: 'text-white/30', label: 'not accented, so not graded' },
    'not-heard': { icon: '·', tone: 'text-white/25', label: 'not heard' },
    unmeasurable: { icon: '·', tone: 'text-white/25', label: 'too little voiced sound' },
    'no-contrast': { icon: '', tone: 'text-white/30', label: 'one syllable, no tonelag' },
};

const WIDTH = 220;
const HEIGHT = 64;
const PAD = 8;

/** Both curves on one axis, so the shapes can be compared at a glance. */
function curves(entry: WordMelody): { user: string; target: string } | null {
    const voiced = entry.points
        .map(point => point.semitones)
        .filter((value): value is number => value !== null);
    if (voiced.length < 2 || entry.expected === 'NONE') return null;

    const user = resample(voiced, 32);
    const target = sampleContour(targetContour(entry.expected), 32);

    const extreme = Math.max(3, ...user.map(Math.abs), ...target.map(Math.abs)) * 1.1;
    const path = (series: number[]) =>
        series
            .map((value, i) => {
                const x = PAD + (i / (series.length - 1)) * (WIDTH - PAD * 2);
                const y = HEIGHT / 2 - (value / extreme) * (HEIGHT / 2 - PAD);
                return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(' ');

    return { user: path(user), target: path(target) };
}

/**
 * Melody, word by word.
 *
 * The chart used to score a whole utterance at once, which told a learner that
 * something in "jeg kjøpte en ny bil i går" was off and left them to find it.
 * Whisper's word timestamps make it possible to say which word — and since
 * pitch accent is a property of a word, that is the level the feedback belongs
 * at.
 */
export function PhraseMelody({ melody }: Props) {
    const [openIndex, setOpenIndex] = useState<number | null>(
        () => problemWords(melody)[0]?.index ?? null
    );

    const judged = melody.filter(entry => entry.status !== 'no-contrast');
    if (!judged.length) return null;

    const open = melody.find(entry => entry.index === openIndex) ?? null;
    const openCurves = open ? curves(open) : null;

    return (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-white/45">
                Melody, word by word
            </div>

            <div className="flex flex-wrap gap-x-1 gap-y-2">
                {melody.map(entry => {
                    const mark = MARK[entry.status];
                    const judgeable = entry.status !== 'no-contrast';
                    return (
                        <button
                            key={entry.index}
                            onClick={() => setOpenIndex(openIndex === entry.index ? null : entry.index)}
                            disabled={!judgeable}
                            aria-label={`${entry.word} — ${mark.label}`}
                            aria-pressed={openIndex === entry.index}
                            className={`flex flex-col items-center rounded-lg px-2 py-1 transition ${
                                judgeable ? 'hover:bg-white/10' : 'cursor-default'
                            } ${openIndex === entry.index ? 'bg-white/10 ring-1 ring-white/20' : ''}`}
                        >
                            <span
                                lang="nb"
                                className={judgeable ? 'text-sm text-white' : 'text-sm text-white/40'}
                            >
                                {entry.word}
                            </span>
                            <span className={`text-xs leading-none ${mark.tone}`} aria-hidden="true">
                                {mark.icon || ' '}
                            </span>
                        </button>
                    );
                })}
            </div>

            {open && open.status !== 'no-contrast' && (
                <motion.div
                    key={open.index}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3"
                >
                    <div className="flex flex-wrap items-center gap-2">
                        <span lang="nb" className="font-semibold text-white">
                            {open.word}
                        </span>
                        <span className="rounded-full bg-violet-400/25 px-2 py-0.5 text-xs font-bold text-violet-100">
                            {ACCENT_LABEL[open.expected]}
                        </span>
                        {open.score !== null && (
                            <span className="text-xs tabular-nums text-white/40">
                                {open.score}/100
                            </span>
                        )}
                    </div>

                    {openCurves && (
                        <svg
                            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                            className="mt-2 h-16 w-full"
                            preserveAspectRatio="none"
                            role="img"
                            aria-label={`Your melody for ${open.word} against the expected ${ACCENT_LABEL[open.expected]} shape`}
                        >
                            <line
                                x1={0}
                                x2={WIDTH}
                                y1={HEIGHT / 2}
                                y2={HEIGHT / 2}
                                stroke="rgba(255,255,255,0.12)"
                                strokeDasharray="3 4"
                            />
                            <path
                                d={openCurves.target}
                                fill="none"
                                stroke="rgba(196,181,253,0.7)"
                                strokeWidth={2}
                                strokeDasharray="5 4"
                            />
                            <path
                                d={openCurves.user}
                                fill="none"
                                stroke="#38bdf8"
                                strokeWidth={2.5}
                                strokeLinecap="round"
                            />
                        </svg>
                    )}

                    <p className="mt-2 text-sm leading-relaxed text-white/75">
                        {open.status === 'not-heard'
                            ? 'This word was not heard at all, so its melody could not be read.'
                            : open.status === 'unmeasurable'
                              ? 'Too little voiced sound in this word to read a melody from it.'
                              : open.status === 'not-judged'
                                ? 'You did not put the accent on this word, which in a phrase is usually right — so there is nothing to grade here. Its shape is drawn for comparison.'
                                : (open.advice?.text ?? ACCENT_HINT[open.expected])}
                    </p>
                </motion.div>
            )}
        </div>
    );
}
