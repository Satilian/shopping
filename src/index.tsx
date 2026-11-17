import { createRoot, hydrateRoot } from 'react-dom/client';
import App from './components/app';
import '@satilian/ui-kit/styles.css';
import './index.css';

const root = document.getElementById('root');

if (root?.hasChildNodes()) {
  hydrateRoot(root, <App />);
} else if (root) {
  createRoot(root).render(<App />);
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/static/pwa/service-worker.js', { scope: '/' }).catch((error: unknown) => {
    console.error('Service worker registration failed', error);
  });
}
