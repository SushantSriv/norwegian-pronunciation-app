/**
 * Word error rate for candidate speech models, on real Norwegian speech.
 *
 * The app's recognition model is the single biggest lever on whether a learner
 * is scored fairly, and picking one by reputation is guesswork. This measures
 * it. Audio comes from google/fleurs `nb_no` — read Norwegian Bokmål with
 * reference transcriptions, CC-BY and ungated, fetched through the Hugging Face
 * datasets server so nothing has to be committed.
 *
 *   node scripts/bench-asr.mjs
 *   node scripts/bench-asr.mjs --clips 20 --models Xenova/whisper-base,Xenova/whisper-small
 *
 * Measured on 8 clips (99 s), quantized to q8 unless noted:
 *
 *   Xenova/whisper-small   WER 35.8%   240 MB   0.42x real time
 *   Xenova/whisper-base    WER 48.3%    76 MB   0.18x real time   <- what ships
 *   Xenova/whisper-tiny    WER 64.8%   145 MB   0.09x real time   (fp32)
 *   Xenova/whisper-tiny    WER 79.0%    41 MB   0.13x real time
 *
 * Two things worth knowing before reading those numbers. FLEURS is long-form
 * read prose with hard vocabulary, so the absolute rates are far worse than
 * this app's short everyday phrases will see; it is the RANKING that transfers.
 * And q8 quantization costs `tiny` enormously — 79% against 64.8% for the same
 * weights unquantized — which is why the answer was to grow the model rather
 * than to unquantize it.
 *
 * NB Uttale's own Norwegian-tuned checkpoints (NbAiLab/nb-whisper-*) would
 * almost certainly beat all of these, and cannot be used: they publish a split
 * encoder/decoder ONNX export with no merged decoder and no quantized weights,
 * which transformers.js cannot load and which would be a 216 MB download if it
 * could. Re-exporting them is the obvious next improvement.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { pipeline, env } from '@huggingface/transformers';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
    const at = args.indexOf(`--${name}`);
    return at === -1 ? fallback : args[at + 1];
};

const CLIPS = Number(flag('clips', 8));
const CACHE = flag('cache', './.bench-cache');
const MODELS = flag('models', 'Xenova/whisper-tiny,Xenova/whisper-base')
    .split(',')
    .map(id => ({ id, dtype: flag('dtype', 'q8') }));

env.allowLocalModels = false;
env.cacheDir = `${CACHE}/models`;
mkdirSync(CACHE, { recursive: true });

/**
 * Decode a WAV to mono Float32.
 *
 * FLEURS serves 32-bit IEEE float (format 3), not the 16-bit PCM one reaches
 * for by habit. Reading it as int16 yields noise, and Whisper answers noise
 * with a fluent hallucination rather than an error — which is exactly how a
 * broken harness passes for a broken model. It reported 97% for every
 * checkpoint before this was fixed.
 */
function decodeWav(buffer) {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const chunkId = at =>
        String.fromCharCode(...new Uint8Array(buffer.buffer, buffer.byteOffset + at, 4));

    let offset = 12;
    let format = 1;
    let channels = 1;
    let rate = 16000;
    let bits = 16;
    let dataOffset = 0;
    let dataLength = 0;

    while (offset < view.byteLength - 8) {
        const id = chunkId(offset);
        const size = view.getUint32(offset + 4, true);
        if (id === 'fmt ') {
            format = view.getUint16(offset + 8, true);
            channels = view.getUint16(offset + 10, true);
            rate = view.getUint32(offset + 12, true);
            bits = view.getUint16(offset + 22, true);
        } else if (id === 'data') {
            dataOffset = offset + 8;
            dataLength = size;
            break;
        }
        offset += 8 + size + (size % 2);
    }

    const bytesPerSample = bits / 8;
    const frames = Math.floor(dataLength / (bytesPerSample * channels));
    const out = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
        const at = dataOffset + i * channels * bytesPerSample;
        if (format === 3 && bits === 32) out[i] = view.getFloat32(at, true);
        else if (bits === 16) out[i] = view.getInt16(at, true) / 32768;
        else if (bits === 32) out[i] = view.getInt32(at, true) / 2147483648;
        else throw new Error(`unsupported WAV: format ${format}, ${bits} bits`);
    }
    return { audio: out, rate };
}

/** Case, punctuation and spacing are not what is being measured. */
const normalise = text =>
    text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

function wordErrors(reference, hypothesis) {
    const a = normalise(reference).split(' ').filter(Boolean);
    const b = normalise(hypothesis).split(' ').filter(Boolean);
    let prev = Array.from({ length: b.length + 1 }, (_, k) => k);
    for (let i = 1; i <= a.length; i++) {
        const curr = [i];
        for (let j = 1; j <= b.length; j++) {
            curr[j] = Math.min(
                prev[j] + 1,
                curr[j - 1] + 1,
                prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
        }
        prev = curr;
    }
    return { errors: prev[b.length], words: a.length };
}

// ---- clips ----------------------------------------------------------------
const indexPath = `${CACHE}/fleurs.json`;
if (!existsSync(indexPath)) {
    const url =
        'https://datasets-server.huggingface.co/rows?dataset=google%2Ffleurs' +
        `&config=nb_no&split=test&offset=0&length=${CLIPS}`;
    writeFileSync(indexPath, Buffer.from(await (await fetch(url)).arrayBuffer()));
}

const clips = [];
for (const [i, row] of JSON.parse(readFileSync(indexPath, 'utf8')).rows.slice(0, CLIPS).entries()) {
    const path = `${CACHE}/clip${i}.wav`;
    if (!existsSync(path)) {
        const audio = row.row.audio;
        const src = Array.isArray(audio) ? audio[0].src : audio.src;
        writeFileSync(path, Buffer.from(await (await fetch(src)).arrayBuffer()));
    }
    const { audio, rate } = decodeWav(readFileSync(path));
    clips.push({ audio, text: row.row.transcription, seconds: audio.length / rate });
}
const totalSeconds = clips.reduce((sum, clip) => sum + clip.seconds, 0);
console.log(`${clips.length} clips, ${totalSeconds.toFixed(0)}s of Norwegian speech\n`);

// ---- run ------------------------------------------------------------------
const results = [];
for (const { id, dtype } of MODELS) {
    process.stdout.write(`${id} (${dtype}) loading… `);
    let transcribe;
    try {
        transcribe = await pipeline('automatic-speech-recognition', id, { dtype });
    } catch (error) {
        console.log('FAILED:', error.message.slice(0, 140));
        continue;
    }
    console.log('ok');

    let errors = 0;
    let words = 0;
    let inferSeconds = 0;
    let sample = null;

    for (const clip of clips) {
        const started = Date.now();
        const out = await transcribe(clip.audio, {
            language: 'no',
            task: 'transcribe',
            chunk_length_s: 30,
        });
        inferSeconds += (Date.now() - started) / 1000;
        const text = Array.isArray(out) ? out[0].text : out.text;
        const scored = wordErrors(clip.text, text);
        errors += scored.errors;
        words += scored.words;
        sample ??= { ref: clip.text, hyp: text.trim() };
    }

    const wer = (100 * errors) / words;
    results.push({ id, dtype, wer, realtime: inferSeconds / totalSeconds });
    console.log(`  WER ${wer.toFixed(1)}%   ${(inferSeconds / totalSeconds).toFixed(2)}x real time`);
    console.log(`    ref: ${sample.ref.slice(0, 100)}`);
    console.log(`    hyp: ${sample.hyp.slice(0, 100)}\n`);
}

console.log('=== SUMMARY ===');
for (const result of results.sort((a, b) => a.wer - b.wer)) {
    console.log(
        `${result.id} (${result.dtype})`.padEnd(44) +
            `WER ${result.wer.toFixed(1)}%`.padEnd(13) +
            `${result.realtime.toFixed(2)}x real time`
    );
}
