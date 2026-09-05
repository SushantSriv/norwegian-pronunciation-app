import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react';
import { useCommunity } from '../../hooks/useCommunity';
import { CommunityScreen } from '../CommunityScreen';
import { emptyProfile } from '../../utils/learningProfile';
import type { WordScore } from '../../utils/scoring';

/**
 * The community screen, driven through the real hook.
 *
 * Nothing is stubbed except the practice session itself: the ledger, the point
 * engine and localStorage are the ones the app uses, so this exercises the
 * whole path from "an attempt was graded" to "a number is on the screen".
 */

const word = (text: string, index: number): WordScore => ({
    word: text,
    index,
    status: 'equal',
    score: 1,
    expectedIpa: null,
    heardIpa: null,
});

/** A harness that exposes the hook's actions to the test. */
let actions: ReturnType<typeof useCommunity>;

function Harness() {
    const community = useCommunity();
    actions = community;
    return <CommunityScreen community={community} onBack={() => {}} />;
}

const practise = (token: object, phrase: string) =>
    act(() => {
        actions.award(
            token,
            {
                // Over the bar, but not by the strong margin: 5 + 5 at A1.
                score: 60,
                threshold: 55,
                passed: true,
                counts: true,
                phrase,
                wordScores: phrase.split(' ').map(word),
                cefr: 'A1',
                profile: emptyProfile(),
            },
            true,
            'run-1'
        );
    });

beforeEach(() => {
    cleanup();
    window.localStorage.clear();
});

/** The learner's own card, which is where every personal number lives. */
const mine = () => within(screen.getByRole('region', { name: 'Din uke' }));

describe('CommunityScreen', () => {
    it('welcomes a learner with no points instead of ranking them last', () => {
        render(<Harness />);
        expect(screen.getByText(/Fullfør din første øvelse/)).toBeInTheDocument();
        expect(screen.queryByText(/Du er #/)).not.toBeInTheDocument();
    });

    it('counts points earned before the learner ever chose a name', () => {
        render(<Harness />);
        practise({}, 'god morgen');

        // An attempt plus a clear, at A1.
        expect(mine().getByText('+10')).toBeInTheDocument();
        expect(screen.queryByText(/Fullfør din første øvelse/)).not.toBeInTheDocument();
    });

    it('shows a streak once there is one', () => {
        render(<Harness />);
        practise({}, 'god morgen');
        expect(mine().getByText('dag')).toBeInTheDocument();
        expect(mine().getByText('1')).toBeInTheDocument();
    });

    it('says the shared board is off rather than showing an empty one', () => {
        render(<Harness />);
        expect(screen.getByText(/ingen delt leaderboard/i)).toBeInTheDocument();
    });

    it('has the three boards the app promises', () => {
        render(<Harness />);
        for (const label of ['Denne uken', 'All-time', 'Mest forbedret']) {
            expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
        }
    });

    it('will not report an improvement it does not have the data for', () => {
        render(<Harness />);
        practise({}, 'god morgen');
        expect(mine().getByText(/ikke nok data ennå/)).toBeInTheDocument();
    });

    it('does not ask for a name when there is no board to be named on', () => {
        // A default build has no leaderboard server, so a nickname would do
        // nothing at all. Asking for one anyway is asking for data with no use.
        render(<Harness />);
        expect(screen.queryByText('Hva skal vi kalle deg?')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Nickname')).not.toBeInTheDocument();
    });

    it('remembers points across a reload', () => {
        const first = render(<Harness />);
        practise({}, 'god morgen');
        first.unmount();

        render(<Harness />);
        expect(mine().getByText('+10')).toBeInTheDocument();
    });

    it('does not pay twice for one attempt', () => {
        render(<Harness />);
        const attempt = {};
        practise(attempt, 'god morgen');
        practise(attempt, 'god morgen');
        expect(mine().getByText('+10')).toBeInTheDocument();
    });
});

// ---------------------------------------------------------------------------
// The board when there is no shared one
//
// A default build has no leaderboard server, so these tabs show the learner
// their own history rather than an apology. That is the state almost every user
// will actually see, so it gets the same scrutiny as the shared board.
// ---------------------------------------------------------------------------

describe('CommunityScreen — solo boards', () => {
    const tab = (name: string) => fireEvent.click(screen.getByRole('tab', { name }));

    it('shows your own weeks rather than an empty leaderboard', () => {
        render(<Harness />);
        practise({}, 'god morgen');
        // The bar chart carries a text alternative naming every week.
        expect(screen.getByRole('img', { name: /Denne uken: 10 poeng/ })).toBeInTheDocument();
    });

    it('says plainly that the shared board is off', () => {
        render(<Harness />);
        expect(screen.getByText(/ingen delt leaderboard/i)).toBeInTheDocument();
    });

    it('turns all-time into milestones a learner can read', () => {
        render(<Harness />);
        practise({}, 'god morgen');
        tab('All-time');

        expect(screen.getByText('poeng totalt')).toBeInTheDocument();
        expect(screen.getByText('ord mestret')).toBeInTheDocument();
        expect(screen.getByText('dager øvd')).toBeInTheDocument();
    });

    it('shows personal bests under most-improved, once there are any', () => {
        render(<Harness />);
        tab('Mest forbedret');
        expect(screen.getByText(/Ingen personlige rekorder ennå/)).toBeInTheDocument();

        act(() => {
            actions.award(
                {},
                {
                    score: 80,
                    threshold: 55,
                    passed: true,
                    counts: true,
                    phrase: 'kjøkken',
                    wordScores: [
                        {
                            word: 'kjøkken',
                            index: 0,
                            status: 'substitute',
                            score: 0.91,
                            expectedIpa: null,
                            heardIpa: null,
                        },
                    ],
                    cefr: 'A1',
                    profile: emptyProfile(),
                },
                true,
                'run-2'
            );
        });

        // First sighting only sets the bar; the second, better attempt is the
        // personal best that gets shown.
        act(() => {
            actions.award(
                {},
                {
                    score: 95,
                    threshold: 55,
                    passed: true,
                    counts: true,
                    phrase: 'kjøkken igjen',
                    wordScores: [
                        {
                            word: 'kjøkken',
                            index: 0,
                            status: 'substitute',
                            score: 0.99,
                            expectedIpa: null,
                            heardIpa: null,
                        },
                    ],
                    cefr: 'A1',
                    profile: emptyProfile(),
                },
                true,
                'run-2'
            );
        });

        expect(screen.getByText('kjøkken')).toBeInTheDocument();
        expect(screen.getByText('91 → 99')).toBeInTheDocument();
        expect(screen.getByText('+8')).toBeInTheDocument();
    });

    it('shows the streak calendar with today marked', () => {
        render(<Harness />);
        practise({}, 'god morgen');
        expect(screen.getByRole('img', { name: /Du har øvd 1 av de siste 14 dagene/ })).toBeInTheDocument();
    });

    it('breaks this week down by what earned it', () => {
        render(<Harness />);
        practise({}, 'god morgen');
        expect(screen.getByText('Hvor poengene kom fra')).toBeInTheDocument();
        expect(
            screen.getByRole('img', { name: /Forsøk: 5 poeng\. Klarte kravet: 5 poeng/ })
        ).toBeInTheDocument();
    });

    it('shows no breakdown before there is anything to break down', () => {
        render(<Harness />);
        expect(screen.queryByText('Hvor poengene kom fra')).not.toBeInTheDocument();
    });

    it('describes the league ring for a screen reader', () => {
        render(<Harness />);
        expect(screen.getByText(/Bronze-liga, 0 poeng totalt/)).toBeInTheDocument();
    });
});
