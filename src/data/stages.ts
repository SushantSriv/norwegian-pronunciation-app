/**
 * Practice stages, in two tracks.
 *
 * General stages group the 50-level corpus in sentences.json (which ramps from
 * single words to long sentences) into five CEFR-flavoured steps — fifty is far
 * too many things to ask someone to choose between.
 *
 * Occupation stages draw instead from occupations.json: workplace language for
 * the sectors where Norwegian learners most often actually work. They sit at a
 * fixed threshold rather than a CEFR level, because the vocabulary is what makes
 * them hard, not the grammar.
 */

/** Which section of the picker a stage belongs to. */
export type Track = 'general' | 'occupation' | 'weakness';

export interface Stage {
    id: string;
    name: string;
    /** CEFR level for general stages; the English sector name for occupations. */
    cefr: string;
    blurb: string;
    track: Track;
    /**
     * General stages draw an inclusive range of sentences.json level keys;
     * occupation stages draw a named list from occupations.json. Exactly one of
     * these is set.
     */
    levels?: [number, number];
    occupation?: string;
    /** Composite score needed to clear the first item; it rises from there. */
    baseThreshold: number;
    accent: string;
    icon: string;
}

/**
 * The drill built from the learner's own record.
 *
 * It has no corpus of its own: the pool is assembled at the moment it starts,
 * from whichever phrases exercise the sound or the accent they are currently
 * worst at. It is hidden until there is enough evidence to name a weakness,
 * because a drill for a problem you may not have is worse than no drill.
 */
export const WEAKNESS_STAGE: Stage = {
    id: 'weaknesses',
    name: 'Practice my weaknesses',
    cefr: 'Adaptive',
    blurb: 'Built from your own attempts — the sounds and the tonelag you keep missing.',
    track: 'weakness',
    baseThreshold: 55,
    accent: 'from-fuchsia-400 to-violet-500',
    icon: '🎯',
};

export const STAGES: Stage[] = [
    {
        id: 'first-words',
        name: 'First Words',
        cefr: 'A1',
        blurb: 'Everyday words and short greetings. Start here if Norwegian is brand new.',
        track: 'general',
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
        track: 'general',
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
        track: 'general',
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
        track: 'general',
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
        track: 'general',
        levels: [36, 50],
        baseThreshold: 66,
        accent: 'from-rose-400 to-pink-600',
        icon: '🔥',
    },

    // ── Yrkesnorsk ────────────────────────────────────────────────────────
    {
        id: 'yrke-helse',
        name: 'Helse og omsorg',
        cefr: 'Healthcare',
        blurb: 'Ward and home-care phrases: pain, medication, next of kin.',
        track: 'occupation',
        occupation: 'helse',
        baseThreshold: 58,
        accent: 'from-rose-400 to-red-500',
        icon: '🏥',
    },
    {
        id: 'yrke-bygg',
        name: 'Bygg og anlegg',
        cefr: 'Construction',
        blurb: 'Site and safety language: scaffolding, protective gear, drawings.',
        track: 'occupation',
        occupation: 'bygg',
        baseThreshold: 58,
        accent: 'from-amber-400 to-yellow-500',
        icon: '🏗️',
    },
    {
        id: 'yrke-barnehage',
        name: 'Barnehage og skole',
        cefr: 'Childcare & school',
        blurb: 'Nursery and school: parents, outdoor clothes, pick-up times.',
        track: 'occupation',
        occupation: 'barnehage',
        baseThreshold: 58,
        accent: 'from-sky-400 to-cyan-500',
        icon: '🧸',
    },
    {
        id: 'yrke-butikk',
        name: 'Butikk og service',
        cefr: 'Retail & service',
        blurb: 'Shop floor and till: receipts, returns, opening hours.',
        track: 'occupation',
        occupation: 'butikk',
        baseThreshold: 58,
        accent: 'from-emerald-400 to-green-500',
        icon: '🛒',
    },
    {
        id: 'yrke-restaurant',
        name: 'Restaurant og kjøkken',
        cefr: 'Restaurant & kitchen',
        blurb: 'Front of house and kitchen: orders, allergies, closing time.',
        track: 'occupation',
        occupation: 'restaurant',
        baseThreshold: 58,
        accent: 'from-orange-400 to-amber-600',
        icon: '🍽️',
    },
    {
        id: 'yrke-transport',
        name: 'Transport og logistikk',
        cefr: 'Transport & logistics',
        blurb: 'Deliveries and vehicles: loads, routes, paperwork.',
        track: 'occupation',
        occupation: 'transport',
        baseThreshold: 58,
        accent: 'from-slate-400 to-slate-600',
        icon: '🚚',
    },
    {
        id: 'yrke-renhold',
        name: 'Renhold',
        cefr: 'Cleaning',
        blurb: 'Cleaning work: products, equipment, finishing a shift.',
        track: 'occupation',
        occupation: 'renhold',
        baseThreshold: 58,
        accent: 'from-teal-400 to-emerald-600',
        icon: '🧼',
    },
    {
        id: 'yrke-kontor',
        name: 'Kontor og IT',
        cefr: 'Office & IT',
        blurb: 'Meetings and systems: access, deadlines, screen sharing.',
        track: 'occupation',
        occupation: 'kontor',
        baseThreshold: 58,
        accent: 'from-violet-400 to-indigo-600',
        icon: '💻',
    },
];

export const getStage = (id: string): Stage | undefined => STAGES.find(s => s.id === id);

/** Stages belonging to one section of the picker, in display order. */
export const stagesInTrack = (track: Track): Stage[] => STAGES.filter(s => s.track === track);

/** Flatten every item belonging to a stage into one pool. */
export function poolForStage(
    stage: Stage,
    levels: Record<string, string[]>,
    occupations: Record<string, string[]> = {}
): string[] {
    if (stage.occupation) return [...(occupations[stage.occupation] ?? [])];

    const pool: string[] = [];
    const [from, to] = stage.levels ?? [1, 1];
    for (let level = from; level <= to; level++) {
        pool.push(...(levels[String(level)] ?? []));
    }
    return pool;
}
