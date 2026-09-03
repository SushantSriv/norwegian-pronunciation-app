import { describe, expect, it, vi } from 'vitest';
import {
    cleanTranscript,
    createAsrClient,
    looksHallucinated,
    recognitionSupported,
    type AsrRequest,
    type AsrResponse,
    type AsrStatus,
} from '../asr';
import { toMono } from '../audioDecode';

/**
 * A stand-in for the real worker, so the client can be driven through every
 * message it has to handle without loading a 40 MB model.
 */
function fakeWorker() {
    const sent: AsrRequest[] = [];
    const worker = {
        postMessage: (message: AsrRequest) => sent.push(message),
        terminate: vi.fn(),
        onmessage: null as ((e: MessageEvent<AsrResponse>) => void) | null,
        onerror: null as ((e: ErrorEvent) => void) | null,
    };
    return {
        sent,
        spawn: () => worker as unknown as Worker,
        reply: (message: AsrResponse) =>
            worker.onmessage?.({ data: message } as MessageEvent<AsrResponse>),
        crash: (message: string) => worker.onerror?.({ message } as ErrorEvent),
        terminated: () => worker.terminate.mock.calls.length,
    };
}

describe('cleanTranscript', () => {
    it('strips the leading space Whisper always emits', () => {
        expect(cleanTranscript(' Hva er det?')).toBe('Hva er det?');
    });

    it('collapses stray whitespace so word alignment is not thrown off', () => {
        expect(cleanTranscript('  god\n  morgen  ')).toBe('god morgen');
        expect(cleanTranscript('')).toBe('');
    });
});

describe('looksHallucinated', () => {
    it('treats an empty transcript as nothing heard', () => {
        expect(looksHallucinated('')).toBe(true);
        expect(looksHallucinated('   ')).toBe(true);
    });

    it('catches the caption artefacts Whisper falls back on for silence', () => {
        // These come out of its training data, not out of the microphone.
        expect(looksHallucinated('Takk for at du så på!')).toBe(true);
        expect(looksHallucinated('Tekst og undertekster av Nicolai Winther')).toBe(true);
    });

    it('leaves real answers alone', () => {
        expect(looksHallucinated('god morgen')).toBe(false);
        expect(looksHallucinated('jeg heter Ola')).toBe(false);
        // Contains a stock word but is plainly an attempt at the phrase.
        expect(looksHallucinated('tusen takk')).toBe(false);
    });
});

describe('recognitionSupported', () => {
    // jsdom provides no Worker, so it has to be supplied here; a browser has one.
    const withWorker = (navigatorStub: object) => {
        vi.stubGlobal('Worker', class {});
        vi.stubGlobal('navigator', navigatorStub);
        const result = recognitionSupported();
        vi.unstubAllGlobals();
        return result;
    };

    it('accepts a browser with a microphone, a worker and WebAssembly', () => {
        expect(withWorker({ mediaDevices: { getUserMedia: () => Promise.resolve({}) } })).toBe(true);
    });

    it('refuses a browser that exposes no microphone', () => {
        expect(withWorker({})).toBe(false);
    });

    it('refuses a browser with no worker support', () => {
        vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => Promise.resolve({}) } });
        // jsdom already lacks Worker, which is exactly the case being checked.
        expect(recognitionSupported()).toBe(false);
        vi.unstubAllGlobals();
    });
});

describe('createAsrClient', () => {
    it('reports loading, progress and readiness to subscribers', () => {
        const worker = fakeWorker();
        const client = createAsrClient(worker.spawn);

        const seen: AsrStatus[] = [];
        client.subscribe(status => seen.push(status));
        expect(seen[0]).toEqual({ state: 'idle', progress: 0 });

        client.load();
        worker.reply({ type: 'progress', ratio: 0.4 });
        worker.reply({ type: 'ready', dtype: 'q8' });

        expect(seen.map(s => s.state)).toEqual(['idle', 'loading', 'loading', 'ready']);
        // Which precision the browser accepted is worth knowing: ORT-web rejects
        // builds ORT-node loads, so the worker walks a list.
        expect(seen.at(-1)?.dtype).toBe('q8');
        expect(seen[2].progress).toBe(0.4);
        expect(worker.sent).toEqual([{ type: 'load' }]);
    });

    it('does not start a second load once one is under way', () => {
        const worker = fakeWorker();
        const client = createAsrClient(worker.spawn);
        client.load();
        client.load();
        worker.reply({ type: 'ready', dtype: 'q8' });
        client.load();
        expect(worker.sent).toHaveLength(1);
    });

    it('resolves a transcription with the text the worker returned', async () => {
        const worker = fakeWorker();
        const client = createAsrClient(worker.spawn);

        const pending = client.transcribe(new Float32Array([0.1, 0.2, 0.3]));
        const request = worker.sent[0];
        expect(request.type).toBe('transcribe');
        worker.reply({
            type: 'result',
            id: (request as { id: number }).id,
            text: ' god morgen',
            words: [
                { word: 'god', start: 0.1, end: 0.4 },
                { word: 'morgen', start: 0.4, end: 0.9 },
            ],
        });

        await expect(pending).resolves.toEqual({
            text: ' god morgen',
            words: [
                { word: 'god', start: 0.1, end: 0.4 },
                { word: 'morgen', start: 0.4, end: 0.9 },
            ],
        });
    });

    it('sends a copy, so the caller’s decoded audio is not detached', async () => {
        const worker = fakeWorker();
        const client = createAsrClient(worker.spawn);

        const audio = new Float32Array([0.5, 0.5]);
        void client.transcribe(audio).catch(() => undefined);
        // The buffer is transferred to the worker; had it been the caller's own
        // it would now be detached and unreadable.
        expect(audio.byteLength).toBe(8);
        expect(audio[0]).toBe(0.5);

        client.dispose();
    });

    it('rejects the right request when the worker reports an error', async () => {
        const worker = fakeWorker();
        const client = createAsrClient(worker.spawn);

        const first = client.transcribe(new Float32Array([1]));
        const second = client.transcribe(new Float32Array([1]));
        const ids = worker.sent.map(m => (m as { id: number }).id);

        worker.reply({ type: 'error', id: ids[0], message: 'decoder blew up' });
        worker.reply({ type: 'result', id: ids[1], text: 'takk', words: [] });

        await expect(first).rejects.toThrow('decoder blew up');
        await expect(second).resolves.toEqual({ text: 'takk', words: [] });
    });

    it('fails everything outstanding when the model cannot load', async () => {
        const worker = fakeWorker();
        const client = createAsrClient(worker.spawn);

        const pending = client.transcribe(new Float32Array([1]));
        worker.reply({ type: 'failed', message: 'offline' });

        await expect(pending).rejects.toThrow('offline');
        expect(client.status().state).toBe('failed');
        // And it does not pretend a later attempt might work.
        await expect(client.transcribe(new Float32Array([1]))).rejects.toThrow('offline');
    });

    it('surfaces a worker that dies outright', async () => {
        const worker = fakeWorker();
        const client = createAsrClient(worker.spawn);
        const pending = client.transcribe(new Float32Array([1]));
        worker.crash('SharedArrayBuffer is not defined');

        await expect(pending).rejects.toThrow('SharedArrayBuffer');
        expect(client.status().state).toBe('failed');
    });

    it('terminates the worker and clears pending work on dispose', async () => {
        const worker = fakeWorker();
        const client = createAsrClient(worker.spawn);
        const pending = client.transcribe(new Float32Array([1]));

        client.dispose();

        await expect(pending).rejects.toThrow(/cancelled/i);
        expect(worker.terminated()).toBe(1);
        expect(client.status().state).toBe('idle');
    });
});

describe('toMono', () => {
    /** Minimal stand-in for an AudioBuffer; toMono only reads these three. */
    const buffer = (channels: number[][]) =>
        ({
            numberOfChannels: channels.length,
            length: channels[0].length,
            getChannelData: (i: number) => new Float32Array(channels[i]),
        }) as unknown as AudioBuffer;

    it('passes mono through untouched', () => {
        expect([...toMono(buffer([[0.1, 0.2]]))]).toEqual([
            expect.closeTo(0.1, 5),
            expect.closeTo(0.2, 5),
        ]);
    });

    it('averages the channels rather than picking one', () => {
        // A voice panned hard to one side would otherwise come out half as loud
        // as the model expects, or vanish entirely.
        const mixed = toMono(
            buffer([
                [1, 0],
                [0, 1],
            ])
        );
        expect([...mixed]).toEqual([0.5, 0.5]);
    });
});
