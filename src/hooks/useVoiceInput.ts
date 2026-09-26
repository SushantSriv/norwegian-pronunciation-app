import { useCallback, useEffect, useRef, useState } from 'react';
import { cleanTranscript, recognitionSupported, type Recognition } from '../utils/speech';
import { decodeForRecognition, RECOGNITION_RATE } from '../utils/audioDecode';
import { findSpeechBounds } from '../utils/pitch';
import { listenOnce, type WebSpeechOutcome } from '../utils/webSpeech';

/**
 * Recording the learner, and letting the browser transcribe it.
 *
 * Two things happen at once and they are independent. The browser's speech
 * service listens live and returns text. A MediaRecorder captures the same
 * audio, which is what the pitch contour, the melody chart and listen-back are
 * built from — none of which the service provides, and all of which are the
 * reason this app exists rather than being a dictation box.
 *
 * THE AWKWARD CASE this has to survive: on some Android builds the speech
 * service routes through the system recogniser and takes the microphone
 * exclusively, so our recorder captures nothing. There used to be an on-device
 * model to fall back to; there is not any more. So a recording that comes back
 * empty is no longer the end of the attempt — the transcript is still
 * delivered, just without the pitch analysis that needs audio. A learner gets
 * their score and no melody chart, rather than a tap that silently does
 * nothing.
 */

/** Silence after speech that ends the recording, in milliseconds. */
const SILENCE_MS = 1_200;
/** Give up if nothing has been said by now. */
const NO_SPEECH_MS = 6_000;
/** Hard ceiling, so a stuck recording cannot grow without bound. */
const MAX_RECORDING_MS = 15_000;
/** RMS above which a frame counts as speech, on the analyser's 0-1 scale. */
const SPEECH_LEVEL = 0.025;
/** How often the level is sampled while recording. */
const LEVEL_POLL_MS = 100;

const MIC_ERRORS: Record<string, string> = {
    NotAllowedError:
        'Microphone access was blocked. Allow it for this site, then tap the mic again.',
    NotFoundError: 'No microphone found. Check that one is connected.',
    NotReadableError: 'The microphone is in use by another app. Close it and try again.',
};

const NOTHING_HEARD = 'I did not catch anything — try speaking a little louder.';

interface Options {
    onResult: (recognition: Recognition) => void;
}

export function useVoiceInput({ onResult }: Options) {
    const supported = recognitionSupported();

    const [listening, setListening] = useState(false);
    const [transcribing, setTranscribing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
    const [recordingAvailable, setRecordingAvailable] = useState(true);
    /** Partial text, which the service produces as the learner speaks. */
    const [interim, setInterim] = useState('');
    /** The service's answer for the attempt in flight. */
    const speechRef = useRef<Promise<WebSpeechOutcome> | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const recordingUrlRef = useRef<string | null>(null);
    const stopTimersRef = useRef<number[]>([]);
    const levelPollRef = useRef<number | null>(null);
    // Live analyser over the mic stream, so the visualiser can drive its own
    // requestAnimationFrame loop without re-rendering this hook every frame.
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);

    // Keep the latest callback without re-creating anything.
    const onResultRef = useRef(onResult);
    onResultRef.current = onResult;

    // Release the last object URL when the hook goes away.
    useEffect(
        () => () => {
            if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
        },
        []
    );

    const clearTimers = useCallback(() => {
        stopTimersRef.current.forEach(window.clearTimeout);
        stopTimersRef.current = [];
        if (levelPollRef.current !== null) window.clearInterval(levelPollRef.current);
        levelPollRef.current = null;
    }, []);

    const releaseAudio = useCallback(() => {
        analyserRef.current = null;
        void audioContextRef.current?.close();
        audioContextRef.current = null;
    }, []);

    const stop = useCallback(() => {
        clearTimers();
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== 'inactive') recorder.stop();
    }, [clearTimers]);

    /**
     * Put the transcript together with the recording, and hand the result up.
     *
     * @param url The captured audio, or null when the recorder got nothing.
     */
    const finish = useCallback(async (url: string | null) => {
        setTranscribing(true);
        try {
            const outcome = await speechRef.current;
            speechRef.current = null;
            const text = outcome?.text ? cleanTranscript(outcome.text) : '';

            // No audio: the service took the microphone for itself. The
            // transcript is still worth having, so it goes up without the
            // speech window — everything downstream treats that as "no claim
            // made about the recognition" rather than as silence.
            if (!url) {
                if (!text) {
                    setError(NOTHING_HEARD);
                    return;
                }
                onResultRef.current({ text });
                return;
            }

            const audio = await decodeForRecognition(url);
            const speech = audio?.length ? findSpeechBounds(audio, RECOGNITION_RATE) : null;

            // Nothing said and nothing heard is the one case worth refusing
            // outright: scoring silence teaches nothing.
            if (!text && !speech) {
                setError(NOTHING_HEARD);
                return;
            }
            if (!text) {
                setError('I heard you, but could not make out the words — try once more.');
                return;
            }

            onResultRef.current({ text, speech });
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not read that recording.');
        } finally {
            setTranscribing(false);
        }
    }, []);

    /**
     * Stop on silence, so the learner does not have to tap twice.
     *
     * Also bounds the clip: the pitch analysis runs over whatever was captured,
     * and a long tail of dead air is work for nothing.
     */
    const watchLevel = useCallback(
        (analyser: AnalyserNode) => {
            const samples = new Uint8Array(analyser.fftSize);
            let spokeAt = 0;
            let hasSpoken = false;

            levelPollRef.current = window.setInterval(() => {
                analyser.getByteTimeDomainData(samples);
                let sum = 0;
                for (let i = 0; i < samples.length; i++) {
                    const centred = (samples[i] - 128) / 128;
                    sum += centred * centred;
                }
                const rms = Math.sqrt(sum / samples.length);

                if (rms >= SPEECH_LEVEL) {
                    hasSpoken = true;
                    spokeAt = Date.now();
                } else if (hasSpoken && Date.now() - spokeAt > SILENCE_MS) {
                    stop();
                }
            }, LEVEL_POLL_MS);

            stopTimersRef.current.push(
                window.setTimeout(() => {
                    if (!hasSpoken) stop();
                }, NO_SPEECH_MS),
                window.setTimeout(stop, MAX_RECORDING_MS)
            );
        },
        [stop]
    );

    const start = useCallback(async () => {
        if (listening || transcribing || !supported) return;
        setError(null);

        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (cause) {
            const name = cause instanceof Error ? cause.name : '';
            setError(MIC_ERRORS[name] ?? 'The microphone could not be opened.');
            setRecordingAvailable(false);
            return;
        }

        setRecordingAvailable(true);
        const recorder = new MediaRecorder(stream);
        chunksRef.current = [];

        recorder.ondataavailable = event => {
            if (event.data.size) chunksRef.current.push(event.data);
        };
        recorder.onstop = () => {
            stream.getTracks().forEach(track => track.stop());
            clearTimers();
            releaseAudio();
            setListening(false);
            setInterim('');

            if (!chunksRef.current.length) {
                // The recorder captured nothing. Still worth finishing: the
                // service may well have heard the learner perfectly.
                void finish(null);
                return;
            }

            const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
            chunksRef.current = [];
            if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
            const url = URL.createObjectURL(blob);
            recordingUrlRef.current = url;
            setRecordingUrl(url);
            void finish(url);
        };

        recorder.start();
        mediaRecorderRef.current = recorder;
        setListening(true);
        setInterim('');

        // The service listens live, in parallel with the recorder.
        speechRef.current = listenOnce({ onInterim: setInterim });

        // Tap the same stream for live level data, for the visualiser and for
        // deciding when the learner has stopped talking.
        const AudioCtor =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioCtor) {
            const context = new AudioCtor();
            const analyser = context.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.75;
            context.createMediaStreamSource(stream).connect(analyser);
            audioContextRef.current = context;
            analyserRef.current = analyser;
            watchLevel(analyser);
        } else {
            // No analyser to watch, so only the hard ceiling can end the take.
            stopTimersRef.current.push(window.setTimeout(stop, MAX_RECORDING_MS));
        }
    }, [listening, transcribing, supported, clearTimers, releaseAudio, finish, watchLevel, stop]);

    return {
        supported,
        listening,
        transcribing,
        error,
        recordingUrl,
        recordingAvailable,
        analyserRef,
        interim,
        start,
        stop,
    };
}
