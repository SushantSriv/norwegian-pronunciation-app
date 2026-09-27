import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    cloudTakesMicrophone,
    listen,
    listenOnce,
    rememberCloudTakesMicrophone,
    speechReady,
    webSpeechAvailable,
} from '../webSpeech';

/** A stand-in for the browser's SpeechRecognition, driven by the test. */
class FakeRecognition {
    static last: FakeRecognition | null = null;
    static started = 0;
    static stopped = 0;
    lang = '';
    continuous = false;
    interimResults = false;
    maxAlternatives = 1;
    onresult: ((e: unknown) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    onstart: (() => void) | null = null;
    aborted = false;

    constructor() {
        FakeRecognition.last = this;
    }
    start() {
        FakeRecognition.started++;
    }
    stop() {
        FakeRecognition.stopped++;
        // The real service flushes and then ends.
        this.onend?.();
    }
    abort() {
        this.aborted = true;
    }

    /** Deliver a result the way the real API does. */
    say(text: string, isFinal: boolean) {
        this.onresult?.({
            resultIndex: 0,
            results: { length: 1, 0: { length: 1, isFinal, 0: { transcript: text, confidence: 1 } } },
        });
    }
    fail(error: string) {
        this.onerror?.({ error });
    }
    end() {
        this.onend?.();
    }
}

const withService = () => vi.stubGlobal('SpeechRecognition', FakeRecognition);

beforeEach(() => {
    window.localStorage.clear();
    FakeRecognition.last = null;
    FakeRecognition.started = 0;
    FakeRecognition.stopped = 0;
});
afterEach(() => vi.unstubAllGlobals());

describe('webSpeechAvailable', () => {
    it('is false when the browser has no such service', () => {
        expect(webSpeechAvailable()).toBe(false);
    });

    it('is true when it does', () => {
        withService();
        expect(webSpeechAvailable()).toBe(true);
    });
});

describe('listenOnce', () => {
    it('resolves with the final transcript', async () => {
        withService();
        const pending = listenOnce();
        FakeRecognition.last!.say('god morgen', true);
        FakeRecognition.last!.end();
        await expect(pending).resolves.toMatchObject({ text: 'god morgen' });
    });

    it('reports partial text as it arrives', async () => {
        withService();
        const seen: string[] = [];
        const pending = listenOnce({ onInterim: text => seen.push(text) });
        FakeRecognition.last!.say('god', false);
        FakeRecognition.last!.say('god morgen', true);
        FakeRecognition.last!.end();
        await pending;
        expect(seen).toEqual(['god']);
    });

    it('resolves rather than rejects on failure, so the caller can fall back', async () => {
        withService();
        const pending = listenOnce();
        FakeRecognition.last!.fail('network');
        await expect(pending).resolves.toMatchObject({ text: null, conflict: false });
    });

    /**
     * The case that decides whether the fast path may be used at all: the
     * service taking the microphone means no recording, and no recording means
     * no pitch contour and no melody chart.
     */
    it('flags a microphone it will not share', async () => {
        withService();
        for (const error of ['not-allowed', 'audio-capture', 'service-not-allowed']) {
            const pending = listenOnce();
            FakeRecognition.last!.fail(error);
            await expect(pending).resolves.toMatchObject({ conflict: true });
        }
    });

    it('gives nothing back when there is no service', async () => {
        await expect(listenOnce()).resolves.toMatchObject({ text: null, error: 'unavailable' });
    });

    it('produces no text when the learner said nothing', async () => {
        withService();
        const pending = listenOnce();
        FakeRecognition.last!.end();
        await expect(pending).resolves.toMatchObject({ text: null });
    });
});

describe('speechReady', () => {
    it('is true where the service exists', () => {
        withService();
        expect(speechReady()).toBe(true);
    });

    it('is false where it does not — there is no local fallback any more', () => {
        expect(speechReady()).toBe(false);
    });

    it('records a device that takes the microphone, without standing down', () => {
        // It used to hand over to the on-device model here. That model is gone,
        // so this is now only an observation: the transcript still arrives, and
        // only the melody chart is lost.
        withService();
        rememberCloudTakesMicrophone();
        expect(cloudTakesMicrophone()).toBe(true);
        expect(speechReady()).toBe(true);
    });
});

describe('listen — a session the caller ends', () => {
    it('stops with the speaker by default, as a phrase should', async () => {
        withService();
        const session = listen();
        FakeRecognition.last!.say('god morgen', true);
        FakeRecognition.last!.end();

        await expect(session.done).resolves.toMatchObject({ text: 'god morgen' });
        expect(FakeRecognition.started).toBe(1);
    });

    it('keeps going across a pause when asked to', async () => {
        // The whole point of the exam mode: somebody thinking mid-answer must
        // not be cut off. The service ends on its own; we start it again.
        withService();
        const session = listen({ continuous: true });

        FakeRecognition.last!.say('jeg heter Kari', true);
        FakeRecognition.last!.end(); // the service gives up on the silence
        expect(FakeRecognition.started).toBe(2);

        FakeRecognition.last!.say(' og jeg bor i Bergen', true);
        session.stop();

        await expect(session.done).resolves.toMatchObject({
            text: 'jeg heter Kari og jeg bor i Bergen',
        });
    });

    it('does not restart once the caller has stopped it', async () => {
        withService();
        const session = listen({ continuous: true });
        FakeRecognition.last!.say('ferdig', true);
        session.stop();
        await session.done;

        const startedAtStop = FakeRecognition.started;
        FakeRecognition.last!.end();
        expect(FakeRecognition.started).toBe(startedAtStop);
    });

    it('treats a silence timeout as a pause, not a failure', async () => {
        withService();
        const session = listen({ continuous: true });
        FakeRecognition.last!.say('noe', true);
        FakeRecognition.last!.fail('no-speech');

        // Still listening: no-speech while continuous is somebody thinking.
        FakeRecognition.last!.say(' mer', true);
        session.stop();
        await expect(session.done).resolves.toMatchObject({ text: 'noe mer' });
    });

    it('ends on a real failure and keeps what it already heard', async () => {
        withService();
        const session = listen({ continuous: true });
        FakeRecognition.last!.say('halvveis', true);
        FakeRecognition.last!.fail('audio-capture');

        await expect(session.done).resolves.toMatchObject({
            text: 'halvveis',
            conflict: true,
        });
    });

    it('reports the answer building up, for a long one', async () => {
        withService();
        const finals: string[] = [];
        const interims: string[] = [];
        const session = listen({
            continuous: true,
            onFinal: text => finals.push(text),
            onInterim: text => interims.push(text),
        });

        FakeRecognition.last!.say('jeg tenker', false);
        FakeRecognition.last!.say('jeg tenker at', true);
        FakeRecognition.last!.say(' det er fint', true);
        session.stop();
        await session.done;

        expect(interims).toEqual(['jeg tenker']);
        expect(finals).toEqual(['jeg tenker at', 'jeg tenker at det er fint']);
    });

    it('hands back nothing, rather than hanging, with no service at all', async () => {
        const session = listen({ continuous: true });
        session.stop();
        await expect(session.done).resolves.toMatchObject({ text: null, error: 'unavailable' });
    });
});
