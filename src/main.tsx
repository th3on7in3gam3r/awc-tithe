import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

/**
 * Hide the #awc-boot cover from index.html once the app has rendered.
 * This lives here, not in an inline <script>, because the production
 * Content-Security-Policy blocks inline scripts (script-src 'self').
 */
function dismissBootCover(): void {
  const el = document.getElementById('awc-boot');
  if (!el || el.classList.contains('awc-boot--hide')) return;
  el.classList.add('awc-boot--hide');
  el.setAttribute('aria-busy', 'false');
  window.setTimeout(() => el.remove(), 400);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// A plain timer, not requestAnimationFrame: rAF never fires in background or
// hidden tabs, which left the cover up indefinitely.
window.setTimeout(dismissBootCover, 150);
