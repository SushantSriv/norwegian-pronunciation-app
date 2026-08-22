/**
 * Reference pronunciation via the browser speech synthesiser. There is no
 * recorded audio corpus shipped with the app, so this is the only source.
 */
export function speakNorwegian(text: string, rate = 0.95) {
    if (!('speechSynthesis' in window)) return;

    // Cancel anything already queued so rapid taps do not stack up.
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'nb-NO';
    utterance.rate = rate;

    // Prefer a real Norwegian voice when the platform ships one; otherwise the
    // default voice reads it with an English accent, which teaches the wrong thing.
    const norwegian = window.speechSynthesis
        .getVoices()
        .find(v => v.lang.toLowerCase().startsWith('nb') || v.lang.toLowerCase().startsWith('no'));
    if (norwegian) utterance.voice = norwegian;

    window.speechSynthesis.speak(utterance);
}
