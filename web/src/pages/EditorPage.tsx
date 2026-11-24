import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { AlertTriangle, ArrowLeft, Check, CloudOff, Download, Eye, Loader2, Lock, Share2 } from 'lucide-react';
import { ApiError, api, SUPPORTED_UPLOADS } from '../api';
import { useAuth } from '../auth';
import type { Doc, User } from '../types';
import { firstName, timeAgo } from '../format';
import { useAutosave, type SaveStatus } from '../useAutosave';
import { exportHtml, exportMarkdown } from '../exporters';
import { Logo } from '../components/Logo';
import { ShareDialog } from '../components/ShareDialog';
import { Toolbar } from '../components/Toolbar';
import { UserMenu } from '../components/UserMenu';
import { useToast } from '../components/Toast';

const POLL_MS = 8000;

export function EditorPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    setDoc(null);
    setError(null);
    api
      .getDoc(id)
      .then(setDoc)
      .catch((e) => setError(e instanceof ApiError ? e : new ApiError(0, 'unknown', String(e))));
  }, [id, user?.id]);

  if (error) return <DocError error={error} />;
  if (!doc || !user) {
    return (
      <div className="center-screen muted">
        <Loader2 className="spin" size={20} /> Loading document…
      </div>
    );
  }
  return <DocumentView key={`${doc.id}:${user.id}`} initial={doc} me={user} />;
}

function DocError({ error }: { error: ApiError }) {
  const notFound = error.status === 404;
  return (
    <div className="docs-page">
      <header className="app-header">
        <Link to="/" className="brand">
          <Logo withText />
        </Link>
        <div className="spacer" />
        <UserMenu />
      </header>
      <div className="error-state">
        <Lock size={32} />
        <h1>{notFound ? "You don't have access to this document" : 'Could not open this document'}</h1>
        <p className="muted">
          {notFound
            ? 'It may have been deleted, or it has not been shared with this account. Try switching accounts from the avatar menu.'
            : error.message}
        </p>
        <Link to="/" className="btn btn-primary">
          Back to documents
        </Link>
      </div>
    </div>
  );
}

function DocumentView({ initial, me }: { initial: Doc; me: User }) {
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const canEdit = initial.role !== 'viewer';

  const [title, setTitle] = useState(initial.title);
  const [savedTitle, setSavedTitle] = useState(initial.title);
  const [lastEdit, setLastEdit] = useState({ at: initial.updatedAt, by: initial.updatedBy });
  const [remoteNotice, setRemoteNotice] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [inserting, setInserting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastHtml = useRef(initial.content);
  const markDirtyRef = useRef<() => void>(() => {});

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: !canEdit, autolink: true },
      }),
      Placeholder.configure({ placeholder: canEdit ? 'Start writing…' : 'This document is empty.' }),
    ],
    content: initial.content,
    editable: canEdit,
    editorProps: { attributes: { class: 'doc-content', spellcheck: 'true', 'aria-label': 'Document body' } },
    onUpdate: () => markDirtyRef.current(),
  });

  const getHtml = useCallback(() => {
    if (editor && !editor.isDestroyed) lastHtml.current = editor.getHTML();
    return lastHtml.current;
  }, [editor]);

  const autosave = useAutosave(initial.id, initial.version, getHtml, canEdit);
  const { actions } = autosave;
  markDirtyRef.current = actions.markDirty;

  // Focus the title on brand-new documents.
  useEffect(() => {
    if ((location.state as { focusTitle?: boolean } | null)?.focusTitle) {
      titleRef.current?.select();
      navigate('.', { replace: true, state: null });
    }
  }, [location.state, navigate]);

  // Cmd/Ctrl+S saves immediately instead of opening the browser's save dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (canEdit) void actions.saveNow();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions, canEdit]);

  const applyServerDoc = useCallback(
    (fresh: Doc) => {
      if (!editor) return;
      const { from, to } = editor.state.selection;
      editor.commands.setContent(fresh.content, { emitUpdate: false });
      const max = editor.state.doc.content.size;
      editor.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) });
      lastHtml.current = fresh.content;
      actions.reset(fresh.version);
      setLastEdit({ at: fresh.updatedAt, by: fresh.updatedBy });
    },
    [editor, actions],
  );

  // Lightweight "live" updates: while you have no unsaved edits, pull in
  // changes other people saved. (Not real-time co-editing; see README.)
  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (document.hidden || !actions.isIdle()) return;
      try {
        const fresh = await api.getDoc(initial.id);
        if (fresh.version > actions.currentVersion() && actions.isIdle()) {
          applyServerDoc(fresh);
          if (fresh.updatedBy && fresh.updatedBy.id !== me.id) {
            setRemoteNotice(`${firstName(fresh.updatedBy.name)} updated this document`);
            window.setTimeout(() => setRemoteNotice(null), 5000);
          }
        }
        if (document.activeElement !== titleRef.current) {
          setTitle(fresh.title);
          setSavedTitle(fresh.title);
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          toast('Your access to this document was removed.', 'error');
          navigate('/');
        }
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [actions, applyServerDoc, initial.id, me.id, navigate, toast]);

  useEffect(() => {
    if (autosave.lastSavedAt) setLastEdit({ at: autosave.lastSavedAt, by: me });
  }, [autosave.lastSavedAt, me]);

  const commitTitle = async () => {
    const next = title.replace(/\s+/g, ' ').trim() || 'Untitled document';
    if (next === savedTitle) {
      setTitle(next);
      return;
    }
    try {
      const meta = await api.renameDoc(initial.id, next);
      setTitle(meta.title);
      setSavedTitle(meta.title);
    } catch (e) {
      setTitle(savedTitle);
      toast(e instanceof Error ? e.message : 'Rename failed', 'error');
    }
  };

  const loadTheirs = async () => {
    try {
      applyServerDoc(await api.getDoc(initial.id));
      toast('Loaded the latest version', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load latest version', 'error');
    }
  };

  const insertFromFile = async (file: File | undefined) => {
    if (!file || !editor) return;
    setInserting(true);
    try {
      const { html } = await api.convertFile(file);
      editor.chain().focus().insertContent(html).run();
      toast(`Inserted "${file.name}"`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not insert file', 'error');
    } finally {
      setInserting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const ownerLabel = initial.role === 'owner' ? 'Owned by you' : `Owned by ${initial.owner.name}`;
  const lastEditLabel = `Edited ${timeAgo(lastEdit.at)}${lastEdit.by ? ` by ${lastEdit.by.id === me.id ? 'you' : firstName(lastEdit.by.name)}` : ''}`;

  return (
    <div className="editor-page">
      <header className="editor-header">
        <Link to="/" className="back-link" title="All documents" aria-label="Back to all documents">
          <ArrowLeft size={18} />
          <Logo size={26} />
        </Link>
        <div className="title-block">
          <input
            ref={titleRef}
            className="title-input"
            value={title}
            readOnly={!canEdit}
            maxLength={200}
            aria-label="Document title"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                editor?.commands.focus('start');
              } else if (e.key === 'Escape') {
                setTitle(savedTitle);
                e.currentTarget.blur();
              }
            }}
          />
          <div className="title-meta">
            <span>{ownerLabel}</span>
            {initial.role !== 'owner' && (
              <span className={`pill ${initial.role === 'editor' ? 'pill-edit' : 'pill-view'}`}>
                {initial.role === 'editor' ? 'You can edit' : 'View only'}
              </span>
            )}
            <span className="dot">·</span>
            <span>{lastEditLabel}</span>
          </div>
        </div>
        <div className="header-actions">
          {canEdit && <SaveIndicator status={autosave.status} error={autosave.error} onRetry={autosave.saveNow} />}
          <div className="export-menu">
            <button className="btn btn-ghost" onClick={() => setExportOpen((o) => !o)} aria-haspopup="menu" aria-expanded={exportOpen}>
              <Download size={16} /> Export
            </button>
            {exportOpen && (
              <div className="menu menu-right" role="menu" onMouseLeave={() => setExportOpen(false)}>
                <button className="menu-item" role="menuitem" onClick={() => { exportMarkdown(title, getHtml()); setExportOpen(false); }}>
                  Markdown (.md)
                </button>
                <button className="menu-item" role="menuitem" onClick={() => { exportHtml(title, getHtml()); setExportOpen(false); }}>
                  Web page (.html)
                </button>
                <button className="menu-item" role="menuitem" onClick={() => { setExportOpen(false); window.print(); }}>
                  Print / Save as PDF
                </button>
              </div>
            )}
          </div>
          <button className="btn btn-primary" onClick={() => setShareOpen(true)}>
            <Share2 size={16} /> Share
          </button>
          <UserMenu />
        </div>
      </header>

      {canEdit && editor && (
        <div className="toolbar-wrap">
          <Toolbar editor={editor} onInsertFile={() => fileRef.current?.click()} importing={inserting} />
          <input ref={fileRef} type="file" accept={SUPPORTED_UPLOADS} hidden onChange={(e) => void insertFromFile(e.target.files?.[0])} />
        </div>
      )}

      {!canEdit && (
        <div className="banner banner-info">
          <Eye size={16} /> You have view-only access. Ask {initial.owner.name} for edit access to make changes.
        </div>
      )}
      {autosave.conflict && (
        <div className="banner banner-warn" role="alert">
          <AlertTriangle size={16} />
          <span>
            {autosave.conflict.updatedBy ? firstName(autosave.conflict.updatedBy.name) : 'Someone'} saved a newer version{' '}
            {timeAgo(autosave.conflict.updatedAt)}. Your recent edits haven't been saved.
          </span>
          <div className="spacer" />
          <button className="btn btn-sm" onClick={loadTheirs}>
            Discard mine &amp; load theirs
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => void autosave.overwrite()}>
            Keep mine (overwrite)
          </button>
        </div>
      )}
      {remoteNotice && <div className="banner banner-quiet">{remoteNotice}</div>}

      <main className="page-scroll" onClick={(e) => e.target === e.currentTarget && editor?.commands.focus('end')}>
        <article className="page">
          <EditorContent editor={editor} />
        </article>
      </main>

      {shareOpen && (
        <ShareDialog
          docId={initial.id}
          docTitle={title}
          myRole={initial.role}
          me={me}
          onClose={() => setShareOpen(false)}
          onLeft={() => navigate('/')}
        />
      )}
    </div>
  );
}

function SaveIndicator({ status, error, onRetry }: { status: SaveStatus; error: string | null; onRetry: () => void }) {
  switch (status) {
    case 'saved':
      return (
        <span className="save-status ok">
          <Check size={15} /> Saved
        </span>
      );
    case 'dirty':
      return <span className="save-status">Unsaved changes</span>;
    case 'saving':
      return (
        <span className="save-status">
          <Loader2 size={15} className="spin" /> Saving…
        </span>
      );
    case 'conflict':
      return (
        <span className="save-status warn">
          <AlertTriangle size={15} /> Not saved: conflict
        </span>
      );
    case 'error':
      return (
        <span className="save-status err" title={error ?? undefined}>
          <CloudOff size={15} /> Couldn't save{' '}
          <button className="link-btn" onClick={onRetry}>
            Retry
          </button>
        </span>
      );
  }
}
