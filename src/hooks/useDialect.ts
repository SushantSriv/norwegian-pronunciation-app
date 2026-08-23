import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_DIALECT, DIALECTS, type DialectId } from '../data/dialects';
import { loadDialect, pronunciationFor, stripProsody } from '../utils/pronunciationLexicon';
import type { IpaResolver } from '../utils/scoring';

const DIALECT_KEY = 'npa-dialect-v1';

function readStored(): DialectId {
    try {
        const raw = window.localStorage.getItem(DIALECT_KEY);
        if (raw && DIALECTS.some(d => d.id === raw)) return raw as DialectId;
    } catch {
        // Storage unavailable; the default is fine.
    }
    return DEFAULT_DIALECT;
}

/**
 * The learner's chosen dialect, plus the pronunciation data for it.
 *
 * The lexicon for a dialect is a separate chunk fetched on demand. Until it
 * lands, lookups quietly fall back to the rule engine rather than blocking the
 * UI — scoring still works, it is just less accurate for that moment.
 */
export function useDialect() {
    const [dialect, setDialectState] = useState<DialectId>(readStored);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setReady(false);
        loadDialect(dialect).then(() => {
            if (!cancelled) setReady(true);
        });
        return () => {
            cancelled = true;
        };
    }, [dialect]);

    const setDialect = useCallback((next: DialectId) => {
        setDialectState(next);
        try {
            window.localStorage.setItem(DIALECT_KEY, next);
        } catch {
            // Choice simply will not persist.
        }
    }, []);

    /**
     * IPA for scoring. Lexicon entries carry stress and syllable marks that the
     * rule engine does not emit, so they are stripped — otherwise a lexicon word
     * and a fallback word could never compare equal.
     */
    const toIpa: IpaResolver = useMemo(
        () => (word: string) => stripProsody(pronunciationFor(word, dialect).ipa),
        // `ready` is a dependency on purpose: once the chunk lands the resolver
        // must be re-created so memoised consumers re-score with real data.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [dialect, ready]
    );

    /** Full entry, including pitch accent and alternative senses. */
    const lookup = useCallback(
        (word: string) => pronunciationFor(word, dialect),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [dialect, ready]
    );

    return { dialect, setDialect, ready, toIpa, lookup };
}
