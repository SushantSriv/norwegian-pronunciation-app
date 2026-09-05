/**
 * Day and week keys, in UTC.
 *
 * A leaderboard that resets weekly has to agree with everyone else about when
 * the week turned over. Local time cannot do that: two learners in different
 * places would be ranked over different windows, and the server would have a
 * third opinion. So every boundary here is UTC — Monday 00:00 UTC starts the
 * week, everywhere, for everyone.
 *
 * The cost is that in Oslo the week turns over at 01:00 or 02:00 rather than
 * midnight. That is a smaller unfairness than the alternative, and it is the
 * same for every learner.
 */

const DAY_MS = 86_400_000;

/** 'YYYY-MM-DD' in UTC. */
export function dayKey(at: number): string {
    return new Date(at).toISOString().slice(0, 10);
}

/** Midnight UTC on the day containing `at`. */
export function dayStart(at: number): number {
    return Math.floor(at / DAY_MS) * DAY_MS;
}

/** Whole days from one day key to another; negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
    return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Monday 00:00 UTC of the week containing `at`. */
export function weekStart(at: number): number {
    const date = new Date(at);
    // getUTCDay is Sunday-first; ISO weeks are Monday-first.
    const offset = (date.getUTCDay() + 6) % 7;
    return dayStart(at) - offset * DAY_MS;
}

/**
 * ISO-8601 week key, 'YYYY-Www'.
 *
 * The year is the one owning the Thursday of that week, which is why this is
 * not simply the calendar year: 2027-01-01 falls in week 53 of 2026.
 */
export function weekKey(at: number): string {
    const monday = weekStart(at);
    const thursday = new Date(monday + 3 * DAY_MS);
    const year = thursday.getUTCFullYear();
    // Week 1 is the week containing 4 January.
    const jan4 = Date.UTC(year, 0, 4);
    const firstMonday = weekStart(jan4);
    const week = Math.round((monday - firstMonday) / (7 * DAY_MS)) + 1;
    return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Start of the week before the one containing `at`. */
export function previousWeekStart(at: number): number {
    return weekStart(at) - 7 * DAY_MS;
}
