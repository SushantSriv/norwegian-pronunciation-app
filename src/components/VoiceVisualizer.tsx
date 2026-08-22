import { useEffect, useRef, type RefObject } from 'react';
import { motion } from 'framer-motion';

interface Props {
    analyserRef: RefObject<AnalyserNode | null>;
    active: boolean;
    /** Diameter of the inner circle the bars sit around. */
    size?: number;
    bars?: number;
}

const REST_SCALE = 0.18;

/**
 * A ring of bars around the mic button that reacts to the learner's voice in
 * real time. Driven by its own requestAnimationFrame loop writing straight to
 * the DOM — pushing 56 bars through React state at 60fps would be wasteful.
 */
export function VoiceVisualizer({ analyserRef, active, size = 112, bars = 56 }: Props) {
    const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
    const frameRef = useRef<number | null>(null);

    const barLength = 26;
    // Gap between the mic button edge and the inner end of the bars.
    const innerRadius = size / 2 + 10;

    // Each bar is laid out so its BOTTOM edge sits exactly on the container
    // centre (top: -barLength), which makes transform-origin '50% 100%' the
    // true ring centre. Anchoring it anywhere else pivots the bars about an
    // offset point and the ring comes out lopsided.
    const transformFor = (index: number, scale: number) => {
        const angle = (index / bars) * 360;
        return `rotate(${angle}deg) translateY(-${innerRadius}px) scaleY(${scale.toFixed(3)})`;
    };

    useEffect(() => {
        if (!active) {
            for (let i = 0; i < barRefs.current.length; i++) {
                barRefs.current[i]?.style.setProperty('transform', transformFor(i, REST_SCALE));
            }
            return;
        }

        const initial = analyserRef.current;
        const data = new Uint8Array(initial ? initial.frequencyBinCount : 128);

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
                const bin = Math.min(data.length - 1, Math.floor((mirrored / half) * 44) + 2);
                const level = data[bin] / 255;
                bar.style.transform = transformFor(i, REST_SCALE + Math.min(1, level * 1.9) * 1.25);
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
        <motion.div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            aria-hidden="true"
            animate={{ opacity: active ? 1 : 0.28, scale: active ? 1 : 0.94 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        >
            {/* Zero-sized anchor so the flex centring gives us an exact centre point. */}
            <div className="relative h-0 w-0">
                {Array.from({ length: bars }).map((_, i) => (
                    <span
                        key={i}
                        ref={el => {
                            barRefs.current[i] = el;
                        }}
                        className="absolute block w-[3px] rounded-full bg-gradient-to-t from-rose-400/70 via-orange-300/80 to-amber-200/90"
                        style={{
                            height: barLength,
                            left: -1.5,
                            top: -barLength,
                            transformOrigin: '50% 100%',
                            transform: transformFor(i, REST_SCALE),
                            transition: 'transform 70ms linear',
                        }}
                    />
                ))}
            </div>
        </motion.div>
    );
}
