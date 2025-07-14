import React from 'react';
import Particles from 'react-tsparticles';

import bgFar from '../assets/bg/bg_far.png';
import bgMid from '../assets/bg/bg_mid.png';
import bgFore from '../assets/bg/bg_fore.png';
import snow from '../assets/particles/snowflake.png'; // legg denne i src/assets/particles/

export const Parallax: React.FC = () => (
    <>
        <img className="bg far" src={bgFar} />
        <img className="bg mid" src={bgMid} />
        <img className="bg fore" src={bgFore} />
        <Particles
            id="snow"
            className="pointer-events-none"
            options={{
                fpsLimit: 60,
                particles: {
                    number: { value: 120 },
                    size: { value: { min: 2, max: 5 } },
                    move: { enable: true, speed: 0.3, direction: 'bottom' },
                    shape: { type: 'image', image: [{ src: snow, width: 32, height: 32 }] },
                    opacity: { value: { min: 0.3, max: 0.9 } },
                },
            }}
        />
    </>
);
