import type { PronunciationResult, WordScore } from '../types/Scoring';
import { getAdvice, getPhonemeHint } from '../utils/pronunciationHints';
import { tokenizeIPA } from '../utils/ipaTokenizer';
import type { Texts } from '../types/Texts';

interface Props {
    result: PronunciationResult;
    passed: boolean;
    text: Texts;
    activeWord: WordScore | null;
}

function scoreColor(score: number) {
    if (score >= 85) return 'text-emerald-600';
    if (score >= 50) return 'text-amber-500';
    return 'text-red-500';
}

export function ScorePanel({ result, passed, text, activeWord }: Props) {
    const badWords = result.word_scores.filter(w => w.status !== 'equal');

    return (
        <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col items-center gap-1 border-b border-slate-100 pb-3 text-center">
                    <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                        {passed ? 'Pronunciation score' : 'Pronunciation score — keep going'}
                    </span>
                    <span className={`text-4xl font-extrabold ${scoreColor(result.pronunciation_score)}`}>
                        {result.pronunciation_score.toFixed(0)}
                        <span className="text-xl font-medium text-slate-400">/100</span>
                    </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-center text-sm sm:grid-cols-4">
                    <div>
                        <strong className="block text-slate-500">{text.wer}</strong>
                        <span className="text-base text-slate-800">{(result.wer * 100).toFixed(1)}%</span>
                    </div>
                    <div>
                        <strong className="block text-slate-500">{text.substitutions}</strong>
                        <span className="text-base text-slate-800">{result.substitutions}</span>
                    </div>
                    <div>
                        <strong className="block text-slate-500">{text.deletions}</strong>
                        <span className="text-base text-slate-800">{result.deletions}</span>
                    </div>
                    <div>
                        <strong className="block text-slate-500">{text.insertions}</strong>
                        <span className="text-base text-slate-800">{result.insertions}</span>
                    </div>
                </div>
            </div>

            {badWords.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="mb-2 font-semibold text-red-500">
                        {text.errors} {badWords.map(w => w.word).join(', ')}
                    </p>
                    <p className="text-xs text-slate-500">Tap a highlighted word above for its phoneme breakdown.</p>
                </div>
            )}

            {activeWord && activeWord.status !== 'equal' && (
                <div className="animate-pop-in rounded-xl border-l-4 border-amber-400 bg-amber-50 p-4 shadow-sm">
                    <p className="font-bold text-slate-800">
                        💡 Tip for <em>«{activeWord.word}»</em>
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                        {getAdvice(activeWord.word) || 'Try saying the word more slowly and clearly.'}
                    </p>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <div className="mb-1 text-sm font-semibold text-slate-700">✅ Expected</div>
                            <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-700">
                                {activeWord.expected_ipa &&
                                    tokenizeIPA(activeWord.expected_ipa).map((p, idx) => (
                                        <li key={`exp-${idx}`}>
                                            <strong>{p}</strong>: {getPhonemeHint(p) ?? '(no explanation)'}
                                        </li>
                                    ))}
                            </ul>
                        </div>
                        <div>
                            <div className="mb-1 text-sm font-semibold text-slate-700">🗣️ You said</div>
                            <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-700">
                                {activeWord.heard_ipa ? (
                                    tokenizeIPA(activeWord.heard_ipa).map((p, idx) => (
                                        <li key={`heard-${idx}`}>
                                            <strong>{p}</strong>: {getPhonemeHint(p) ?? '(no explanation)'}
                                        </li>
                                    ))
                                ) : (
                                    <li className="italic text-slate-400">Word wasn't heard at all.</li>
                                )}
                            </ul>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
