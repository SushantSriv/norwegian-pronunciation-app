import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    cloudTakesMicrophone,
    listenOnce,
    rememberCloudTakesMicrophone,
    speechReady,
    webSpeechAvailable,
} from '../webSpeech';

/** A stand-in for the browser's SpeechRecognition, driven by the test. */
class FakeRecognition {
    static last: FakeRecognition | null = null;
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
    start() {}
    stop() {}
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
