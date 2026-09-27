import type { Seat } from '../../utils/roomProtocol';

interface Props {
    /** Speaking milliseconds per seat, each reported by its own device. */
    spoke: Record<string, number>;
    seat: Seat;
}

/**
 * Were we both active?
 *
 * The conversation task carries one instruction the others do not — «Det er
 * viktig at dere begge er aktive i samtalen» — and unlike the four criteria,
 * that one IS something a pair can check. Each device measured its own
 * microphone, so the split is real rather than guessed.
 *
 * IT IS NOT A CRITERION AND THERE IS NO THRESHOLD HERE. A pair that split the
 * time evenly has followed an instruction, not earned a level. HK-dir publishes
 * no figure for what counts as balanced, so this reports the split and says
 * what the instruction was, and stops there.
 */
export function Taletid({ spoke, seat }: Props) {
    const mine = spoke[seat] ?? 0;
    const theirs = spoke[seat === 'a' ? 'b' : 'a'] ?? 0;
    const total = mine + theirs;
    if (total <= 0) return null;

    const share = Math.round((mine / total) * 100);
    const seconds = (ms: number) => Math.round(ms / 1000).toLocaleString('nb-NO');

    return (
        <div className="mt-5 rounded-xl border border-white/12 bg-white/[0.03] p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-white/70">
                Var dere begge aktive?
            </h2>

            <div
                className="mt-3 flex h-3 overflow-hidden rounded-full bg-white/[0.06]"
                role="img"
                aria-label={`Du snakket ${share} prosent av tiden`}
            >
                <div className="bg-emerald-400/70" style={{ width: `${share}%` }} />
                <div className="bg-sky-400/70" style={{ width: `${100 - share}%` }} />
            </div>

            <div className="mt-2 flex justify-between text-[12px] tabular-nums">
                <span className="text-emerald-200/80">Du · {seconds(mine)} s</span>
                <span className="text-sky-200/80">Den andre · {seconds(theirs)} s</span>
            </div>

            <p className="mt-2.5 text-[12px] leading-relaxed text-white/45">
                Eksaminatoren sier: «Det er viktig at dere begge er aktive i samtalen.» Dette er den
                ene beskjeden dere kan sjekke selv. Det finnes ingen fasit for hva som er en bra
                fordeling, så appen oppgir ingen — og dette er ikke et av de fire kriteriene prøven
                vurderer.
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-white/30">
                Hver av dere målte sin egen mikrofon. Stillhet er stillhet: appen hører ikke
                forskjell på å tenke og å la den andre snakke.
            </p>
        </div>
    );
}
