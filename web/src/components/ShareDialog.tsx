import { useEffect, useRef, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { api } from '../api';
import type { AccessList, Role, ShareRole, User } from '../types';
import { roleLabel } from '../format';
import { Avatar } from './Avatar';
import { useToast } from './Toast';

interface Props {
  docId: string;
  docTitle: string;
  myRole: Role;
  me: User;
  onClose: () => void;
  onLeft: () => void;
}

export function ShareDialog({ docId, docTitle, myRole, me, onClose, onLeft }: Props) {
  const toast = useToast();
  const isOwner = myRole === 'owner';
  const [access, setAccess] = useState<AccessList | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ShareRole>('editor');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
    api.getAccess(docId).then(setAccess).catch((e) => setError(e.message));
    if (isOwner) api.users().then(setUsers).catch(() => undefined);
  }, [docId, isOwner]);

  const run = async (fn: () => Promise<AccessList>, success?: string) => {
    setBusy(true);
    setError(null);
    try {
      setAccess(await fn());
      if (success) toast(success, 'success');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const target = email.trim();
    if (!target) return setError('Enter the email of the person to share with.');
    if (await run(() => api.share(docId, target, role), `Shared with ${target}`)) setEmail('');
  };

  const leave = async () => {
    if (!window.confirm('Remove your own access to this document?')) return;
    try {
      await api.unshare(docId, me.id);
      toast('You left the document', 'success');
      onLeft();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not leave');
    }
  };

  const sharedIds = new Set([access?.owner.id, ...(access?.shares.map((s) => s.user.id) ?? [])]);
  const suggestions = users.filter((u) => !sharedIds.has(u.id));

  return (
    <dialog ref={dialogRef} className="dialog" onClose={onClose} onClick={(e) => e.target === dialogRef.current && onClose()}>
      <div className="dialog-body">
        <div className="dialog-head">
          <h2>Share “{docTitle}”</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {isOwner ? (
          <form className="share-form" onSubmit={submit}>
            <input
              type="email"
              list="share-suggestions"
              placeholder="Add people by email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              aria-label="Email address"
            />
            <datalist id="share-suggestions">
              {suggestions.map((u) => (
                <option key={u.id} value={u.email}>
                  {u.name}
                </option>
              ))}
            </datalist>
            <select value={role} onChange={(e) => setRole(e.target.value as ShareRole)} aria-label="Access level">
              <option value="editor">Can edit</option>
              <option value="viewer">Can view</option>
            </select>
            <button className="btn btn-primary" disabled={busy}>
              Share
            </button>
          </form>
        ) : (
          <p className="muted small">Only the owner can change who has access.</p>
        )}
        {isOwner && suggestions.length > 0 && (
          <p className="muted small hint">
            Demo accounts: {suggestions.map((u) => u.email).join(', ')}
          </p>
        )}

        {error && <div className="alert alert-error">{error}</div>}

        <h3 className="access-heading">People with access</h3>
        {!access ? (
          <div className="muted small">Loading…</div>
        ) : (
          <ul className="access-list">
            <li>
              <Avatar user={access.owner} size={32} />
              <div className="access-who">
                <div>
                  {access.owner.name} {access.owner.id === me.id && <span className="muted">(you)</span>}
                </div>
                <div className="muted small">{access.owner.email}</div>
              </div>
              <span className="muted small">Owner</span>
            </li>
            {access.shares.map(({ user, role: r }) => (
              <li key={user.id}>
                <Avatar user={user} size={32} />
                <div className="access-who">
                  <div>
                    {user.name} {user.id === me.id && <span className="muted">(you)</span>}
                  </div>
                  <div className="muted small">{user.email}</div>
                </div>
                {isOwner ? (
                  <select
                    value={r}
                    disabled={busy}
                    aria-label={`Access for ${user.name}`}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === 'remove') void run(() => api.unshare(docId, user.id), `Removed ${user.name}`);
                      else void run(() => api.share(docId, user.email, value as ShareRole), `${user.name} can now ${value === 'editor' ? 'edit' : 'view'}`);
                    }}
                  >
                    <option value="editor">Can edit</option>
                    <option value="viewer">Can view</option>
                    <option value="remove">Remove access</option>
                  </select>
                ) : (
                  <span className="muted small">{roleLabel[r]}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {access && access.shares.length === 0 && <p className="muted small">Not shared with anyone yet.</p>}

        <div className="dialog-foot">
          {!isOwner && (
            <button className="btn btn-danger-quiet" onClick={leave}>
              Remove my access
            </button>
          )}
          <div className="spacer" />
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </dialog>
  );
}
