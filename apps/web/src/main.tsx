import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { isAppPath } from './lib/router';
import './styles.css';

// Each page loads only its own code: the landing page stays light, the app loads under /app.
const App = lazy(() => import('./App').then((m) => ({ default: m.App })));
const Landing = lazy(() => import('./components/Landing').then((m) => ({ default: m.Landing })));

const standalone = window.matchMedia?.('(display-mode: standalone)').matches;
// An installed Segue opens straight into the app.
if (!isAppPath(window.location.pathname) && standalone) history.replaceState(null, '', '/app');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div className="boot" aria-busy="true" />}>{isAppPath(window.location.pathname) ? <App /> : <Landing />}</Suspense>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env?.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline support is a bonus, never a blocker */
    });
  });
}
