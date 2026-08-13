import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {resolvePublicRoute} from './api/publicRoutes';
import {LegalCenter} from './components/LegalCenter';
import './index.css';

const publicRoute = resolvePublicRoute(window.location.pathname);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {publicRoute.kind === 'legal'
      ? <LegalCenter documentId={publicRoute.documentId} />
      : <App />}
  </StrictMode>,
);
