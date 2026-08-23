/**
 * The dialect areas offered for pronunciation.
 *
 * NB Uttale distinguishes five areas — East, Southwest, West, Trøndelag and
 * North. Across this app's ~1,350-word corpus, two of those pairs transcribe
 * IDENTICALLY (west == southwest, north == trøndelag), so they are presented
 * together rather than as separate choices that would change nothing when
 * selected. The five-way split is real in the full 785k-word source; it just
 * does not surface in this vocabulary.
 *
 * The id is the data file backing the group.
 */
export type DialectId = 'east' | 'southwest' | 'trondelag';

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
        id: 'southwest',
        name: 'Vest- og sørvestnorsk',
        english: 'West & Southwest',
        where: 'Bergen and Stavanger',
        trait: 'Keeps "rs" separate — norsk stays "norsk". Differs from Oslo on about 1 word in 9 here.',
    },
    {
        id: 'trondelag',
        name: 'Trøndersk og nordnorsk',
        english: 'Trøndelag & North',
        where: 'Trondheim and northwards',
        trait: 'Retroflex like Oslo, so very close to it — only a handful of words differ in this corpus.',
    },
];

export const DEFAULT_DIALECT: DialectId = 'east';

export const getDialect = (id: DialectId): Dialect =>
    DIALECTS.find(d => d.id === id) ?? DIALECTS[0];
