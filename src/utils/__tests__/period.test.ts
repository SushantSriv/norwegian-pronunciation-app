import { describe, expect, it } from 'vitest';
import { dayKey, daysBetween, previousWeekStart, weekKey, weekStart } from '../period';

/** 5 January 2026 is a Monday. */
const MONDAY = Date.UTC(2026, 0, 5);
const DAY = 86_400_000;

describe('dayKey', () => {
    it('is the UTC calendar date', () => {
        expect(dayKey(Date.UTC(2026, 0, 5, 12))).toBe('2026-01-05');
    });

    it('does not follow the local clock across midnight', () => {
        // 23:30 UTC is the next day in Oslo, and still today here — which is
        // the point: everyone's week turns over at the same instant.
        expect(dayKey(Date.UTC(2026, 0, 5, 23, 30))).toBe('2026-01-05');
    });
});

describe('weekStart', () => {
    it('is Monday midnight for every day of that week', () => {
        for (let day = 0; day < 7; day++) {
            expect(weekStart(MONDAY + day * DAY + 3600_000)).toBe(MONDAY);
        }
    });

    it('rolls over on Monday, not Sunday', () => {
        expect(weekStart(MONDAY - 1)).toBe(MONDAY - 7 * DAY);
        expect(weekStart(MONDAY)).toBe(MONDAY);
    });

    it('has a previous week exactly seven days back', () => {
        expect(previousWeekStart(MONDAY + 3 * DAY)).toBe(MONDAY - 7 * DAY);
    });
});

describe('weekKey', () => {
    it('is stable across a week and changes at the boundary', () => {
        const key = weekKey(MONDAY);
        for (let day = 0; day < 7; day++) expect(weekKey(MONDAY + day * DAY)).toBe(key);
        expect(weekKey(MONDAY + 7 * DAY)).not.toBe(key);
        expect(weekKey(MONDAY - 1)).not.toBe(key);
    });

    it('follows ISO-8601 week numbering', () => {
        expect(weekKey(MONDAY)).toBe('2026-W02');
        // 1 January 2026 is a Thursday, so it belongs to week 1 of 2026.
        expect(weekKey(Date.UTC(2026, 0, 1))).toBe('2026-W01');
    });

    it('gives January days to the previous year where ISO does', () => {
        // 1 January 2027 is a Friday: week 53 of 2026, not week 1 of 2027.
        expect(weekKey(Date.UTC(2027, 0, 1))).toBe('2026-W53');
        // And 4 January 2027, a Monday, starts 2027 week 1.
        expect(weekKey(Date.UTC(2027, 0, 4))).toBe('2027-W01');
    });

    it('pads single-digit weeks so keys sort', () => {
        expect(weekKey(Date.UTC(2026, 0, 1))).toMatch(/^\d{4}-W\d{2}$/);
    });
});

describe('daysBetween', () => {
    it('counts whole days forward and back', () => {
        expect(daysBetween('2026-01-05', '2026-01-06')).toBe(1);
        expect(daysBetween('2026-01-06', '2026-01-05')).toBe(-1);
        expect(daysBetween('2026-01-05', '2026-01-05')).toBe(0);
    });

    it('crosses months and years', () => {
        expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
        expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
    });
});
