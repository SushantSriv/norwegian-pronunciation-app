// src/components/Parallax.tsx
import React from 'react';
import bgFar from '../assets/bg/bg_far.webp';
import bgMid from '../assets/bg/bg_mid.webp';
import bgFore from '../assets/bg/bg_fore.webp';


export const Parallax: React.FC = () => (
    <>
        <img className="bg far" src={bgFar} alt="" />
        <img className="bg mid" src={bgMid} alt="" />
        <img className="bg fore" src={bgFore} alt="" />
    </>
);
