import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GameProvider } from './context/GameContext'
import { SocketProvider } from './context/SocketContext'
import ErrorBoundary from './components/ErrorBoundary'
import { resolveEntryRoute } from './utils/entryRoutes'
import './index.css'
import App from './App.jsx'

const initialEntryRoute = resolveEntryRoute(window.location);
const requiresDocumentNavigation = initialEntryRoute.type === 'not-found'
  || (initialEntryRoute.type === 'redirect' && initialEntryRoute.navigation === 'document');

if (initialEntryRoute.type === 'redirect' && initialEntryRoute.navigation === 'history') {
  window.history.replaceState({}, document.title, initialEntryRoute.to);
}

if (requiresDocumentNavigation) {
  window.location.replace(initialEntryRoute.to || '/organizer');
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ErrorBoundary>
        <SocketProvider>
          <GameProvider>
            <App />
          </GameProvider>
        </SocketProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}
