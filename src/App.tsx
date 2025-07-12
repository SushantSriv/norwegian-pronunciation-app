import React, { useState } from 'react';
import AudioRecorder from './components/AudioRecorder';
import './index.css';

import rawSentenceData from './data/sentences.json';

const sentencePools = rawSentenceData.levels;
const TRANSLATIONS = {
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
        success: (p: string) => `Hurra! Du var ${p}% riktig!`,
        tryAgain: '😅 Prøv igjen – sørg for at det er stille rundt deg',
        nextSentence: '🔄 Ny setning',
        countdown: 'Kjør!'

    },
    en: {
        // … same for English …
    }
};

const DIALECTS = ['Bokmål'];

const App: React.FC = () => {
    const [lang, setLang] = useState<'nb' | 'en'>('nb');
    const [dialect, setDialect] = useState(DIALECTS[0]);
    const t = TRANSLATIONS[lang];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <header
                style={{
                    backgroundColor: '#fff',
                    padding: '1rem 2rem',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
            >
                <div
                    style={{
                        maxWidth: 1200,
                        margin: '0 auto',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}
                >
                    <h1 style={{ fontSize: '1.8rem', color: '#333' }}>{t.title}</h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <label style={{ color: '#555', fontSize: '0.9rem' }}>
                            {t.languageLabel}
                        </label>
                        <select
                            value={lang}
                            onChange={e => setLang(e.target.value as 'nb' | 'en')}
                            style={{
                                padding: '0.3rem 0.5rem',
                                borderRadius: 4,
                                border: '1px solid #ccc',
                                background: '#fff',
                                color: '#333'
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
    );
};

export default App;
