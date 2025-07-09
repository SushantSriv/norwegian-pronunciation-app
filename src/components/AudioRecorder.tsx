import React, { useState, useRef } from 'react';

const PRACTICE_SENTENCES = [
    "Jeg heter Anna",
    "Hvordan går det?",
    "Katten sitter under bordet",
    "Bålet brenner i peisen"
];

const AudioRecorder: React.FC = () => {
    const [expected, setExpected] = useState<string>(PRACTICE_SENTENCES[0]);
    const [recording, setRecording] = useState<boolean>(false);
    const [audioURL, setAudioURL] = useState<string | null>(null);
    const [uploadStatus, setUploadStatus] = useState<string | null>(null);
    const [transcript, setTranscript] = useState<string>('');
    const [werScore, setWerScore] = useState<number | null>(null);
    const [subs, setSubs] = useState<number>(0);
    const [dels, setDels] = useState<number>(0);
    const [ins, setIns] = useState<number>(0);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunks = useRef<Blob[]>([]);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunks.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunks.current.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                // build blob and preview URL
                const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
                const url = URL.createObjectURL(audioBlob);
                setAudioURL(url);

                // send to backend
                const formData = new FormData();
                formData.append('audio', audioBlob, 'recording.webm');
                formData.append('expected', expected);

                try {
                    setUploadStatus('Uploading…');
                    const res = await fetch('http://localhost:8000/upload-audio/', {
                        method: 'POST',
                        body: formData,
                    });
                    const data = await res.json();

                    if (res.ok) {
                        setUploadStatus('Resultater mottatt');
                        setTranscript(data.transcript || '');
                        setWerScore(data.wer);
                        setSubs(data.substitutions);
                        setDels(data.deletions);
                        setIns(data.insertions);
                    } else {
                        setUploadStatus(`Upload failed: ${data.detail || res.statusText}`);
                    }
                } catch (err) {
                    console.error(err);
                    setUploadStatus('Upload error');
                }
            };

            mediaRecorder.start();
            setRecording(true);
            setUploadStatus(null);
            setTranscript('');
            setWerScore(null);
        } catch (err) {
            console.error('Could not start recording:', err);
        }
    };

    const stopRecording = () => {
        mediaRecorderRef.current?.stop();
        setRecording(false);
    };

    return (
        <div style={{ maxWidth: 600, margin: '2rem auto', textAlign: 'center' }}>
            <h2>Øv på norsk uttale</h2>

            <div style={{ marginBottom: '1rem' }}>
                <label>
                    Velg setning:
                    <select
                        value={expected}
                        onChange={e => setExpected(e.target.value)}
                        style={{ marginLeft: '0.5rem' }}
                    >
                        {PRACTICE_SENTENCES.map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </label>
            </div>

            <button onClick={recording ? stopRecording : startRecording}>
                {recording ? 'Stopp innspilling' : 'Start innspilling'}
            </button>

            {audioURL && (
                <div style={{ marginTop: '1rem' }}>
                    <p><strong>Preview:</strong></p>
                    <audio src={audioURL} controls />
                </div>
            )}

            {uploadStatus && (
                <p style={{ marginTop: '0.5rem' }}>
                    <strong>{uploadStatus}</strong>
                </p>
            )}

            {transcript && (
                <div style={{ marginTop: '1rem', textAlign: 'left' }}>
                    <p><strong>Forventet:</strong> {expected}</p>
                    <p><strong>Du sa:</strong> {transcript}</p>

                    {werScore !== null && (
                        <>
                            <p><strong>Uttalefeil (WER):</strong> {(werScore * 100).toFixed(1)} %</p>
                            <p>
                                <strong>Substitusjoner:</strong> {subs},{' '}
                                <strong>Slettinger:</strong> {dels},{' '}
                                <strong>Innsettinger:</strong> {ins}
                            </p>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default AudioRecorder;
