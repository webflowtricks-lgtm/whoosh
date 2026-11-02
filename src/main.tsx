import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary.tsx';
import {LanguageProvider} from './lib/i18n';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ErrorBoundary>
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(error => {
        console.error('Failed to register the service worker:', error);
      });
    });
  } else {
    // Em desenvolvimento o service worker intercepta os módulos do Vite (/@vite, /src, HMR)
    // e causa tela branca. Garante que qualquer SW antigo seja removido.
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(reg => reg.unregister());
    }).catch(error => {
      console.error('Failed to remove development service workers:', error);
    });
  }
}

