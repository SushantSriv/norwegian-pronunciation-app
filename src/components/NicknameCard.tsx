import { useEffect, useMemo, useState } from 'react';
import { checkNickname, suggestNickname } from '../utils/identity';

interface Props {
    /** Joining for the first time, or changing a name already chosen. */
    mode: 'join' | 'rename';
    current?: string;
    onSubmit: (nickname: string) => void;
    onCancel?: () => void;
}

/**
 * Choosing what other learners will call you.
 *
 * The field arrives already filled in with something like FjordFox, so the
 * shortest path through this — press the button, say nothing — is also the
 * anonymous one. Nobody has to think of a pseudonym under pressure and end up
 * typing their own name because it was easier.
 */
export function NicknameCard({ mode, current, onSubmit, onCancel }: Props) {
    const suggestion = useMemo(() => suggestNickname(), []);
    const [value, setValue] = useState(current ?? suggestion);
    const [touched, setTouched] = useState(false);

    useEffect(() => {
        if (current) setValue(current);
    }, [current]);

    const check = checkNickname(value);
    const joining = mode === 'join';

    return (
        <form
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"
            onSubmit={event => {
                event.preventDefault();
                setTouched(true);
                if (check.ok) onSubmit(check.value);
            }}
        >
            <h3 className="text-lg font-bold text-white">
                {joining ? 'Hva skal vi kalle deg?' : 'Bytt navn'}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-white/55">
                Du trenger ikke bruke ditt ekte navn — og du bør la være. Dette er det eneste andre
                lærende ser. Ingen e-post, ingen konto, ingen innlogging.
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <div className="flex-1">
                    <label htmlFor="nickname" className="sr-only">
                        Nickname
                    </label>
                    <input
                        id="nickname"
                        value={value}
                        onChange={event => setValue(event.target.value)}
                        onBlur={() => setTouched(true)}
                        maxLength={40}
                        autoComplete="off"
                        spellCheck={false}
                        className="min-h-[48px] w-full rounded-xl border border-white/15 bg-white/[0.06] px-3.5 text-base font-semibold text-white outline-none transition placeholder:text-white/30 focus:border-sky-300/60"
                        placeholder={suggestion}
                    />
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setValue(suggestNickname());
                        setTouched(false);
                    }}
                    className="min-h-[48px] shrink-0 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white/70 transition hover:border-white/35 hover:bg-white/10 hover:text-white"
                >
                    🎲 Foreslå et navn
                </button>
            </div>

            {touched && !check.ok && (
                <p role="alert" className="mt-2 text-sm text-rose-300">
                    {check.message}
                </p>
            )}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                    type="submit"
                    className="min-h-[48px] flex-1 rounded-xl bg-white text-base font-bold text-slate-900 shadow-lg shadow-black/30 transition hover:bg-white/90"
                >
                    {joining ? 'Bli med' : 'Lagre'}
                </button>
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="min-h-[48px] rounded-xl border border-white/20 px-5 text-sm font-semibold text-white/70 transition hover:border-white/40 hover:bg-white/10 hover:text-white"
                    >
                        Avbryt
                    </button>
                )}
            </div>

            {joining && (
                <p className="mt-3 text-[11px] leading-relaxed text-white/35">
                    Poengene dine telles allerede på denne enheten. Å velge et navn handler kun om å
                    vises på en delt tavle — opptak og transkripsjoner er aldri en del av det.
                </p>
            )}
        </form>
    );
}
