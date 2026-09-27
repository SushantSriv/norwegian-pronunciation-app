import { useCallback, useEffect, useRef, useState } from 'react';
import {
    cleanTranscript,
    PHRASE,
    recognitionSupported,
    type ListenProfile,
    type Recognition,
} from '../utils/speech';
import { decodeForRecognition, RECOGNITION_RATE } from '../utils/audioDecode';
import { findSpeechBounds } from '../utils/pitch';
import {
    listen,
    recorderTakesMicrophone,
    rememberRecorderTakesMicrophone,
    type WebSpeechSession,
} from '../utils/webSpeech';
import { diagnoseEmptyTranscript, EMPTY_MESSAGES } from '../utils/micConflict';

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

/** RMS above which a frame counts as speech, on the analyser's 0-1 scale. */
const SPEECH_LEVEL = 0.025;
/** How often the level is sampled while recording. */
const LEVEL_POLL_MS = 100;

/**
 * What a learner reads when something goes wrong.
 *
 * In Norwegian, in both languages' worth of screens. The practice game is in
 * English and the rehearsal is entirely in Norwegian, and these strings turned
 * up in the middle of the Norwegian one — which is the worst place for them,
 * because somebody reading it is already stuck.
 */
const MIC_ERRORS: Record<string, string> = {
    NotAllowedError:
        'Mikrofonen ble blokkert. Tillat mikrofon for dette nettstedet, og prøv igjen.',
    NotFoundError: 'Fant ingen mikrofon. Sjekk at én er koblet til.',
    NotReadableError: 'Mikrofonen er opptatt av et annet program. Lukk det og prøv igjen.',
};

interface Options {
    onResult: (recognition: Recognition) => void;
    /** How long a take may run. Defaults to one phrase. */
    profile?: ListenProfile;
    /**
     * Hand every recording's URL to the caller instead of revoking it.
     *
     * By default the hook keeps one recording at a time: a new take revokes the
     * previous URL, which is right for practice, where only the attempt you
     * just made is worth playing back.
     *
     * A whole exam is different. The rehearsal summary lists every answer and
     * invites you to listen to them, and with the default the only one that
     * still plays is the last. When this is set the caller owns every URL it
     * has been handed, and must revoke them itself.
     */
    ownRecordings?: boolean;
}

export function useVoiceInput({
    onResult,
    profile = PHRASE,
    ownRecordings = false,
}: Options) {
    const supported = recognitionSupported();

    const [listening, setListening] = useState(false);
    const [transcribing, setTranscribing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
    const [recordingAvailable, setRecordingAvailable] = useState(true);
    /**
     * True once this device has shown it cannot record and recognise at once.
     *
     * The recorder then stands down so the speech service can hear. Surfaced
     * so a screen can explain the missing melody chart and playback instead of
     * leaving them unaccountably absent.
     */
    const [recorderStoodDown, setRecorderStoodDown] = useState(recorderTakesMicrophone);
    /** Partial text, which the service produces as the learner speaks. */
    const [interim, setInterim] = useState('');
    /** The listening session for the take in flight. */
    const speechRef = useRef<WebSpeechSession | null>(null);
    /** The profile in force, read inside callbacks without re-creating them. */
    const profileRef = useRef(profile);
    profileRef.current = profile;

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

    /** Whether this hook is responsible for the URLs it creates. */
    const ownsUrls = useRef(!ownRecordings);
    ownsUrls.current = !ownRecordings;

    // Release the last object URL when the hook goes away — unless the caller
    // asked to own them, in which case revoking here would break the playback
    // it asked for.
    useEffect(
        () => () => {
            if (ownsUrls.current && recordingUrlRef.current) {
                URL.revokeObjectURL(recordingUrlRef.current);
            }
        },
        []
    );

    /** `stop` runs before `finish` is declared; this bridges them. */
    const finishRef = useRef<(url: string | null) => Promise<void>>(async () => {});

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
        if (recorder && recorder.state !== 'inactive') {
            recorder.stop();
            return;
        }
        // No recorder to stop, because it stood down for the speech service.
        // The take still has to end, or "Jeg er ferdig" would do nothing.
        if (recorderTakesMicrophone() && speechRef.current) {
            setListening(false);
            void finishRef.current(null);
        }
    }, [clearTimers]);

    /**
     * Put the transcript together with the recording, and hand the result up.
     *
     * @param url The captured audio, or null when the recorder got nothing.
     */
    const finish = useCallback(async (url: string | null) => {
        setTranscribing(true);
        try {
            const session = speechRef.current;
            speechRef.current = null;
            // Ask the service to finish and flush: the recorder has stopped, so
            // whatever it is still holding belongs to this take.
            session?.stop();
            const outcome = await session?.done;
            const text = outcome?.text ? cleanTranscript(outcome.text) : '';

            // No audio: the service took the microphone for itself. The
            // transcript is still worth having, so it goes up without the
            // speech window — everything downstream treats that as "no claim
            // made about the recognition" rather than as silence.
            if (!url) {
                if (!text) {
                    setError(
                        EMPTY_MESSAGES[
                            diagnoseEmptyTranscript({
                                hasRecording: false,
                                // Nothing was recorded, so nothing can be said
                                // about whether there was speech.
                                hasSpeech: false,
                                alreadyKnown: recorderTakesMicrophone(),
                            })
                        ]
                    );
                    return;
                }
                onResultRef.current({ text });
                return;
            }

            /**
             * Reading the clip must never be what ends the attempt.
             *
             * Decoding can throw as well as return nothing: an unusual
             * container, a codec the browser will not open, an
             * OfflineAudioContext that refuses. That used to escape to the
             * outer catch, where a raw exception message was shown to the
             * learner in place of anything useful — and the microphone
             * diagnosis below never ran at all.
             *
             * A clip we could not read leaves `heardSpeech` null: unknown,
             * which is the honest value and not the same as silent.
             */
            let audio: Float32Array | null = null;
            try {
                audio = await decodeForRecognition(url);
            } catch {
                audio = null;
            }

            const speech = audio?.length ? findSpeechBounds(audio, RECOGNITION_RATE) : null;
            const heardSpeech: boolean | null = audio?.length ? Boolean(speech) : null;

            if (!text) {
                const verdict = diagnoseEmptyTranscript({
                    hasRecording: true,
                    hasSpeech: heardSpeech,
                    alreadyKnown: recorderTakesMicrophone(),
                });
                if (verdict === 'opptaket-tar-mikrofonen') {
                    rememberRecorderTakesMicrophone();
                    setRecorderStoodDown(true);
                }
                setError(EMPTY_MESSAGES[verdict]);
                return;
            }

            onResultRef.current({ text, speech });
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Fikk ikke lest opptaket.');
        } finally {
            setTranscribing(false);
        }
    }, []);

    finishRef.current = finish;

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
                } else if (hasSpoken && Date.now() - spokeAt > profileRef.current.silenceMs) {
                    stop();
                }
            }, LEVEL_POLL_MS);

            stopTimersRef.current.push(
                window.setTimeout(() => {
                    if (!hasSpoken) stop();
                }, profileRef.current.noSpeechMs),
                window.setTimeout(stop, profileRef.current.maxMs)
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
            setError(MIC_ERRORS[name] ?? 'Mikrofonen kunne ikke åpnes.');
            setRecordingAvailable(false);
            return;
        }

        setRecordingAvailable(true);

        /**
         * On a device that cannot share the microphone, do not record at all.
         *
         * The speech service opens its own microphone; we cannot hand it ours.
         * Where the two cannot coexist — iOS, and therefore every browser on an
         * iPhone or iPad — the recorder wins the fight and recognition comes
         * back empty, every time. Standing the recorder down costs the melody
         * chart and listening back, and buys the words, which is the half
         * nothing else can supply.
         *
         * The stream is still opened first, and on purpose: on iOS that is what
         * makes the browser show its microphone prompt while the learner's tap
         * is still in hand.
         */
        if (recorderTakesMicrophone()) {
            stream.getTracks().forEach(track => track.stop());
            // Nothing is recording, so a stale recorder from an earlier take
            // must not be what `stop()` finds.
            mediaRecorderRef.current = null;
            setListening(true);
            setInterim('');

            const session = listen({
                onInterim: setInterim,
                continuous: profileRef.current.continuous,
            });
            speechRef.current = session;

            // WITHOUT A RECORDER THERE IS NO LEVEL METER, so the usual
            // stop-on-silence cannot run. The speech service ending is the only
            // signal left that the learner has finished, and waiting out the
            // whole ceiling instead would make every attempt feel broken.
            void session.done.then(() => {
                if (speechRef.current !== session) return;
                setListening(false);
                void finishRef.current(null);
            });

            stopTimersRef.current.push(
                window.setTimeout(() => {
                    setListening(false);
                    void finishRef.current(null);
                }, profileRef.current.maxMs)
            );
            return;
        }

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
            if (ownsUrls.current && recordingUrlRef.current) {
                URL.revokeObjectURL(recordingUrlRef.current);
            }
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
        speechRef.current = listen({
            onInterim: setInterim,
            continuous: profileRef.current.continuous,
        });

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
            stopTimersRef.current.push(window.setTimeout(stop, profileRef.current.maxMs));
        }
    }, [listening, transcribing, supported, clearTimers, releaseAudio, finish, watchLevel, stop]);

    /**
     * Give the microphone to the speech service, for good, on this device.
     *
     * The app tries to work this out by itself, and on the device in front of
     * you it may not manage: browsers differ in whether a starved speech
     * service reports an error, returns an empty result, or simply never
     * finishes. Rather than leave somebody reading "fikk ikke tak i ordene"
     * after every attempt they will ever make, the switch is offered where
     * that message appears.
     */
    const standDownRecorder = useCallback(() => {
        rememberRecorderTakesMicrophone();
        setRecorderStoodDown(true);
        setError(null);
    }, []);

    return {
        supported,
        listening,
        transcribing,
        error,
        standDownRecorder,
        recordingUrl,
        recordingAvailable,
        /** True when this device made the app choose words over audio. */
        recorderStoodDown,
        analyserRef,
        interim,
        start,
        stop,
    };
}
