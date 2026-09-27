import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import './index.css';
import App from './App';

/**
 * `reducedMotion="user"` makes framer-motion read the operating system's own
 * setting and drop transform and layout animations for anybody who has asked
 * for less movement. It is set once here rather than per component, because
 * the components that most need it — a pulsing glow, a parallax background —
 * are the ones least likely to remember.
 */
createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <MotionConfig reducedMotion="user">
            <App />
        </MotionConfig>
    </StrictMode>
);
