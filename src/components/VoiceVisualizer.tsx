import { useEffect, useRef, type RefObject } from 'react';

interface Props {
    analyserRef: RefObject<AnalyserNode | null>;
    active: boolean;
    /** Diameter of the ring in px. */
    size?: number;
    bars?: number;
}

const REST_SCALE = 0.14;

/**
 * A ring of bars around the mic button that reacts to the learner's voice in
 * real time. Driven by its own requestAnimationFrame loop writing straight to
 * the DOM — pushing 48 bars through React state at 60fps would be wasteful.
 */
export function VoiceVisualizer({ analyserRef, active, size = 150, bars = 48 }: Props) {
    const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
    const frameRef = useRef<number | null>(null);

    // Bars radiate from the centre: rotate into position, push out to the ring,
    // then grow along their own length (origin at the inner end).
    const barLength = size * 0.2;
    const innerRadius = size / 2;
    const transformFor = (index: number, scale: number) => {
        const angle = (index / bars) * 360;
        return `rotate(${angle}deg) translateY(-${innerRadius}px) scaleY(${scale.toFixed(3)})`;
    };

    useEffect(() => {
        if (!active) {
            for (let i = 0; i < barRefs.current.length; i++) {
                const bar = barRefs.current[i];
                if (bar) bar.style.transform = transformFor(i, REST_SCALE);
            }
            return;
        }

        const analyser = analyserRef.current;
        const data = new Uint8Array(analyser ? analyser.frequencyBinCount : 128);

        const tick = () => {
            frameRef.current = requestAnimationFrame(tick);
            const node = analyserRef.current;
            if (!node) return;

            node.getByteFrequencyData(data);
            const half = bars / 2;

            for (let i = 0; i < bars; i++) {
                const bar = barRefs.current[i];
                if (!bar) continue;
                // Mirror the spectrum across the ring so it reads symmetrically.
                const mirrored = i < half ? i : bars - 1 - i;
                // Speech energy sits low in the spectrum; bias sampling there.
                const bin = Math.min(data.length - 1, Math.floor((mirrored / half) * 46) + 2);
                const level = data[bin] / 255;
                bar.style.transform = transformFor(i, REST_SCALE + Math.min(1, level * 1.9) * 1.15);
            }
        };

        frameRef.current = requestAnimationFrame(tick);
        return () => {
            if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
            frameRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, analyserRef, bars]);

    return (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <div className="relative" style={{ width: 0, height: 0 }}>
                {Array.from({ length: bars }).map((_, i) => (
                    <span
                        key={i}
                        ref={el => {
                            barRefs.current[i] = el;
                        }}
                        className="absolute block w-[3px] rounded-full bg-gradient-to-t from-rose-400/80 to-amber-200/90"
                        style={{
                            height: barLength,
                            left: -1.5,
                            top: 0,
                            transformOrigin: '50% 100%',
                            transform: transformFor(i, REST_SCALE),
                            transition: 'transform 70ms linear',
                        }}
                    />
                ))}
            </div>
        </div>
    );
}
