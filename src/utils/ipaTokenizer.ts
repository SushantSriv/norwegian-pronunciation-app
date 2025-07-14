import { phonemeHints } from "./pronunciationHints"

// utils/ipaTokenizer.ts
const PHONEMES = Object.keys(phonemeHints).sort((a, b) => b.length - a.length)
// e.g. ['ɑː','iː','ʉː','yː',…,'ɑ','i',…,'ç','ʃ',…]

export function tokenizeIPA(ipa: string): string[] {
    const tokens: string[] = []
    let idx = 0
    while (idx < ipa.length) {
        let matched = false
        for (const ph of PHONEMES) {
            if (ipa.startsWith(ph, idx)) {
                tokens.push(ph)
                idx += ph.length
                matched = true
                break
            }
        }
        // If nothing matches (e.g. stray stress mark or space), skip 1 char
        if (!matched) {
            idx += 1
        }
    }
    return tokens
}
