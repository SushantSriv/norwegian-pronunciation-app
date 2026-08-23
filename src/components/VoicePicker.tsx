import { isNeighbourVoice, speakNorwegian } from '../utils/audioPlayback';
import { RATE_OPTIONS } from '../hooks/useNorwegianVoices';

interface Props {
    voices: SpeechSynthesisVoice[];
    activeVoiceURI?: string;
    onChoose: (uri: string) => void;
    rate: number;
    onRateChange: (rate: number) => void;
}

/** Strip vendor boilerplate so the dropdown reads cleanly. */
function label(voice: SpeechSynthesisVoice): string {
    const name = voice.name
        .replace(/^(Microsoft|Google)\s+/i, '')
        .replace(/\s*-\s*(Norwegian|Swedish|Danish).*$/i, '')
        .replace(/\s*Online\s*\(Natural\)\s*/i, ' ✨')
        .replace(/\s*\(Natural\)\s*/i, ' ✨')
        .trim();

    const tag = voice.lang.toLowerCase();
    let variety: string;
    if (tag.startsWith('nn')) variety = 'Nynorsk';
    else if (tag.startsWith('sv')) variety = 'Swedish';
    else if (tag.startsWith('da')) variety = 'Danish';
    else variety = 'Bokmål';

    return `${name} · ${variety}`;
}

/** Where to get a Norwegian voice differs per platform, so say the right thing. */
function installHint(): string {
    const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
    if (/Android/i.test(ua)) {
        return 'On Android: Settings → General management → Text-to-speech, then add Norwegian to Google Speech Services and download its voice data.';
    }
    if (/iPhone|iPad|iPod/i.test(ua)) {
        return 'On iPhone/iPad: Settings → Accessibility → Spoken Content → Voices → Norsk.';
    }
    if (/Mac OS X/i.test(ua)) {
        return 'On macOS: System Settings → Accessibility → Spoken Content → System Voice → Manage Voices → Norwegian.';
    }
    return 'On Windows: Settings → Time & language → Language & region → add Norsk bokmål, then install its Speech feature.';
}

export function VoicePicker({ voices, activeVoiceURI, onChoose, rate, onRateChange }: Props) {
    if (voices.length === 0) {
        return (
            <p className="text-xs leading-relaxed text-amber-300/80">
                No Norwegian voice is available on this device, so playback would use a non-Norwegian
                voice. {installHint()}
            </p>
        );
    }

    const active = voices.find(v => v.voiceURI === activeVoiceURI);
    const usingNeighbour = active ? isNeighbourVoice(active) : false;

    return (
        <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="voice" className="text-xs font-semibold uppercase tracking-wide text-white/45">
                    Voice
                </label>
                <select
                    id="voice"
                    value={activeVoiceURI ?? ''}
                    onChange={e => onChoose(e.target.value)}
                    className="min-h-[36px] max-w-[15rem] rounded-lg border border-white/20 bg-slate-900/90 px-2 py-1 text-sm text-white"
                >
                    {voices.map(voice => (
                        <option key={voice.voiceURI} value={voice.voiceURI}>
                            {label(voice)}
                        </option>
                    ))}
                </select>
                <label htmlFor="rate" className="text-xs font-semibold uppercase tracking-wide text-white/45">
                    Speed
                </label>
                <select
                    id="rate"
                    value={rate}
                    onChange={e => onRateChange(Number(e.target.value))}
                    className="min-h-[36px] rounded-lg border border-white/20 bg-slate-900/90 px-2 py-1 text-sm text-white"
                >
                    {RATE_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                <button
                    onClick={() =>
                        void speakNorwegian('Hei, hvordan går det med deg i dag?', {
                            voiceURI: activeVoiceURI,
                            rate,
                        })
                    }
                    className="min-h-[36px] rounded-lg border border-white/20 px-2.5 py-1 text-xs font-semibold text-white/70 transition hover:border-white/40 hover:bg-white/10 hover:text-white"
                >
                    🔊 Test
                </button>
            </div>

            {usingNeighbour && (
                <p className="text-[11px] leading-relaxed text-amber-300/75">
                    This is a Swedish/Danish voice — much closer to Norwegian than an English one, but not a
                    substitute. Install a Norwegian voice for accurate reference audio.
                </p>
            )}

            <p className="text-[11px] text-white/30">
                Voices come from your OS and browser. Edge exposes extra neural voices (marked ✨) while
                online, which sound considerably more natural.
            </p>
        </div>
    );
}
