// src/components/Parallax.tsx
import React from 'react';
import Particles from 'react-tsparticles';

import bgFar from '../assets/bg/bg_far.png';
import bgMid from '../assets/bg/bg_mid.png';
import bgFore from '../assets/bg/bg_fore.png';
import snowPNG from '../assets/particles/snowflake.png';

export const Parallax: React.FC = () => (
    <>
        <img className="bg far" src={bgFar} alt="" />
        <img className="bg mid" src={bgMid} alt="" />
        /<img className="bg fore" src={bgFore} alt="" />
        <Particles
            id="snow"
            className="pointer-events-none"
            options={{
                fpsLimit: 60,
                particles: {
                    number: { value: 120 },
                    size: { value: { min: 2, max: 5 } },
                    move: { enable: true, speed: 0.3, direction: 'bottom' },
                    shape: { type: 'image', image: [{ src: snowPNG, width: 32, height: 32 }] },
                    opacity: { value: { min: 0.3, max: 0.9 } },
                }
            }}
        />
    </>
);
