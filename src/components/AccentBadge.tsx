import { ACCENT_LABEL, ACCENT_SHAPE, targetContour, type PitchAccent } from '../data/tonelag';

interface Props {
    accent: PitchAccent;
    /** Smaller, for sitting inside a line of text. */
    compact?: boolean;
}

const W = 26;
const H = 14;

/**
 * The shape of the accent, drawn from the same contour the app scores against.
 *
 * A picture of a rise beats the words "Tonelag 2" for anyone who has not met
 * the term, and it is the one explanation that needs no language at all.
 */
function AccentGlyph({ accent }: { accent: PitchAccent }) {
    const points = targetContour(accent);
    if (!points.length) return null;

    const extreme = Math.max(...points.map(p => Math.abs(p.semitones))) || 1;
    const path = points
        .map((p, i) => {
            const x = p.t * (W - 2) + 1;
            const y = H / 2 - (p.semitones / extreme) * (H / 2 - 1.5);
            return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');

    return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="shrink-0">
            <path d={path} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
        </svg>
    );
}

/**
 * The accent, named in a way a beginner can act on.
 *
 * "Tonelag 2" is what a textbook and a teacher will call it, so the term stays.
 * It just never appears on its own: the shape of the melody is drawn beside it
 * and described in three words, so the badge teaches rather than labels.
 */
export function AccentBadge({ accent, compact = false }: Props) {
    if (accent === 'NONE') return null;

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full bg-violet-400/25 font-bold text-violet-100 ${
                compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
            }`}
        >
            <AccentGlyph accent={accent} />
            <span>{ACCENT_LABEL[accent]}</span>
            <span className="font-normal opacity-75">· {ACCENT_SHAPE[accent]}</span>
        </span>
    );
}
