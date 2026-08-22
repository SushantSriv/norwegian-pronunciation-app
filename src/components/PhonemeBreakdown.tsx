import { tokenizeIPA } from '../utils/ipaTokenizer';
import { getPhonemeHint, getAdvice } from '../utils/pronunciationHints';
import type { WordScore } from '../utils/scoring';

interface Props {
    word: WordScore;
}

/** Side-by-side "what you should say" vs "what I heard" phoneme explanation. */
export function PhonemeBreakdown({ word }: Props) {
    const advice = getAdvice(word.word);

    return (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="font-semibold text-white">
                <span aria-hidden="true">💡</span> {word.word}
            </p>
            {advice && <p className="mt-1 text-sm text-white/70">{advice}</p>}

            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-300">
                        Target sounds
                    </div>
                    <ul className="space-y-1 text-sm text-white/75">
                        {word.expectedIpa &&
                            tokenizeIPA(word.expectedIpa).map((symbol, i) => (
                                <li key={`e-${i}`}>
                                    <code className="rounded bg-emerald-400/15 px-1 font-semibold text-emerald-200">
                                        {symbol}
                                    </code>{' '}
                                    {getPhonemeHint(symbol)}
                                </li>
                            ))}
                    </ul>
                </div>

                <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-rose-300">
                        What I heard
                    </div>
                    {word.heardIpa ? (
                        <ul className="space-y-1 text-sm text-white/75">
                            {tokenizeIPA(word.heardIpa).map((symbol, i) => (
                                <li key={`h-${i}`}>
                                    <code className="rounded bg-rose-400/15 px-1 font-semibold text-rose-200">
                                        {symbol}
                                    </code>{' '}
                                    {getPhonemeHint(symbol)}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm italic text-white/40">This word was not heard at all.</p>
                    )}
                </div>
            </div>
        </div>
    );
}
