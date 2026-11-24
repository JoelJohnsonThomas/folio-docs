import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './auth';
import { ToastProvider } from './components/Toast';
import { DocumentsPage } from './pages/DocumentsPage';
import { LoginPage } from './pages/LoginPage';

// The editor (TipTap/ProseMirror) is most of the bundle; load it only when a document is opened.
const EditorPage = lazy(() => import('./pages/EditorPage').then((m) => ({ default: m.EditorPage })));

const Spinner = ({ label }: { label: string }) => (
  <div className="center-screen muted">
    <Loader2 className="spin" size={20} /> {label}
  </div>
);

function Routed() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Loading…" />;
  // Signed-out users see the login screen on any URL, then land where they were going.
  if (!user) return <LoginPage />;
  return (
    <Suspense fallback={<Spinner label="Loading editor…" />}>
      <Routes>
        <Route path="/" element={<DocumentsPage />} />
        <Route path="/d/:id" element={<EditorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routed />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
