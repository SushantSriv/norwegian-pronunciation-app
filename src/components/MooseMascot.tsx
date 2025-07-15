/* src/components/MooseMascot.tsx */
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { useAppStatus } from '../hooks/useAppStatus';

/*  Bildene bundle-importeres (da slipper du /public-baner som kan være feil på Vercel) */
import mooseNeutral from '../assets/mascot/mascot_neutral.png';
import mooseListening from '../assets/mascot/mascot_listening.png';
import mooseHappy from '../assets/mascot/mascot_happy.png';
import mooseSad from '../assets/mascot/mascot_sad.png';
import mooseWelcome from '../assets/mascot/mascot_welcome.png';
import mooseProcessing from '../assets/mascot/mascot_processing.png';
import mooseError from '../assets/mascot/mascot_error.png';


/* ---- interne konstanter, men IKKE med “export” ---- */
const sprite: Record<string, string> = {
    idle: mooseNeutral,
    welcome: mooseWelcome,
    listening: mooseListening,
    success: mooseHappy,
    partialFail: mooseSad,
    fail: mooseSad,
    processing: mooseProcessing,
    error: mooseError,
};

const anim: Record<string, Variants> = {
    listening: {
        vis: { y: [0, -12, 0], transition: { repeat: Infinity, duration: 1.2 } }
    },
    success: {
        vis: { scale: [1, 1.3, 1], transition: { duration: 0.8, repeat: 2 } }
    },
    partialFail: {
        vis: { x: [0, -6, 6, -4, 4, 0], transition: { duration: 0.7 } }
    },
    fail: {
        vis: { rotate: [0, 5, -5, 5, -5, 0], transition: { duration: 1 } }
    },
    processing: {
        vis: { rotate: [0, 8, -8, 8, -8, 0], transition: { repeat: Infinity, duration: 1.4 } }
    },
    error: {
        vis: { scale: [1, 0.95, 1], transition: { repeat: Infinity, duration: 0.6 } }
    },
    welcome: {
        vis: { scale: [1, 1.1, 1], transition: { duration: 1 } } // 🔄 start på 1 i stedet for 0
    },
    idle: {
        vis: { scale: 1 }
    }
};

/* ---- eneste export under react-refresh ---- */
export const MooseMascot: React.FC = () => {
    const [status] = useAppStatus();

    const isWelcome = status === 'welcome';

    return (
        <motion.img
            src={sprite[status] ?? mooseNeutral}
            variants={anim[status] ?? anim.idle}
            initial="vis"
            animate="vis"
            className={isWelcome ? 'moose-welcome' : 'moose-default'}
            alt="Moose mascot"
        />
    );
};
