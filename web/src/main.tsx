import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Logo } from './components/Logo';
import './styles.css';

// When embedded in another site's iframe, cookies are third-party (sign-in would
// silently fail) and the UI could be clickjacked, so only offer a link out.
const framed = window.self !== window.top;

function OpenInNewTab() {
  return (
    <div className="login-page">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <Logo size={40} />
        <h1>Folio works best in its own tab</h1>
        <p className="muted">Sign-in cookies don't work inside embedded frames.</p>
        <a className="btn btn-primary" href={window.location.href} target="_blank" rel="noopener">
          Open Folio in a new tab
        </a>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode>{framed ? <OpenInNewTab /> : <App />}</StrictMode>);
