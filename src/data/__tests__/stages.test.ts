import { describe, expect, it } from 'vitest';
import { STAGES, poolForStage, stagesInTrack } from '../stages';
import { ITEMS_TO_WIN, MAX_STRIKES } from '../../hooks/usePracticeSession';
import sentenceData from '../sentences.json';
import occupationData from '../occupations.json';

const LEVELS = (sentenceData as { levels: Record<string, string[]> }).levels;
const OCCUPATIONS = occupationData as Record<string, string[]>;

describe('stage tracks', () => {
    it('splits into exactly the two advertised sections', () => {
        expect(stagesInTrack('general').length).toBe(5);
        expect(stagesInTrack('occupation').length).toBeGreaterThanOrEqual(8);
        expect(stagesInTrack('general').length + stagesInTrack('occupation').length).toBe(
            STAGES.length
        );
    });

    it('gives every stage exactly one source of items', () => {
        for (const stage of STAGES) {
            const hasLevels = stage.levels !== undefined;
            const hasOccupation = stage.occupation !== undefined;
            expect(hasLevels !== hasOccupation).toBe(true);
        }
    });

    it('has unique ids', () => {
        expect(new Set(STAGES.map(s => s.id)).size).toBe(STAGES.length);
    });
});

describe('poolForStage', () => {
    it('draws real items for every stage', () => {
        for (const stage of STAGES) {
            expect(poolForStage(stage, LEVELS, OCCUPATIONS).length).toBeGreaterThan(0);
        }
    });

    it('gives every stage enough items to finish a run', () => {
        // A run needs ITEMS_TO_WIN passes plus room for MAX_STRIKES misses.
        const needed = ITEMS_TO_WIN + MAX_STRIKES;
        for (const stage of STAGES) {
            expect(poolForStage(stage, LEVELS, OCCUPATIONS).length).toBeGreaterThanOrEqual(needed);
        }
    });

    it('keeps occupation pools disjoint from each other', () => {
        const occStages = stagesInTrack('occupation');
        const seen = new Map<string, string>();
        for (const stage of occStages) {
            for (const item of poolForStage(stage, LEVELS, OCCUPATIONS)) {
                expect(seen.has(item)).toBe(false);
                seen.set(item, stage.id);
            }
        }
    });

    it('returns a copy, so callers cannot mutate the source data', () => {
        const stage = stagesInTrack('occupation')[0];
        const pool = poolForStage(stage, LEVELS, OCCUPATIONS);
        const before = pool.length;
        pool.push('tull');
        expect(poolForStage(stage, LEVELS, OCCUPATIONS).length).toBe(before);
    });
});

describe('occupation content', () => {
    it('has an entry for every occupation stage', () => {
        for (const stage of stagesInTrack('occupation')) {
            expect(OCCUPATIONS[stage.occupation as string]).toBeDefined();
        }
    });

    it('contains no empty or untrimmed items', () => {
        for (const items of Object.values(OCCUPATIONS)) {
            for (const item of items) {
                expect(item.trim()).toBe(item);
                expect(item.length).toBeGreaterThan(0);
            }
        }
    });
});

describe('content variety', () => {
    // A run draws ITEMS_TO_WIN passes plus room for MAX_STRIKES misses. If a
    // pool is barely bigger than that, the learner sees the same items every
    // single run — which is exactly the complaint this guards against.
    const PER_RUN = ITEMS_TO_WIN + MAX_STRIKES;

    it('keeps every pool at least 3x a single run, so runs differ', () => {
        for (const stage of STAGES) {
            const size = poolForStage(stage, LEVELS, OCCUPATIONS).length;
            expect(
                size,
                `${stage.id} has only ${size} items (${((100 * PER_RUN) / size).toFixed(0)}% used per run)`
            ).toBeGreaterThanOrEqual(PER_RUN * 3);
        }
    });

    it('has no duplicate items inside a pool', () => {
        for (const stage of STAGES) {
            const pool = poolForStage(stage, LEVELS, OCCUPATIONS);
            expect(new Set(pool).size, `${stage.id} repeats items`).toBe(pool.length);
        }
    });
});
