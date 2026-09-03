import { describe, expect, it } from 'vitest';
import { adviseMelody, correlation } from '../melodyAdvice';
import {
    analysePhraseMelody,
    mergeCompoundTimings,
    problemWords,
    sliceContour,
} from '../phraseMelody';
import { sampleContour } from '../melodyScore';
import { targetContour, type PitchAccent } from '../../data/tonelag';
import type { PitchContour, PitchPoint } from '../pitch';

// ---------------------------------------------------------------------------
// Helpers: build a contour where each word occupies a known slice of time.
// ---------------------------------------------------------------------------

const HOP = 0.01;

/** A contour made of one semitone series per word, laid end to end. */
function contourOfWords(shapes: number[][]): { contour: PitchContour; spans: number[][] } {
    const points: PitchPoint[] = [];
    const spans: number[][] = [];
    let time = 0;

    for (const shape of shapes) {
        const start = time;
        for (const semitones of shape) {
            points.push({ time, hz: 120 * Math.pow(2, semitones / 12), semitones });
            time += HOP;
        }
        spans.push([start, time - HOP]);
    }

    return {
        contour: {
            points,
            voicedCount: points.length,
            medianHz: 120,
            minHz: 80,
            maxHz: 200,
            rangeSemitones: 6,
        },
        spans,
    };
}

const shapeOf = (accent: PitchAccent, frames: number) =>
    sampleContour(targetContour(accent), frames);

const flat = (frames: number) => new Array<number>(frames).fill(0);

describe('sliceContour', () => {
    it('takes only the points inside the span', () => {
        const { contour } = contourOfWords([flat(10), flat(10)]);
        // A span with a little margin, because the word boundaries this gets in
        // real use come from the model and never coincide with frame times.
        const slice = sliceContour(contour, 0.095, 0.195);
        expect(slice.length).toBeGreaterThanOrEqual(9);
        expect(slice.every(p => p.time >= 0.095 && p.time <= 0.195)).toBe(true);
    });

    it('is empty for a span outside the recording', () => {
        const { contour } = contourOfWords([flat(10)]);
        expect(sliceContour(contour, 5, 6)).toEqual([]);
    });
});

describe('mergeCompoundTimings', () => {
    it('joins two heard words whose join is a word the phrase asked for', () => {
        // The same reconciliation scoring does, so the spans keep lining up
        // with the words being judged.
        const merged = mergeCompoundTimings(
            ['jeg', 'henter', 'skiftetøy'],
            [
                { word: 'jeg', start: 0, end: 0.3 },
                { word: 'henter', start: 0.3, end: 0.8 },
                { word: 'skifte', start: 0.8, end: 1.2 },
                { word: 'tøy', start: 1.2, end: 1.6 },
            ]
        );
        expect(merged.map(w => w.word)).toEqual(['jeg', 'henter', 'skiftetøy']);
        expect(merged[2]).toMatchObject({ start: 0.8, end: 1.6 });
    });

    it('leaves words alone when the join is not being asked for', () => {
        const timings = [
            { word: 'god', start: 0, end: 0.3 },
            { word: 'morgen', start: 0.3, end: 0.9 },
        ];
        expect(mergeCompoundTimings(['god', 'morgen'], timings)).toEqual(timings);
    });
});

describe('analysePhraseMelody', () => {
    const accents: Record<string, PitchAccent> = {
        kjøpte: 'ACCENT_2',
        bilen: 'ACCENT_1',
        ny: 'ACCENT_1',
        jeg: 'ACCENT_1',
    };
    const accentFor = (word: string) => accents[word] ?? 'ACCENT_2';

    it('returns one row per expected word, in order', () => {
        const { contour, spans } = contourOfWords([flat(30), flat(30)]);
        const melody = analysePhraseMelody({
            expected: 'jeg kjøpte',
            words: [
                { word: 'jeg', start: spans[0][0], end: spans[0][1] },
                { word: 'kjøpte', start: spans[1][0], end: spans[1][1] },
            ],
            contour,
            accentFor,
        });
        expect(melody.map(m => m.word)).toEqual(['jeg', 'kjøpte']);
        expect(melody.map(m => m.index)).toEqual([0, 1]);
    });

    it('judges each word against its own accent, on its own slice of audio', () => {
        // "kjøpte" accent 2 said well; "bilen" accent 1 said well.
        const { contour, spans } = contourOfWords([
            shapeOf('ACCENT_2', 40),
            shapeOf('ACCENT_1', 40),
        ]);
        const melody = analysePhraseMelody({
            expected: 'kjøpte bilen',
            words: [
                { word: 'kjøpte', start: spans[0][0], end: spans[0][1] },
                { word: 'bilen', start: spans[1][0], end: spans[1][1] },
            ],
            contour,
            accentFor,
        });

        expect(melody[0].status).toBe('good');
        expect(melody[0].score).toBeGreaterThan(90);
        expect(melody[1].status).toBe('good');
    });

    /**
     * The bug that made this feature untrustworthy in real use.
     *
     * Pitch accent lands on the word carrying prominence; the rest of a phrase
     * is reduced, and reduced is CORRECT. Grading every word against a
     * full-prominence contour told learners they had mispronounced words they
     * had said perfectly well, which is worse than saying nothing.
     */
    it('does not call an unaccented word wrong', () => {
        const { contour, spans } = contourOfWords([shapeOf('ACCENT_2', 40), flat(40)]);
        const melody = analysePhraseMelody({
            expected: 'kjøpte bilen',
            words: [
                { word: 'kjøpte', start: spans[0][0], end: spans[0][1] },
                { word: 'bilen', start: spans[1][0], end: spans[1][1] },
            ],
            contour,
            accentFor,
        });

        expect(melody[1].status).toBe('not-judged');
        expect(melody[1].advice).toBeNull();
        // It is still shown, with its contour, for comparison.
        expect(melody[1].points.length).toBeGreaterThan(0);
    });

    it('needs real separation before naming the wrong accent', () => {
        // Accent 1 produced where accent 2 was wanted, with full prominence:
        // this one IS worth telling the learner about.
        const { contour, spans } = contourOfWords([shapeOf('ACCENT_1', 40)]);
        const melody = analysePhraseMelody({
            expected: 'kjøpte',
            words: [{ word: 'kjøpte', start: spans[0][0], end: spans[0][1] }],
            contour,
            accentFor,
        });
        expect(melody[0].status).toBe('wrong');
    });

    it('says nothing about a monosyllable, which has no tonal contrast', () => {
        const { contour, spans } = contourOfWords([flat(40)]);
        const melody = analysePhraseMelody({
            expected: 'ny',
            words: [{ word: 'ny', start: spans[0][0], end: spans[0][1] }],
            contour,
            accentFor,
        });
        expect(melody[0].status).toBe('no-contrast');
        expect(melody[0].advice).toBeNull();
    });

    it('marks a word the model never heard', () => {
        const { contour, spans } = contourOfWords([shapeOf('ACCENT_2', 40)]);
        const melody = analysePhraseMelody({
            expected: 'kjøpte bilen',
            words: [{ word: 'kjøpte', start: spans[0][0], end: spans[0][1] }],
            contour,
            accentFor,
        });
        expect(melody[1].status).toBe('not-heard');
        expect(melody[1].span).toBeNull();
    });

    it('declines to judge a word with too little voiced sound', () => {
        // Two syllables of tonelag needs 300 ms or so; ten frames is noise.
        const { contour, spans } = contourOfWords([shapeOf('ACCENT_2', 10)]);
        const melody = analysePhraseMelody({
            expected: 'kjøpte',
            words: [{ word: 'kjøpte', start: spans[0][0], end: spans[0][1] }],
            contour,
            accentFor,
        });
        expect(melody[0].status).toBe('unmeasurable');
    });

    it('surfaces the words that went wrong first', () => {
        // "kjøpte" wants accent 2 and got a prominent accent 1: a real miss.
        const { contour, spans } = contourOfWords([
            shapeOf('ACCENT_1', 40),
            shapeOf('ACCENT_1', 40),
        ]);
        const melody = analysePhraseMelody({
            expected: 'kjøpte bilen',
            words: [
                { word: 'kjøpte', start: spans[0][0], end: spans[0][1] },
                { word: 'bilen', start: spans[1][0], end: spans[1][1] },
            ],
            contour,
            accentFor,
        });
        expect(problemWords(melody).map(m => m.word)).toEqual(['kjøpte']);
    });
});

// ---------------------------------------------------------------------------

describe('correlation', () => {
    it('is 1 for the same shape and -1 for its mirror', () => {
        const rising = [0, 1, 2, 3];
        expect(correlation(rising, rising)).toBeCloseTo(1, 6);
        expect(correlation(rising, [3, 2, 1, 0])).toBeCloseTo(-1, 6);
    });

    it('is zero when there is nothing to compare', () => {
        expect(correlation([], [])).toBe(0);
        expect(correlation([1, 1, 1], [1, 2, 3])).toBe(0);
    });
});

describe('adviseMelody', () => {
    const target = shapeOf('ACCENT_2', 32);

    it('says flat before anything else', () => {
        // No point discussing peak timing with someone who did not move.
        expect(adviseMelody(flat(32), target, null, 'ACCENT_2').issue).toBe('flat');
    });

    it('names the wrong accent when the delivery clearly fits the other one', () => {
        const advice = adviseMelody(
            shapeOf('ACCENT_1', 32),
            target,
            { accent: 'ACCENT_1', margin: 2, clear: true },
            'ACCENT_2'
        );
        expect(advice.issue).toBe('wrong-accent');
        expect(advice.text).toMatch(/Tonelag 1/);
        expect(advice.text).toMatch(/Tonelag 2/);
    });

    it('catches a contour running the opposite way', () => {
        // A rise against a fall. Note that reversing an accent-2 contour does
        // NOT do this: it is a dip in the middle either way, so it still
        // correlates positively and is caught by peak timing instead.
        const rising = Array.from({ length: 32 }, (_, i) => (i / 31) * 6 - 3);
        const falling = [...rising].reverse();
        expect(adviseMelody(falling, rising, null, 'ACCENT_1').issue).toBe('wrong-direction');
    });

    it('catches a peak in the wrong place', () => {
        // Target accent 1 climbs to a peak at the end; peak early instead.
        const accent1 = shapeOf('ACCENT_1', 32);
        const early = [...accent1].reverse();
        const advice = adviseMelody(early, accent1, null, 'ACCENT_1');
        expect(['peak-too-early', 'wrong-direction']).toContain(advice.issue);
    });

    it('accepts the right shape at the right time', () => {
        expect(adviseMelody(target, target, null, 'ACCENT_2').issue).toBe('good');
    });

    it('asks for more movement when the shape is right but small', () => {
        const timid = target.map(v => v * 0.35);
        const advice = adviseMelody(timid, target, null, 'ACCENT_2');
        expect(['too-little-movement', 'flat']).toContain(advice.issue);
    });
});
