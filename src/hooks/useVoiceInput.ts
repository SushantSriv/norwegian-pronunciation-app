import { useCallback, useEffect, useRef, useState } from 'react';
import {
    createAsrClient,
    cleanTranscript,
    looksHallucinated,
    recognitionSupported,
    type AsrClient,
    type AsrStatus,
    type Recognition,
} from '../utils/asr';
import { decodeForRecognition, RECOGNITION_RATE } from '../utils/audioDecode';
import { findSpeechBounds } from '../utils/pitch';

/**
 * Recording the learner and turning it into text, entirely on this device.
 *
 * This replaces the Web Speech API, and the shape of the problem changes with
 * it. The old API owned the microphone, streamed to a vendor's servers and
 * handed back interim results as it went; a parallel MediaRecorder for
 * listen-back fought it for the microphone, which is why recording used to be
 * switched off on Android. Now there is one recorder, and recognition reads the
 * same audio afterwards — so listen-back and the melody chart work everywhere,
 * and the whole "recording is blocked on this device" mechanism is gone.
 *
 * What is lost is interim results: the model sees the clip when it is finished,
 * not as it arrives. The UI says "Transcribing…" instead of showing text build
 * up.
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
    const [model, setModel] = useState<AsrStatus>({ state: 'idle', progress: 0 });
    /**
     * Bumped to tear the worker down and start over.
     *
     * A model that fails to load used to be the end of the session: the message
     * said what went wrong and offered nothing to do about it. Most causes are
     * transient — a dropped connection mid-download, a stale service worker
     * still serving yesterday's bundle after a deploy — and all of them are
     * fixed by trying again with a fresh worker.
     */
    const [reloadKey, setReloadKey] = useState(0);

    const clientRef = useRef<AsrClient | null>(null);
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

    // Start fetching the model on mount. It is ~40 MB the first time and then
    // served from the browser cache; doing it now means the learner waits while
    // they are reading the phrase rather than after they have spoken it.
    useEffect(() => {
        if (!supported) return;
        const client = createAsrClient();
        clientRef.current = client;
        const unsubscribe = client.subscribe(setModel);
        client.load();
        return () => {
            unsubscribe();
            client.dispose();
            clientRef.current = null;
        };
    }, [supported, reloadKey]);

    /** Throw the worker away and fetch the model again from scratch. */
    const retryModel = useCallback(() => {
        setError(null);
        setModel({ state: 'idle', progress: 0 });
        setReloadKey(key => key + 1);
    }, []);

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

    /** Decode what was recorded, transcribe it, and hand the text up. */
    const handleRecording = useCallback(async (url: string) => {
        const client = clientRef.current;
        if (!client) return;

        setTranscribing(true);
        try {
            const audio = await decodeForRecognition(url);
            if (!audio?.length) {
                setError('That recording came back empty — try once more.');
                return;
            }

            // Whisper does not return nothing when it hears nothing; it returns
            // whatever its language model finds likely. Checking for speech
            // first is cheaper and more honest than scoring a guess.
            const speech = findSpeechBounds(audio, RECOGNITION_RATE);
            if (!speech) {
                setError('I did not catch anything — try speaking a little louder.');
                return;
            }

            const recognition = await client.transcribe(audio);
            const text = cleanTranscript(recognition.text);
            if (looksHallucinated(text)) {
                setError('I did not catch anything — try speaking a little louder.');
                return;
            }
            // The measured speech window goes up with the transcript: how much
            // of it the model accounted for is what tells us whether to trust
            // the result as pronunciation feedback.
            onResultRef.current({ text, words: recognition.words, speech });
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not read that recording.');
        } finally {
            setTranscribing(false);
        }
    }, []);

    /**
     * Stop on silence, the way the old streaming recogniser did.
     *
     * Without this the learner has to tap twice for every attempt, and every
     * clip carries a tail of dead air that the model then has to chew through.
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

            if (!chunksRef.current.length) return;
            const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
            chunksRef.current = [];
            if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
            const url = URL.createObjectURL(blob);
            recordingUrlRef.current = url;
            setRecordingUrl(url);
            void handleRecording(url);
        };

        recorder.start();
        mediaRecorderRef.current = recorder;
        setListening(true);

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
    }, [listening, transcribing, supported, clearTimers, releaseAudio, handleRecording, watchLevel, stop]);

    return {
        supported,
        listening,
        transcribing,
        error,
        recordingUrl,
        recordingAvailable,
        analyserRef,
        model,
        retryModel,
        start,
        stop,
    };
}
