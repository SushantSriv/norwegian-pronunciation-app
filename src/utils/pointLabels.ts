/**
 * How each way of earning points is named and coloured for the learner.
 *
 * Kept out of the components so the practice screen, the results screen and the
 * community screen all say the same thing about the same award — a learner who
 * sees "Sterk uttale" mid-session and "strong" in the summary would reasonably
 * conclude they were two different things.
 */
import type { PointKind } from './learningPoints';

export const KIND_LABEL: Record<PointKind, string> = {
    attempt: 'Forsøk',
    clear: 'Klarte kravet',
    strong: 'Sterk uttale',
    review: 'Repetisjon',
    improvement: 'Personlig rekord',
    mastery: 'Mestret ord',
    session: 'Fullført økt',
    streak: 'Streak',
};

/** A colour per kind, so the breakdown bar and its legend agree. */
export const KIND_COLOUR: Record<PointKind, string> = {
    attempt: 'bg-slate-400',
    clear: 'bg-sky-400',
    strong: 'bg-violet-400',
    review: 'bg-slate-500',
    improvement: 'bg-emerald-400',
    mastery: 'bg-amber-400',
    session: 'bg-teal-400',
    streak: 'bg-rose-400',
};

/** The emoji shown beside an award as it is earned. */
export const KIND_ICON: Record<PointKind, string> = {
    attempt: '🎙️',
    clear: '✅',
    strong: '💪',
    review: '🔁',
    improvement: '📈',
    mastery: '🏅',
    session: '🎯',
    streak: '🔥',
};
