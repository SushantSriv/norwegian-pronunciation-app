import { describe, expect, it } from 'vitest';
import {
    KJENNETEGN,
    KJENNETEGN_KILDE,
    TRINN_FOR,
    type CefrTrinn,
} from '../../data/muntlig/kjennetegn';
import { ROOM_NIVAAER } from '../roomProtocol';

/**
 * The level descriptors against the promise made about them.
 *
 * The promise is that every one of these is quoted from HK-dir rather than
 * written here. That cannot be tested directly — nothing in the repository
 * knows what the source page says — so what is tested instead is the shape
 * that makes the promise checkable: every criterion covered at every level,
 * one citable source, and no gaps that somebody would be tempted to fill in.
 */

const TRINN: CefrTrinn[] = ['A1', 'A2', 'B1', 'B2'];
const KRITERIER = ['flyt', 'uttale', 'ordforrad', 'grammatikk'] as const;

describe('the published descriptors', () => {
    it('covers all four criteria at all four levels', () => {
        for (const trinn of TRINN) {
            for (const kriterium of KRITERIER) {
                const text = KJENNETEGN[trinn][kriterium];
                expect(text, `${trinn} ${kriterium}`).toBeTruthy();
                // A descriptor is a sentence about a speaker, not a label.
                expect(text.length, `${trinn} ${kriterium}`).toBeGreaterThan(40);
                expect(text, `${trinn} ${kriterium}`).toContain('Deltakeren');
            }
        }
    });

    it('names one source, and it is HK-dir', () => {
        expect(KJENNETEGN_KILDE.url).toMatch(/^https:\/\/[a-z]+\.hkdir\.no\//);
        expect(KJENNETEGN_KILDE.label).toBeTruthy();
    });

    it('spans each exam level across two steps, lower first', () => {
        for (const nivaa of ROOM_NIVAAER) {
            const [lower, upper] = TRINN_FOR[nivaa];
            // The pair is the point: the distance between them is what a
            // candidate is trying to cover.
            expect(`${lower}-${upper}`, nivaa).toBe(nivaa);
            expect(TRINN.indexOf(lower)).toBeLessThan(TRINN.indexOf(upper));
        }
    });

    it('says something different at every step', () => {
        // Two levels that read the same would tell a candidate there is no
        // difference to aim at.
        for (const kriterium of KRITERIER) {
            const said = TRINN.map(trinn => KJENNETEGN[trinn][kriterium]);
            expect(new Set(said).size, kriterium).toBe(TRINN.length);
        }
    });
});
