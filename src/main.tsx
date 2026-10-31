import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { preloadAppRoutes } from './routes';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

// Offline support: register the worker, hand it everything already loaded, and fetch the
// tracker's lazy routes so they are available with no connection. 3D is deliberately not included.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
      const reg = await navigator.serviceWorker.ready;
      await preloadAppRoutes();
      const urls = performance.getEntriesByType('resource').map((e) => e.name).filter((u) => u.startsWith(location.origin) && !u.includes('three'));
      reg.active?.postMessage({ type: 'cache-urls', urls });
    } catch (e) { console.warn('offline setup skipped', e); }
  });
}
