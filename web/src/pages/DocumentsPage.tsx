import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { FileText, FileUp, Plus, Trash2, Users } from 'lucide-react';
import { api, SUPPORTED_UPLOADS, SUPPORTED_UPLOADS_LABEL } from '../api';
import { useAuth } from '../auth';
import type { DocListItem } from '../types';
import { firstName, roleLabel, timeAgo } from '../format';
import { Avatar } from '../components/Avatar';
import { Logo } from '../components/Logo';
import { UserMenu } from '../components/UserMenu';
import { useToast } from '../components/Toast';

export function DocumentsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [docs, setDocs] = useState<{ owned: DocListItem[]; shared: DocListItem[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'create' | 'import' | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoadError(null);
    api
      .listDocs()
      .then(setDocs)
      .catch((e) => setLoadError(e.message));
  }, []);
  useEffect(load, [load, user?.id]);

  const create = async () => {
    setBusy('create');
    try {
      const doc = await api.createDoc();
      navigate(`/d/${doc.id}`, { state: { focusTitle: true } });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create document', 'error');
      setBusy(null);
    }
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy('import');
    try {
      const doc = await api.importDoc(file);
      toast(`Imported "${file.name}"`, 'success');
      navigate(`/d/${doc.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import failed', 'error');
      setBusy(null);
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const remove = async (doc: DocListItem) => {
    if (!window.confirm(`Delete "${doc.title}"? This can't be undone and removes access for everyone it's shared with.`)) return;
    try {
      await api.deleteDoc(doc.id);
      setDocs((d) => d && { ...d, owned: d.owned.filter((x) => x.id !== doc.id) });
      toast('Document deleted', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Delete failed', 'error');
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void importFile(e.dataTransfer.files[0]);
  };

  return (
    <div
      className="docs-page"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={onDrop}
    >
      <header className="app-header">
        <Link to="/" className="brand">
          <Logo withText />
        </Link>
        <div className="spacer" />
        <UserMenu />
      </header>

      <main className="docs-main">
        <section className="start-row">
          <div>
            <h1>Welcome back, {user && firstName(user.name)}</h1>
            <p className="muted">Create a document, or import a {SUPPORTED_UPLOADS_LABEL}. You can also drop a file anywhere on this page.</p>
          </div>
          <div className="start-actions">
            <button className="btn" onClick={() => fileInput.current?.click()} disabled={busy !== null}>
              <FileUp size={16} /> {busy === 'import' ? 'Importing…' : 'Import file'}
            </button>
            <button className="btn btn-primary" onClick={create} disabled={busy !== null}>
              <Plus size={16} /> {busy === 'create' ? 'Creating…' : 'New document'}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept={SUPPORTED_UPLOADS}
              hidden
              onChange={(e) => void importFile(e.target.files?.[0])}
            />
          </div>
        </section>

        {loadError && (
          <div className="alert alert-error">
            {loadError} <button className="link-btn" onClick={load}>Retry</button>
          </div>
        )}
        {!docs && !loadError && <div className="muted pad">Loading documents…</div>}

        {docs && (
          <>
            <DocSection
              title="My documents"
              empty="You don't own any documents yet. Create one or import a file to get started."
              docs={docs.owned}
              renderMeta={(d) => (
                <>
                  {d.shareCount ? (
                    <span className="pill">
                      <Users size={12} /> Shared with {d.shareCount}
                    </span>
                  ) : (
                    <span className="pill pill-quiet">Private</span>
                  )}
                  <span>Edited {timeAgo(d.updatedAt)}{d.updatedBy && d.updatedBy.id !== user?.id ? ` by ${firstName(d.updatedBy.name)}` : ''}</span>
                </>
              )}
              renderAction={(d) => (
                <button className="icon-btn danger" onClick={() => remove(d)} aria-label={`Delete ${d.title}`} title="Delete">
                  <Trash2 size={16} />
                </button>
              )}
            />
            <DocSection
              title="Shared with me"
              empty="Nothing has been shared with you yet. Switch to another demo account and share a document with yourself."
              docs={docs.shared}
              renderMeta={(d) => (
                <>
                  <span className={`pill ${d.role === 'editor' ? 'pill-edit' : 'pill-view'}`}>{roleLabel[d.role]}</span>
                  <span className="owner-inline">
                    <Avatar user={d.owner} size={16} /> {d.owner.name}
                  </span>
                  <span>Edited {timeAgo(d.updatedAt)}</span>
                </>
              )}
            />
          </>
        )}
      </main>

      {dragging && (
        <div className="drop-overlay">
          <div>
            <FileUp size={32} />
            <p>Drop to import as a new document</p>
            <p className="small">{SUPPORTED_UPLOADS_LABEL}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function DocSection(props: {
  title: string;
  empty: string;
  docs: DocListItem[];
  renderMeta: (d: DocListItem) => ReactNode;
  renderAction?: (d: DocListItem) => ReactNode;
}) {
  return (
    <section className="doc-section">
      <h2>
        {props.title} <span className="count">{props.docs.length}</span>
      </h2>
      {props.docs.length === 0 ? (
        <div className="empty">{props.empty}</div>
      ) : (
        <ul className="doc-list">
          {props.docs.map((d) => (
            <li key={d.id} className="doc-row">
              <Link to={`/d/${d.id}`} className="doc-link">
                <FileText size={20} className="doc-icon" />
                <div className="doc-text">
                  <div className="doc-title">{d.title}</div>
                  <div className="doc-snippet">{d.snippet || <em>Empty document</em>}</div>
                  <div className="doc-meta">{props.renderMeta(d)}</div>
                </div>
              </Link>
              {props.renderAction && <div className="doc-action">{props.renderAction(d)}</div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
