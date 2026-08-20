export function speakTTS(text: string, rate: number) {
    if (!('speechSynthesis' in window)) return;
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'nb-NO';
    utt.rate = rate;
    window.speechSynthesis.speak(utt);
}

// Falls back to browser TTS since /samples/<dialect>/<word>.mp3 audio isn't shipped yet.
export function playPronunciation(dialect: string, text: string, rate: number) {
    const url = `/samples/${encodeURIComponent(dialect)}/${encodeURIComponent(text)}.mp3`;
    const audio = new Audio(url);
    audio.playbackRate = rate;
    audio.oncanplaythrough = () => audio.play();
    audio.onerror = () => speakTTS(text, rate);
    audio.load();
}
