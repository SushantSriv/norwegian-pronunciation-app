import type { Segment } from '../../utils/examTimeline';

interface Props {
    timeline: Segment[];
    current: number;
}

const minutes = (ms?: number) => (ms ? Math.round(ms / 60_000) : null);

/**
 * The shape of the whole session, down the side.
 *
 * Deliberately shows what the app cannot do as well as what it can. A task the
 * app refuses to run keeps its real letter and its real duration and is greyed
 * with the reason, because hiding it would tell a candidate the exam is shorter
 * and simpler than it is — and the conversation task alone is a fifth to a
 * third of the real thing.
 */
export function SessionMap({ timeline, current }: Props) {
    return (
        <ol className="space-y-1">
            {timeline.map((segment, index) => {
                const active = index === current;
                const past = index < current;
                const span = [minutes(segment.minMs), minutes(segment.maxMs)].filter(Boolean);

                return (
                    <li
                        key={segment.id}
                        aria-current={active ? 'step' : undefined}
                        className={[
                            'flex items-baseline gap-2.5 rounded-lg px-2.5 py-1.5 text-sm',
                            active ? 'bg-white/[0.10] text-white' : '',
                            past && !active ? 'text-white/35' : '',
                            !active && !past ? 'text-white/55' : '',
                            !segment.runnable ? 'opacity-60' : '',
                        ].join(' ')}
                    >
                        <span
                            className={[
                                'w-5 shrink-0 text-center text-xs font-bold',
                                segment.letter ? 'text-white/70' : 'text-white/25',
                            ].join(' ')}
                        >
                            {segment.letter ?? '·'}
                        </span>

                        <span className="min-w-0 flex-1 truncate">
                            {segment.title}
                            {!segment.assessed && segment.letter === undefined && segment.kind === 'oppvarming' && (
                                <span className="ml-1.5 text-[11px] text-white/35">teller ikke</span>
                            )}
                            {!segment.runnable && (
                                <span className="ml-1.5 text-[11px] text-amber-200/60">kan ikke kjøres</span>
                            )}
                        </span>

                        {span.length === 2 && (
                            <span className="shrink-0 text-[11px] tabular-nums text-white/30">
                                {span[0]}–{span[1]} min
                            </span>
                        )}
                    </li>
                );
            })}
        </ol>
    );
}
