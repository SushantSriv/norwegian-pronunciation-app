import { useEffect, useState } from 'react';
import { analyseRecording, type RecordingAnalysis } from '../utils/pitch';

/**
 * Decode the learner's recording once and share the results. Both the melody
 * chart and the listen-back player need data derived from the same decode, and
 * decoding is by far the expensive part.
 */
export function useRecordingAnalysis(recordingUrl: string | null) {
    const [analysis, setAnalysis] = useState<RecordingAnalysis | null>(null);
    const [analysing, setAnalysing] = useState(false);

    useEffect(() => {
        if (!recordingUrl) {
            setAnalysis(null);
            return;
        }

        let cancelled = false;
        setAnalysing(true);
        setAnalysis(null);

        analyseRecording(recordingUrl)
            .then(result => {
                if (!cancelled) setAnalysis(result);
            })
            .catch(() => {
                if (!cancelled) setAnalysis(null);
            })
            .finally(() => {
                if (!cancelled) setAnalysing(false);
            });

        return () => {
            cancelled = true;
        };
    }, [recordingUrl]);

    return { analysis, analysing };
}
