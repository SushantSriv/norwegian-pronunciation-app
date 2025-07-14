export interface Texts {
    title: string;
    languageLabel: string;
    start: string;
    stop: string;
    preview: string;
    expected: string;
    youSaid: string;
    wer: string;
    substitutions: string;
    deletions: string;
    insertions: string;
    errors: string;
    hearCorrect: string;
    success: (p: string) => string;
    tryAgain: string;
    nextSentence: string;
    countdown: string;
}