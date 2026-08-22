/**
 * The corpus in sentences.json is 50 numbered levels of 10 items each, ramping
 * from single words (level 1) to long sentences (level 50). Fifty is far too
 * many things to ask someone to choose between, so they are grouped into five
 * CEFR-flavoured stages.
 */
export interface Stage {
    id: string;
    name: string;
    cefr: string;
    blurb: string;
    /** Inclusive range of sentences.json level keys this stage draws from. */
    levels: [number, number];
    /** Composite score needed to clear the first item; it rises from there. */
    baseThreshold: number;
    accent: string;
    icon: string;
}

export const STAGES: Stage[] = [
    {
        id: 'first-words',
        name: 'First Words',
        cefr: 'A1',
        blurb: 'Everyday words and short greetings. Start here if Norwegian is brand new.',
        levels: [1, 3],
        baseThreshold: 55,
        accent: 'from-emerald-400 to-teal-500',
        icon: '🌱',
    },
    {
        id: 'everyday',
        name: 'Everyday Phrases',
        cefr: 'A1+',
        blurb: 'Short practical phrases you use at the shop, at work, with neighbours.',
        levels: [4, 10],
        baseThreshold: 58,
        accent: 'from-sky-400 to-blue-500',
        icon: '☕',
    },
    {
        id: 'conversation',
        name: 'Getting Comfortable',
        cefr: 'A2',
        blurb: 'Full sentences about plans, work and daily life.',
        levels: [11, 20],
        baseThreshold: 60,
        accent: 'from-violet-400 to-purple-500',
        icon: '💬',
    },
    {
        id: 'fluent',
        name: 'Real Conversations',
        cefr: 'B1',
        blurb: 'Longer sentences with opinions, reasons and abstract ideas.',
        levels: [21, 35],
        baseThreshold: 63,
        accent: 'from-amber-400 to-orange-500',
        icon: '🎯',
    },
    {
        id: 'advanced',
        name: 'Advanced',
        cefr: 'B2',
        blurb: 'Dense, formal vocabulary. Consonant clusters that fight back.',
        levels: [36, 50],
        baseThreshold: 66,
        accent: 'from-rose-400 to-pink-600',
        icon: '🔥',
    },
];

export const getStage = (id: string): Stage | undefined => STAGES.find(s => s.id === id);

/** Flatten every item belonging to a stage into one pool. */
export function poolForStage(stage: Stage, levels: Record<string, string[]>): string[] {
    const pool: string[] = [];
    for (let level = stage.levels[0]; level <= stage.levels[1]; level++) {
        pool.push(...(levels[String(level)] ?? []));
    }
    return pool;
}
