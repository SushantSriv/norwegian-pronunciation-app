import { useCallback, useEffect, useRef, useState } from 'react';
import {
    loadProfile,
    recordAttempt,
    saveProfile,
    type AttemptRecord,
    type Profile,
} from '../utils/learningProfile';

/**
 * The learner's own record, kept in this browser and nowhere else.
 *
 * Recording waits until the recording has finished being analysed, because the
 * melody verdicts arrive after the transcript does and an attempt is only worth
 * writing down once. The guard is the attempt object itself: React hands back
 * the same object until a new attempt is graded, so identity is exactly the
 * right key.
 */
export function useLearningProfile() {
    const [profile, setProfile] = useState<Profile>(loadProfile);
    const recorded = useRef<object | null>(null);

    useEffect(() => {
        saveProfile(profile);
    }, [profile]);

    /**
     * @param attempt The graded attempt, used as its own identity token.
     * @param record  What to fold in, once everything about it is known.
     * @param ready   False while the recording is still being analysed.
     */
    const remember = useCallback((attempt: object | null, record: AttemptRecord, ready: boolean) => {
        if (!attempt || !ready || recorded.current === attempt) return;
        recorded.current = attempt;
        setProfile(current => recordAttempt(current, record));
    }, []);

    const forget = useCallback(() => {
        recorded.current = null;
        setProfile(() => {
            const cleared = loadProfile();
            // Explicit erase: overwrite, then let the effect persist it.
            return { ...cleared, words: {}, phonemes: {}, accents: {}, compounds: { right: 0, wrong: 0 } };
        });
    }, []);

    return { profile, remember, forget };
}
