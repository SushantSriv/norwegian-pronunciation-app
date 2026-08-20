import { useState } from 'react';
import mooseWelcome from '../assets/mascot/mascot_welcome.png';

interface Props {
    onSubmit: (name: string) => void;
}

export function NameGate({ onSubmit }: Props) {
    const [name, setName] = useState('');

    const submit = () => {
        if (name.trim()) onSubmit(name.trim());
    };

    return (
        <div className="flex flex-col items-center px-4 py-10 text-center">
            <img src={mooseWelcome} alt="Moose welcome" className="mb-6 w-48 sm:w-64" />

            <h2 className="mb-4 text-xl font-bold text-slate-800 sm:text-2xl">Welcome! What's your name?</h2>

            <div className="flex w-full max-w-sm flex-col gap-2 sm:flex-row sm:justify-center">
                <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()}
                    placeholder="Your name"
                    className="min-h-[44px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-lg"
                />
                <button
                    disabled={!name.trim()}
                    onClick={submit}
                    className="min-h-[44px] rounded-md bg-brand-600 px-5 py-2 text-lg font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Start
                </button>
            </div>
        </div>
    );
}
