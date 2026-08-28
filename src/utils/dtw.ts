/**
 * Dynamic time warping over pitch contours.
 *
 * Two people saying the same word rarely say it at the same speed, and a
 * learner is usually slower than the reference. Comparing frame 12 with frame
 * 12 therefore compares the middle of one word with the end of another, and a
 * perfectly shaped contour delivered slowly scores as badly as a wrong one.
 *
 * DTW instead finds the cheapest monotonic pairing between the two sequences,
 * so a learner who takes 1.4× as long still matches the shape they produced.
 * That is exactly the invariance we want here: pitch accent is about the SHAPE
 * of the melody, not its duration.
 */

export interface DtwStep {
    /** Index into the first sequence. */
    a: number;
    /** Index into the second sequence. */
    b: number;
}

export interface DtwResult {
    /**
     * Mean cost per step along the warping path, in whatever unit the inputs
     * were. Path length is divided out so a long recording is not penalised
     * for having more frames.
     */
    distance: number;
    /** The alignment itself, from the start of both sequences to the end. */
    path: DtwStep[];
}

export interface DtwOptions {
    /**
     * Sakoe-Chiba band, as a fraction of the longer sequence. Alignments are
     * confined to that distance from the diagonal.
     *
     * Without a band, DTW is free to stretch one frame across half the other
     * sequence — which lets a learner hold a single flat note and still match a
     * rising contour, because that one frame can absorb everything around the
     * point where it happens to be right. 0.25 allows a speaker to be up to a
     * third faster or slower, which covers real variation and no more.
     */
    band?: number;
}

const DEFAULT_BAND = 0.25;

/**
 * Align two sequences and report how far apart they are once aligned.
 *
 * Cost between two samples is their absolute difference, which in semitones is
 * directly interpretable: a distance of 2 means the aligned contours sit about
 * two semitones apart on average.
 *
 * Returns null when either sequence is empty, or when the band is too narrow to
 * admit any complete path (which happens only for wildly mismatched lengths).
 */
export function dtw(a: number[], b: number[], options: DtwOptions = {}): DtwResult | null {
    const n = a.length;
    const m = b.length;
    if (!n || !m) return null;

    // The band has to be at least the length difference, or no monotonic path
    // can reach the far corner at all.
    const band = Math.max(
        Math.ceil((options.band ?? DEFAULT_BAND) * Math.max(n, m)),
        Math.abs(n - m)
    );

    // cost[i][j] = cheapest total cost of aligning a[0..i) with b[0..j).
    const cost: number[][] = Array.from({ length: n + 1 }, () =>
        new Array<number>(m + 1).fill(Infinity)
    );
    cost[0][0] = 0;

    for (let i = 1; i <= n; i++) {
        // Where the diagonal sits at this row, scaled for differing lengths.
        const centre = (i * m) / n;
        const from = Math.max(1, Math.floor(centre - band));
        const to = Math.min(m, Math.ceil(centre + band));
        for (let j = from; j <= to; j++) {
            const local = Math.abs(a[i - 1] - b[j - 1]);
            cost[i][j] =
                local +
                Math.min(
                    cost[i - 1][j - 1], // both advance
                    cost[i - 1][j], // a advances, b waits
                    cost[i][j - 1] // b advances, a waits
                );
        }
    }

    if (!Number.isFinite(cost[n][m])) return null;

    // Walk the choices back out to recover the alignment.
    const path: DtwStep[] = [];
    let i = n;
    let j = m;
    while (i > 0 && j > 0) {
        path.push({ a: i - 1, b: j - 1 });
        const diagonal = cost[i - 1][j - 1];
        const up = cost[i - 1][j];
        const left = cost[i][j - 1];
        if (diagonal <= up && diagonal <= left) {
            i--;
            j--;
        } else if (up <= left) {
            i--;
        } else {
            j--;
        }
    }
    path.reverse();

    return { distance: cost[n][m] / path.length, path };
}

/**
 * Resample a sequence to `length` points by linear interpolation.
 *
 * DTW copes with different lengths, but not with wildly different ones: a
 * six-point target against a two-hundred-frame recording forces every target
 * point to absorb thirty frames, and the band stops meaning anything. Putting
 * both sides on a comparable number of points first keeps the alignment honest.
 */
export function resample(values: number[], length: number): number[] {
    if (!values.length || length < 1) return [];
    if (values.length === 1) return new Array<number>(length).fill(values[0]);

    const out: number[] = [];
    for (let i = 0; i < length; i++) {
        const position = (i * (values.length - 1)) / Math.max(1, length - 1);
        const low = Math.floor(position);
        const high = Math.min(values.length - 1, low + 1);
        const fraction = position - low;
        out.push(values[low] * (1 - fraction) + values[high] * fraction);
    }
    return out;
}
