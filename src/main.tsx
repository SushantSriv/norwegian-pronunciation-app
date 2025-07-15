import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { AppStatusProvider } from './context/AppStatus';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <AppStatusProvider>
            <App />
        </AppStatusProvider>
  </StrictMode>,
)
