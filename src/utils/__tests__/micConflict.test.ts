import { describe, expect, it } from 'vitest';
import { diagnoseEmptyTranscript, EMPTY_MESSAGES, type EmptyVerdict } from '../micConflict';

/**
 * What an empty transcript means.
 *
 * This rule used to live inside an async callback in a hook, where the only way
 * to exercise it was to drive a browser — so it was never exercised, and it was
 * wrong on the one platform it mattered most on. It is out here now precisely
 * so these four lines can be checked in four lines.
 *
 * The case that matters: audible speech, no words back. On iOS a MediaRecorder
 * and the speech service do not share the microphone, so that happens on EVERY
 * attempt, and a learner reads it as a verdict on their pronunciation.
 */

describe('an empty transcript', () => {
    it('is silence when nothing audible was recorded', () => {
        expect(
            diagnoseEmptyTranscript({ hasRecording: true, hasSpeech: false, alreadyKnown: false })
        ).toBe('stille');
        expect(
            diagnoseEmptyTranscript({ hasRecording: false, hasSpeech: false, alreadyKnown: false })
        ).toBe('stille');
    });

    it('is the recorder starving the service when there was speech and no words', () => {
        expect(
            diagnoseEmptyTranscript({ hasRecording: true, hasSpeech: true, alreadyKnown: false })
        ).toBe('opptaket-tar-mikrofonen');
    });

    it('does not blame the recorder twice, because it has already stood down', () => {
        // Once the recorder is off, an empty transcript means something else —
        // and claiming the same cause again would leave the learner following
        // advice that has already been taken.
        expect(
            diagnoseEmptyTranscript({ hasRecording: true, hasSpeech: true, alreadyKnown: true })
        ).toBe('ikke-forstatt');
    });

    it('does not blame the recorder when there was no recording to blame', () => {
        // The other conflict: the service took the microphone and our recorder
        // got nothing. Standing the recorder down there would fix nothing.
        expect(
            diagnoseEmptyTranscript({ hasRecording: false, hasSpeech: true, alreadyKnown: false })
        ).toBe('ikke-forstatt');
    });
});

describe('what the learner is told', () => {
    const verdicts: EmptyVerdict[] = ['stille', 'ikke-forstatt', 'opptaket-tar-mikrofonen'];

    it('has a message for every verdict', () => {
        for (const verdict of verdicts) {
            expect(EMPTY_MESSAGES[verdict], verdict).toBeTruthy();
        }
    });

    it('explains the trade the app just made, rather than only that it made one', () => {
        const text = EMPTY_MESSAGES['opptaket-tar-mikrofonen'];
        expect(text).toContain('mikrofonen');
        // Naming what is lost is the point: a melody chart that silently
        // stopped appearing would look like a different bug.
        expect(text).toContain('melodikurven');
        expect(text).toContain('teksten');
    });

    it('never tells somebody to speak up when they were clearly audible', () => {
        expect(EMPTY_MESSAGES['ikke-forstatt']).not.toContain('høyere');
        expect(EMPTY_MESSAGES['opptaket-tar-mikrofonen']).not.toContain('høyere');
    });
});

describe('when the recording could not be read at all', () => {
    it('does not call that silence', () => {
        // A clip this app failed to decode is a clip it knows nothing about.
        // Telling somebody who had just spoken clearly that nothing was heard
        // is wrong and discouraging in the same breath.
        expect(
            diagnoseEmptyTranscript({ hasRecording: true, hasSpeech: null, alreadyKnown: false })
        ).not.toBe('stille');
    });

    it('treats it as the conflict, because there was audio and no words', () => {
        expect(
            diagnoseEmptyTranscript({ hasRecording: true, hasSpeech: null, alreadyKnown: false })
        ).toBe('opptaket-tar-mikrofonen');
    });

    it('and once the recorder has stood down, asks for another go instead', () => {
        expect(
            diagnoseEmptyTranscript({ hasRecording: true, hasSpeech: null, alreadyKnown: true })
        ).toBe('ikke-forstatt');
    });
});
