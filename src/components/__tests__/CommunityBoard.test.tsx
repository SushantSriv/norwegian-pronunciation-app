import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { CommunityScreen } from '../CommunityScreen';
import { useCommunity } from '../../hooks/useCommunity';
import { createIdentity, saveIdentity } from '../../utils/identity';
import type { Board } from '../../utils/leaderboardClient';

/**
 * The shared board.
 *
 * The default build has no leaderboard server, so none of this renders unless
 * one is configured — which means it would otherwise be tested only by hand.
 * The client module is mocked to say a server exists and to answer with a
 * board; everything below it is the real screen.
 */

vi.mock('../../utils/leaderboardClient', async importOriginal => {
    const actual = await importOriginal<typeof import('../../utils/leaderboardClient')>();
    return {
        ...actual,
        leaderboardEnabled: true,
        fetchBoard: vi.fn(),
        syncCommunity: vi.fn(),
    };
});

const { fetchBoard, syncCommunity } = await import('../../utils/leaderboardClient');

const row = (rank: number, nickname: string, value: number, level: string | null = 'A2') => ({
    rank,
    id: `id-${nickname}`,
    nickname,
    value,
    level,
});

const board = (over: Partial<Board> = {}): Board => ({
    scope: 'weekly',
    level: 'all',
    total: 4,
    rows: [
        row(1, 'NordicVoice', 1329, 'B2'),
        row(2, 'FjordFox', 1095),
        row(3, 'FjellTale', 1089, 'A1'),
        row(4, 'NorskNinja', 1082, 'B1'),
    ],
    you: null,
    ...over,
});

function Harness() {
    return <CommunityScreen community={useCommunity()} onBack={() => {}} />;
}

beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.mocked(fetchBoard).mockReset();
    vi.mocked(syncCommunity).mockReset();
    vi.mocked(syncCommunity).mockResolvedValue({
        accepted: [],
        rejected: [],
        standing: null,
        nickname: 'FjordFox',
    });
});

const withIdentity = (nickname = 'FjordFox') => {
    const identity = { ...createIdentity(nickname), id: `id-${nickname}` };
    saveIdentity(identity);
    // The server has the last word on the name, so it must agree or the hook
    // will rename the learner mid-test.
    vi.mocked(syncCommunity).mockResolvedValue({
        accepted: [],
        rejected: [],
        standing: null,
        nickname,
    });
    return identity;
};

describe('the shared board', () => {
    it('lists what the server returned, in order', async () => {
        vi.mocked(fetchBoard).mockResolvedValue(board());
        render(<Harness />);

        await waitFor(() => expect(screen.getByText('NordicVoice')).toBeInTheDocument());
        const names = screen.getAllByRole('listitem').map(item => item.textContent ?? '');
        expect(names[0]).toContain('NordicVoice');
        expect(names[3]).toContain('NorskNinja');
    });

    it('gives the podium places medals and everybody else a number', async () => {
        vi.mocked(fetchBoard).mockResolvedValue(board());
        render(<Harness />);

        await waitFor(() => expect(screen.getByText('NordicVoice')).toBeInTheDocument());
        const items = screen.getAllByRole('listitem').map(item => item.textContent ?? '');
        expect(items[0]).toContain('🥇');
        expect(items[1]).toContain('🥈');
        expect(items[2]).toContain('🥉');
        expect(items[3]).toContain('4');
        expect(items[3]).not.toContain('🥉');
    });

    it('marks the learner’s own row', async () => {
        withIdentity('FjordFox');
        vi.mocked(fetchBoard).mockResolvedValue(board());
        render(<Harness />);

        await waitFor(() => expect(screen.getByText('FjordFox')).toBeInTheDocument());
        const mine = screen.getAllByRole('listitem').find(item => item.textContent?.includes('FjordFox'));
        expect(mine?.textContent).toContain('deg');
    });

    it('shows a learner outside the top ten their own place anyway', async () => {
        withIdentity('SentBak');
        vi.mocked(fetchBoard).mockResolvedValue(
            board({ total: 240, you: { rank: 17, value: 412, previousRank: 20, toNext: 43 } })
        );
        render(<Harness />);

        await waitFor(() => expect(screen.getByText('NordicVoice')).toBeInTheDocument());
        const items = screen.getAllByRole('listitem').map(item => item.textContent ?? '');
        // Four board rows plus the learner's own, appended after a break.
        expect(items).toHaveLength(5);
        expect(items[4]).toContain('17');
        expect(items[4]).toContain('SentBak');
        expect(items[4]).toContain('deg');
        expect(screen.getByText('240 lærende på denne tavlen')).toBeInTheDocument();
    });

    it('does not repeat the learner when they are already in the top ten', async () => {
        withIdentity('FjordFox');
        vi.mocked(fetchBoard).mockResolvedValue(
            board({ you: { rank: 2, value: 1095, previousRank: 2, toNext: 235 } })
        );
        render(<Harness />);

        await waitFor(() => expect(screen.getByText('FjordFox')).toBeInTheDocument());
        expect(screen.getAllByRole('listitem')).toHaveLength(4);
    });

    it('states the rank, the movement and the gap after a sync', async () => {
        withIdentity('FjordFox');
        vi.mocked(fetchBoard).mockResolvedValue(board());
        vi.mocked(syncCommunity).mockResolvedValue({
            accepted: [],
            rejected: [],
            standing: { rank: 17, value: 412, previousRank: 20, toNext: 43 },
            nickname: 'FjordFox',
        });

        render(<Harness />);
        await waitFor(() => expect(screen.getByText(/Du er #17 denne uken/)).toBeInTheDocument());
        expect(screen.getByText(/↑ 3 plasser/)).toBeInTheDocument();
        expect(screen.getByText(/til #16/)).toBeInTheDocument();
    });

    it('offers the level filters, and asks the server for the chosen one', async () => {
        vi.mocked(fetchBoard).mockResolvedValue(board());
        render(<Harness />);

        await waitFor(() => expect(screen.getByText('NordicVoice')).toBeInTheDocument());
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'B1' }));
        });

        await waitFor(() =>
            expect(vi.mocked(fetchBoard).mock.calls.some(call => call[0] === 'weekly' && call[1] === 'B1')).toBe(true)
        );
    });

    it('formats improvement as a score change, not as points', async () => {
        vi.mocked(fetchBoard).mockResolvedValue(
            board({ scope: 'improved', rows: [row(1, 'FjellTale', 5.8, 'A1')] })
        );
        render(<Harness />);

        await act(async () => {
            fireEvent.click(screen.getByRole('tab', { name: 'Mest forbedret' }));
        });
        await waitFor(() => expect(screen.getByText('+5.8')).toBeInTheDocument());
    });

    it('says so when the board cannot be reached, and offers to retry', async () => {
        vi.mocked(fetchBoard).mockRejectedValue(new Error('Leaderboard responded 503'));
        render(<Harness />);

        await waitFor(() => expect(screen.getByText(/503/)).toBeInTheDocument());
        expect(screen.getByText(/Poengene dine er trygge på denne enheten/)).toBeInTheDocument();

        vi.mocked(fetchBoard).mockResolvedValue(board());
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Prøv igjen' }));
        });
        await waitFor(() => expect(screen.getByText('NordicVoice')).toBeInTheDocument());
    });

    it('invites a first placing rather than showing an empty table', async () => {
        vi.mocked(fetchBoard).mockResolvedValue(board({ rows: [], total: 0 }));
        render(<Harness />);
        await waitFor(() =>
            expect(screen.getByText(/klar for din første plassering/i)).toBeInTheDocument()
        );
    });

    it('asks for a nickname, since here there is a board to be named on', async () => {
        vi.mocked(fetchBoard).mockResolvedValue(board());
        render(<Harness />);
        await waitFor(() => expect(screen.getByText('Hva skal vi kalle deg?')).toBeInTheDocument());
    });
});
