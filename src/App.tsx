// src/App.tsx
import React, { useState } from 'react';
import AudioRecorder from './components/AudioRecorder';
import { Parallax } from './components/Parallax';
import { MooseMascot } from './components/MooseMascot';
import './index.css';
import type { Texts } from './types/Texts';
import rawSentenceData from './data/sentences.json';

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
        success: (p) => `Hurra! Du var ${p}% riktig!`,
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
        success: (p) => `Great! You were ${p}% correct!`,
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

    return (
        <>
            {/* Parallax-bakgrunn + snøpartikler */}
            <div id="parallax">
                <Parallax />
            </div>

            {/* Maskotten i hjørnet */}
            <div className="moose-wrapper">
                <MooseMascot />
            </div>

            {/* Resten av app-innholdet ligger over bakgrunnen */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    position: 'relative',
                    zIndex: 1,
                }}
            >
                {/* Header */}
                <header
                    style={{
                        backgroundColor: '#fff',
                        padding: '1rem 2rem',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    }}
                >
                    <div
                        style={{
                            maxWidth: 1200,
                            margin: '0 auto',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}
                    >
                        <h1 style={{ fontSize: '1.8rem', color: '#333' }}>{t.title}</h1>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <label style={{ color: '#555', fontSize: '0.9rem' }}>{t.languageLabel}</label>

                            <select
                                value={lang}
                                onChange={(e) => setLang(e.target.value as 'nb' | 'en')}
                                style={{
                                    padding: '0.3rem 0.5rem',
                                    borderRadius: 4,
                                    border: '1px solid #ccc',
                                    background: '#fff',
                                    color: '#333',
                                }}
                            >
                                <option value="nb">Norsk</option>
                                <option value="en">English</option>
                            </select>
                        </div>
                    </div>
                </header>

                {/* Main content */}
                <main style={{ flex: 1, overflowY: 'auto', padding: '2rem 1rem' }}>
                    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                        <AudioRecorder
                            sentencePools={sentencePools}
                            text={t}
                            dialects={DIALECTS}
                            currentDialect={dialect}
                            onDialectChange={setDialect}
                        />
                    </div>
                </main>
            </div>
        </>
    );
};

export default App;
