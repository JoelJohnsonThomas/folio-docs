import { useEffect, useRef, useState } from 'react';
import { LogOut, Repeat } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import type { User } from '../types';
import { Avatar } from './Avatar';
import { useToast } from './Toast';

/** Avatar dropdown with one-click account switching, so reviewers can test sharing quickly. */
export function UserMenu() {
  const { user, login, logout } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    api.users().then(setUsers).catch(() => setUsers([]));
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  const switchTo = async (u: User) => {
    setOpen(false);
    try {
      await login(u.email);
      toast(`Signed in as ${u.name}`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not switch account', 'error');
    }
  };

  return (
    <div className="user-menu" ref={ref}>
      <button className="avatar-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <Avatar user={user} size={32} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-header">
            <Avatar user={user} size={36} />
            <div>
              <div className="menu-name">{user.name}</div>
              <div className="muted small">{user.email}</div>
            </div>
          </div>
          <div className="menu-label">
            <Repeat size={12} /> Switch demo account
          </div>
          {users
            .filter((u) => u.id !== user.id)
            .map((u) => (
              <button key={u.id} className="menu-item" role="menuitem" onClick={() => switchTo(u)}>
                <Avatar user={u} size={22} />
                <span>{u.name}</span>
              </button>
            ))}
          <div className="menu-sep" />
          <button className="menu-item" role="menuitem" onClick={() => void logout()}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
