// src/App.tsx
import { useState } from 'react';
import AudioRecorder from './components/AudioRecorder';
import { Parallax } from './components/Parallax';
import { MooseMascot } from './components/MooseMascot';
import './index.css';
import type { Texts } from './types/Texts';
import rawSentenceData from './data/sentences.json';
import snowPNG from './assets/particles/snowflake.png?url';
import Particles from 'react-tsparticles';
import { useAppStatus } from './hooks/useAppStatus';

const sentencePools = rawSentenceData.levels;

const TRANSLATIONS: Record<'nb' | 'en', Texts> = {
    nb: {
        title: 'Øv på norsk uttale',
        languageLabel: 'Språk:',
        start: 'Start innspilling',
        stop: 'Stopp innspilling',
        preview: 'Forhåndslytt',
        expected: 'Forventet:',
        youSaid: 'Du sa:',
        wer: 'WER:',
        substitutions: 'Substitusjoner:',
        deletions: 'Slettinger:',
        insertions: 'Innsettinger:',
        errors: 'Feil ord:',
        hearCorrect: 'Hør korrekt uttale',
        success: (p) => `Hurra! Du fikk ${p} poeng!`,
        tryAgain: '😅 Prøv igjen – sørg for at det er stille rundt deg',
        nextSentence: '🔄 Ny setning',
        countdown: 'Kjør!',
    },

    en: {
        title: 'Practise Norwegian pronunciation',
        languageLabel: 'Language:',
        start: 'Start recording',
        stop: 'Stop recording',
        preview: 'Preview',
        expected: 'Expected:',
        youSaid: 'You said:',
        wer: 'WER:',
        substitutions: 'Substitutions:',
        deletions: 'Deletions:',
        insertions: 'Insertions:',
        errors: 'Wrong words:',
        hearCorrect: 'Hear correct pronunciation',
        success: (p) => `Great! You scored ${p} points!`,
        tryAgain: '😅 Try again – make sure your room is quiet',
        nextSentence: '🔄 New sentence',
        countdown: 'Go!',
    },
};

const DIALECTS = ['Bokmål'];

const App: React.FC = () => {
    const [lang, setLang] = useState<'nb' | 'en'>('nb');
    const [dialect, setDialect] = useState(DIALECTS[0]);
    const t = TRANSLATIONS[lang];
    const [status] = useAppStatus();

    return (
        <>
            {/* Parallax background + snow particles */}
            <div id="parallax">
                <Parallax />
            </div>

            <Particles
                id="snow"
                className="pointer-events-none fixed inset-0 -z-20"
                options={{
                    fullScreen: { enable: false },
                    fpsLimit: 60,
                    particles: {
                        number: { value: 120 },
                        size: { value: { min: 2, max: 5 } },
                        move: { enable: true, speed: 0.3, direction: 'bottom' },
                        shape: {
                            type: 'image',
                            image: {
                                src: snowPNG,
                                width: 32,
                                height: 32,
                            },
                        },
                        opacity: { value: { min: 0.3, max: 0.9 } },
                    },
                }}
            />

            {status !== 'welcome' && <MooseMascot />}

            {/* z-20 beats the mascot's fixed z-10 so the header/card occlude it
                instead of it covering the dropdowns — see .moose-default in index.css */}
            <div className="relative z-20 flex min-h-full flex-col items-center">
                <div className="relative w-full max-w-4xl px-3 sm:px-4">
                    <header className="rounded-b-lg bg-white/95 px-4 py-4 shadow sm:px-8">
                        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 sm:flex-row">
                            <h1 className="text-center text-xl font-bold text-slate-800 sm:text-left sm:text-2xl">
                                {t.title}
                            </h1>

                            <div className="flex items-center gap-2">
                                <label className="text-sm text-slate-600">{t.languageLabel}</label>
                                <select
                                    value={lang}
                                    onChange={e => setLang(e.target.value as 'nb' | 'en')}
                                    className="min-h-[40px] rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-800"
                                >
                                    <option value="nb">Norsk</option>
                                    <option value="en">English</option>
                                </select>
                            </div>
                        </div>
                    </header>

                    <main className="px-0 py-6 sm:px-2">
                        <AudioRecorder
                            sentencePools={sentencePools}
                            text={t}
                            dialects={DIALECTS}
                            currentDialect={dialect}
                            onDialectChange={setDialect}
                        />
                    </main>
                </div>
            </div>
        </>
    );
};

export default App;
