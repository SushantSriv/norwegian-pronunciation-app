/**
 * The five dialect areas covered by NB Uttale.
 *
 * These are the Language Bank's own regional groupings, not a full dialect
 * map — Norwegian has far more variation than five buckets. They are the
 * granularity the pronunciation data actually supports, so they are what we
 * offer rather than inventing distinctions we cannot back with data.
 */
export type DialectId = 'east' | 'southwest' | 'west' | 'trondelag' | 'north';

export interface Dialect {
    id: DialectId;
    /** Norwegian name, since that is what learners will hear it called. */
    name: string;
    english: string;
    /** Roughly where it is spoken, for someone who does not know the map. */
    where: string;
    /** One concrete, audible trait, so the choice means something. */
    trait: string;
}

export const DIALECTS: Dialect[] = [
    {
        id: 'east',
        name: 'Østnorsk',
        english: 'East Norwegian',
        where: 'Oslo and the east',
        trait: 'The standard you hear in national media. Uses retroflex "rs" — norsk sounds like "noʂk".',
    },
    {
        id: 'west',
        name: 'Vestnorsk',
        english: 'West Norwegian',
        where: 'Bergen and the west coast',
        trait: 'Keeps "rs" separate — norsk stays "norsk". Often a guttural R.',
    },
    {
        id: 'southwest',
        name: 'Sørvestnorsk',
        english: 'Southwest Norwegian',
        where: 'Stavanger and the southwest',
        trait: 'Also keeps "rs" separate, with its own vowel colouring.',
    },
    {
        id: 'trondelag',
        name: 'Trøndersk',
        english: 'Trøndelag',
        where: 'Trondheim and around',
        trait: 'Retroflex like the east, but with widespread vowel apocope.',
    },
    {
        id: 'north',
        name: 'Nordnorsk',
        english: 'North Norwegian',
        where: 'Nordland, Troms and Finnmark',
        trait: 'Retroflex, and drops many final vowels.',
    },
];

export const DEFAULT_DIALECT: DialectId = 'east';

export const getDialect = (id: DialectId): Dialect =>
    DIALECTS.find(d => d.id === id) ?? DIALECTS[0];
