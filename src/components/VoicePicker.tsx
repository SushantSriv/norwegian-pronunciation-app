import { speakNorwegian } from '../utils/audioPlayback';

interface Props {
    voices: SpeechSynthesisVoice[];
    activeVoiceURI?: string;
    onChoose: (uri: string) => void;
}

/** Strip the vendor boilerplate so the dropdown reads cleanly. */
function label(voice: SpeechSynthesisVoice): string {
    const name = voice.name
        .replace(/^Microsoft\s+/i, '')
        .replace(/\s*-\s*Norwegian.*$/i, '')
        .replace(/\s*\(Natural\)\s*/i, ' ✨')
        .trim();
    const variety = voice.lang.toLowerCase().startsWith('nn') ? 'Nynorsk' : 'Bokmål';
    return `${name} · ${variety}`;
}

export function VoicePicker({ voices, activeVoiceURI, onChoose }: Props) {
    if (voices.length === 0) {
        return (
            <p className="text-xs text-amber-300/80">
                No Norwegian voice is installed, so playback will use a non-Norwegian voice. On Windows, add
                one under Settings → Time &amp; language → Speech.
            </p>
        );
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="voice" className="text-xs font-semibold uppercase tracking-wide text-white/45">
                Voice
            </label>
            <select
                id="voice"
                value={activeVoiceURI ?? ''}
                onChange={e => onChoose(e.target.value)}
                className="min-h-[36px] rounded-lg border border-white/20 bg-slate-900/80 px-2 py-1 text-sm text-white"
            >
                {voices.map(voice => (
                    <option key={voice.voiceURI} value={voice.voiceURI}>
                        {label(voice)}
                    </option>
                ))}
            </select>
            <button
                onClick={() => void speakNorwegian('Hei, hvordan går det?', { voiceURI: activeVoiceURI })}
                className="min-h-[36px] rounded-lg border border-white/20 px-2.5 py-1 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
            >
                🔊 Test
            </button>
        </div>
    );
}
