export type WordStatus = 'equal' | 'substitute' | 'delete';

export interface WordScore {
    word: string;
    index: number;
    status: WordStatus;
    score: number; // 0..1
    expected_ipa: string | null;
    heard_ipa: string | null;
}

export interface PronunciationResult {
    expected: string;
    transcript: string;
    wer: number;
    pronunciation_score: number; // 0..100
    substitutions: number;
    deletions: number;
    insertions: number;
    word_scores: WordScore[];
    detail: string;
}
