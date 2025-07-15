// src/SnowTest.tsx
import Particles from 'react-tsparticles';

const SnowTest = () => (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
        <Particles
            id="snow"
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: 1,
                pointerEvents: 'none',
                background: '#001f3f' // mørk bakgrunn for kontrast
            }}
            options={{
                fullScreen: { enable: false },
                fpsLimit: 60,
                particles: {
                    number: { value: 100 },
                    size: { value: { min: 3, max: 6 } },
                    move: { enable: true, speed: 1, direction: 'bottom' },
                    shape: {
                        type: 'circle', // ← ikke bilde!
                    },
                    color: {
                        value: '#ffffff'
                    },
                    opacity: { value: { min: 0.5, max: 1 } },
                }
            }}
        />
        <h1 style={{
            position: 'relative',
            color: 'white',
            textAlign: 'center',
            marginTop: '30vh',
            fontSize: '2rem'
        }}>
            ❄ Snøtest med sirkel
        </h1>
    </div>
);

export default SnowTest;
