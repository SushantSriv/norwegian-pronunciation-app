import { useCallback, useEffect, useRef, useState } from 'react';
import type { PronunciationResult } from '../types/Scoring';
import type { Status } from '../types/AppStatus';

// Nullish coalescing (not ||) so an intentionally empty string — same-origin
// deployments where the frontend is served by this same FastAPI app — is
// respected instead of being overridden by the localhost dev default.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

interface UseAudioRecorderOptions {
    expected: string;
    onStatusChange: (status: Status) => void;
    onResult: (result: PronunciationResult) => void;
}

export function useAudioRecorder({ expected, onStatusChange, onResult }: UseAudioRecorderOptions) {
    const [recording, setRecording] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [countdown, setCountdown] = useState<number | null>(null);
    const [audioURL, setAudioURL] = useState<string | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunks = useRef<Blob[]>([]);
    // Always POST the sentence that was current when recording stopped, even
    // if `expected` has already moved on by the time the async upload resolves.
    const expectedRef = useRef(expected);
    expectedRef.current = expected;

    const handleStop = useCallback(async () => {
        setRecording(false);
        onStatusChange('processing');
        setProcessing(true);

        const blob = new Blob(audioChunks.current, { type: 'audio/webm' });
        audioChunks.current = [];
        if (blob.size === 0) {
            setProcessing(false);
            return;
        }

        try {
            const form = new FormData();
            form.append('audio', blob, 'rec.webm');
            form.append('expected', expectedRef.current);

            const res = await fetch(`${API_URL}/upload-audio/`, {
                method: 'POST',
                body: form,
            });
            const data = await res.json();

            if (!res.ok) {
                onStatusChange('error');
                throw new Error(data.detail || res.statusText);
            }

            setAudioURL(URL.createObjectURL(blob));
            onResult(data as PronunciationResult);
        } catch (err) {
            console.error(err);
            onStatusChange('error');
        } finally {
            setProcessing(false);
        }
    }, [onResult, onStatusChange]);

    const startRecordingInternal = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mr = new MediaRecorder(stream);
            mediaRecorderRef.current = mr;
            audioChunks.current = [];
            mr.ondataavailable = e => e.data.size && audioChunks.current.push(e.data);
            mr.onstop = handleStop;
            mr.onerror = handleStop;
            mr.start();
            setRecording(true);
            onStatusChange('listening');
        } catch (err) {
            console.error(err);
            alert('⚠️ Mic access is required to record. Please enable microphone permission.');
            setRecording(false);
        }
    }, [handleStop, onStatusChange]);

    const startRecording = useCallback(() => {
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
            mediaRecorderRef.current = null;
        }
        setCountdown(3);
        const tick = setInterval(() => {
            setCountdown(prev => {
                if (prev === null) {
                    clearInterval(tick);
                    return null;
                }
                if (prev <= 1) {
                    clearInterval(tick);
                    startRecordingInternal();
                    setTimeout(() => setCountdown(null), 100);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, [startRecordingInternal]);

    const stopRecording = useCallback(() => {
        const mr = mediaRecorderRef.current;
        if (mr && mr.state === 'recording') mr.stop();
    }, []);

    // Release the mic if the component unmounts mid-recording.
    useEffect(() => {
        return () => {
            mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());
        };
    }, []);

    return { recording, processing, countdown, audioURL, startRecording, stopRecording };
}
