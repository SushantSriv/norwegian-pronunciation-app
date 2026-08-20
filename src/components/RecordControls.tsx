import type { Texts } from '../types/Texts';

interface Props {
    text: Texts;
    recording: boolean;
    processing: boolean;
    countingDown: boolean;
    playbackRate: number;
    onPlaybackRateChange: (rate: number) => void;
    onHearCorrect: () => void;
    onToggleRecording: () => void;
}

export function RecordControls({
    text,
    recording,
    processing,
    countingDown,
    playbackRate,
    onPlaybackRateChange,
    onHearCorrect,
    onToggleRecording,
}: Props) {
    const disabled = processing || countingDown;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <button
                    onClick={onHearCorrect}
                    className="rounded-md bg-orange-500 px-5 py-3 text-sm font-bold text-white shadow transition hover:bg-orange-600 sm:text-base"
                >
                    🔈 {text.hearCorrect}
                </button>

                <label className="flex min-h-[44px] items-center gap-2 rounded-md bg-amber-100 px-3 py-2 text-sm font-medium text-slate-700">
                    <span>Speed:</span>
                    <select
                        value={playbackRate}
                        onChange={e => onPlaybackRateChange(parseFloat(e.target.value))}
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                    >
                        <option value={0.75}>0.75× – Slow</option>
                        <option value={1}>1× – Normal</option>
                        <option value={1.25}>1.25× – Fast</option>
                        <option value={1.5}>1.5× – Fastest</option>
                    </select>
                </label>
            </div>

            <button
                onClick={onToggleRecording}
                disabled={disabled}
                aria-label={recording ? text.stop : text.start}
                className={[
                    'min-h-[52px] w-full rounded-md text-lg font-bold text-white shadow transition active:scale-[0.98]',
                    recording ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700',
                    disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                ].join(' ')}
            >
                {recording ? `🔴 ${text.stop}` : `🎙️ ${text.start}`}
            </button>
        </div>
    );
}
