import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { collectSpeechDiagnostics, type SpeechDiagnostic } from '../utils/speechDiagnostics';

interface Props {
    /** The recogniser error, or null when everything is fine. */
    error: string | null;
}

/**
 * Shown under a speech error. The message alone leaves a learner stuck, so the
 * checks that actually decide whether recognition can run are listed with the
 * fix for each one that failed.
 */
export function SpeechTrouble({ error }: Props) {
    const [checks, setChecks] = useState<SpeechDiagnostic[] | null>(null);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!error) {
            setChecks(null);
            setOpen(false);
            return;
        }
        let cancelled = false;
        collectSpeechDiagnostics().then(result => {
            if (!cancelled) setChecks(result);
        });
        return () => {
            cancelled = true;
        };
    }, [error]);

    if (!error) return null;

    const problems = checks?.filter(c => !c.ok) ?? [];

    return (
        <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto mt-2 max-w-sm text-center"
        >
            <p className="text-sm leading-relaxed text-amber-300">{error}</p>

            {problems.length > 0 && (
                <>
                    <button
                        onClick={() => setOpen(o => !o)}
                        aria-expanded={open}
                        className="mt-1.5 text-xs font-semibold text-white/50 underline decoration-white/25 underline-offset-2 transition hover:text-white/80"
                    >
                        {open ? 'Hide details' : `Why? (${problems.length} issue${problems.length > 1 ? 's' : ''})`}
                    </button>

                    {open && (
                        <ul className="mt-2 space-y-2 rounded-lg border border-white/10 bg-white/[0.04] p-3 text-left">
                            {problems.map(check => (
                                <li key={check.label} className="text-xs leading-relaxed">
                                    <span className="font-semibold text-rose-300">✕ {check.label}</span>
                                    {check.fix && <span className="mt-0.5 block text-white/60">{check.fix}</span>}
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            )}
        </motion.div>
    );
}
