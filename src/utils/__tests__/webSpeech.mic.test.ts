import { beforeEach, describe, expect, it } from 'vitest';
import {
    cloudTakesMicrophone,
    forgetMicrophoneConflicts,
    recorderTakesMicrophone,
    rememberCloudTakesMicrophone,
    rememberRecorderTakesMicrophone,
} from '../webSpeech';

/**
 * The two ways a microphone can be fought over, and which of them was seen.
 *
 * They are opposites and they must not be confused, because the app reacts to
 * them in opposite ways:
 *
 *   - The SERVICE takes the microphone (Android): the recording comes back
 *     empty, the transcript is fine, and the app carries on without a melody
 *     chart.
 *   - The RECORDER takes it (iOS, and therefore every browser on an iPhone):
 *     the recording is fine and not one word comes back. The recorder has to
 *     stand down, or the learner is told "jeg fikk ikke tak i ordene" after
 *     every attempt they ever make on that device.
 *
 * Mixing them up would make the app do exactly the wrong thing on one of the
 * two most common kinds of phone, so they are separate keys and this is the
 * test that says so.
 */

beforeEach(() => {
    window.localStorage.clear();
});

describe('which side is starving the other', () => {
    it('starts out having seen neither', () => {
        expect(cloudTakesMicrophone()).toBe(false);
        expect(recorderTakesMicrophone()).toBe(false);
    });

    it('remembers the recorder winning without claiming the service did', () => {
        rememberRecorderTakesMicrophone();
        expect(recorderTakesMicrophone()).toBe(true);
        expect(cloudTakesMicrophone()).toBe(false);
    });

    it('remembers the service winning without claiming the recorder did', () => {
        rememberCloudTakesMicrophone();
        expect(cloudTakesMicrophone()).toBe(true);
        expect(recorderTakesMicrophone()).toBe(false);
    });

    it('survives a reload, because the device has not changed', () => {
        rememberRecorderTakesMicrophone();
        // A fresh read is what a reload does.
        expect(recorderTakesMicrophone()).toBe(true);
    });

    it('can be forgotten, for somebody who changed a setting and wants another go', () => {
        rememberRecorderTakesMicrophone();
        rememberCloudTakesMicrophone();
        forgetMicrophoneConflicts();
        expect(recorderTakesMicrophone()).toBe(false);
        expect(cloudTakesMicrophone()).toBe(false);
    });

    it('treats unreadable storage as nothing observed, not as a conflict', () => {
        // Private browsing, blocked site data. Assuming a conflict there would
        // switch off recording for everybody whose browser refuses storage.
        const real = window.localStorage.getItem;
        window.localStorage.getItem = () => {
            throw new Error('denied');
        };
        try {
            expect(recorderTakesMicrophone()).toBe(false);
            expect(cloudTakesMicrophone()).toBe(false);
        } finally {
            window.localStorage.getItem = real;
        }
    });
});
