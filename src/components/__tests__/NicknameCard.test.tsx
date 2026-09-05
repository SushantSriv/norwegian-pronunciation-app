import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NicknameCard } from '../NicknameCard';

/**
 * Choosing a name.
 *
 * Tested on the component rather than through the community screen, because
 * that screen only offers it when there is a shared board to be named on.
 */

beforeEach(cleanup);

const joinCard = (onSubmit = vi.fn()) => {
    render(<NicknameCard mode="join" onSubmit={onSubmit} />);
    return onSubmit;
};

describe('NicknameCard', () => {
    it('asks the question and nothing else', () => {
        joinCard();
        expect(screen.getByText('Hva skal vi kalle deg?')).toBeInTheDocument();
        expect(screen.getByText(/Du trenger ikke bruke ditt ekte navn/)).toBeInTheDocument();
        // No email, no password, no account.
        expect(screen.queryByLabelText(/e-?post|e-?mail/i)).not.toBeInTheDocument();
        expect(document.querySelector('input[type="password"]')).toBeNull();
    });

    it('arrives already filled in with a usable name', () => {
        joinCard();
        const field = screen.getByLabelText('Nickname') as HTMLInputElement;
        // The shortest path through the form is the anonymous one.
        expect(field.value).toMatch(/^[A-Za-zÆØÅæøå]{4,}$/);
    });

    it('submits the suggestion when the learner just presses the button', () => {
        const onSubmit = joinCard();
        const suggested = (screen.getByLabelText('Nickname') as HTMLInputElement).value;
        fireEvent.click(screen.getByRole('button', { name: 'Bli med' }));
        expect(onSubmit).toHaveBeenCalledWith(suggested);
    });

    it('offers a different name on request', () => {
        joinCard();
        const field = screen.getByLabelText('Nickname') as HTMLInputElement;
        const before = field.value;
        // Sampling a few times: two draws can legitimately coincide.
        let changed = false;
        for (let i = 0; i < 12 && !changed; i++) {
            fireEvent.click(screen.getByRole('button', { name: /Foreslå et navn/ }));
            changed = field.value !== before;
        }
        expect(changed).toBe(true);
    });

    it('accepts a name the learner typed', () => {
        const onSubmit = joinCard();
        fireEvent.change(screen.getByLabelText('Nickname'), { target: { value: 'FjellTale' } });
        fireEvent.click(screen.getByRole('button', { name: 'Bli med' }));
        expect(onSubmit).toHaveBeenCalledWith('FjellTale');
    });

    it('trims rather than refusing over stray spaces', () => {
        const onSubmit = joinCard();
        fireEvent.change(screen.getByLabelText('Nickname'), { target: { value: '  Fjord  Fox ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Bli med' }));
        expect(onSubmit).toHaveBeenCalledWith('Fjord Fox');
    });

    it('refuses an empty name and says why, without submitting', () => {
        const onSubmit = joinCard();
        fireEvent.change(screen.getByLabelText('Nickname'), { target: { value: '  ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Bli med' }));

        expect(onSubmit).not.toHaveBeenCalled();
        expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('refuses a name that is really a link', () => {
        const onSubmit = joinCard();
        fireEvent.change(screen.getByLabelText('Nickname'), {
            target: { value: 'http://a.example' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Bli med' }));

        expect(onSubmit).not.toHaveBeenCalled();
        // Caught by the character allow-list, which is what keeps links out.
        expect(screen.getByRole('alert').textContent).toMatch(/bokstaver, tall/i);
    });

    it('says nothing until the learner has actually tried', () => {
        joinCard();
        fireEvent.change(screen.getByLabelText('Nickname'), { target: { value: 'x' } });
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('renames from the current name, and can be cancelled', () => {
        const onSubmit = vi.fn();
        const onCancel = vi.fn();
        render(
            <NicknameCard mode="rename" current="FjordFox" onSubmit={onSubmit} onCancel={onCancel} />
        );

        expect(screen.getByText('Bytt navn')).toBeInTheDocument();
        expect((screen.getByLabelText('Nickname') as HTMLInputElement).value).toBe('FjordFox');

        fireEvent.click(screen.getByRole('button', { name: 'Avbryt' }));
        expect(onCancel).toHaveBeenCalled();
        expect(onSubmit).not.toHaveBeenCalled();

        fireEvent.change(screen.getByLabelText('Nickname'), { target: { value: 'FjellRev' } });
        fireEvent.click(screen.getByRole('button', { name: 'Lagre' }));
        expect(onSubmit).toHaveBeenCalledWith('FjellRev');
    });

    it('is in one language', () => {
        // The community feature speaks Norwegian; a sentence that switches
        // halfway is the thing this is here to stop coming back.
        joinCard();
        const body = document.body.textContent ?? '';
        for (const english of [' and you should not', 'No email, no account', 'Your points']) {
            expect(body).not.toContain(english);
        }
    });
});
