import type { AccessList, Doc, DocListItem, DocMeta, ShareRole, User } from './types';

export class ApiError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;
  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let onUnauthorized: (() => void) | null = null;
/** Lets the auth layer react when a session expires mid-use. */
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin' };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError(0, 'network', 'Network error. Check your connection and try again.');
  }
  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized?.();
    const err = data?.error ?? {};
    throw new ApiError(res.status, err.code ?? 'unknown', err.message ?? `Request failed (${res.status}).`, err);
  }
  return data as T;
}

function fileForm(file: File) {
  const form = new FormData();
  form.append('file', file);
  return form;
}

export const api = {
  me: () => request<User>('GET', '/auth/me'),
  login: (email: string) => request<User>('POST', '/auth/login', { email }),
  logout: () => request<void>('POST', '/auth/logout'),
  users: () => request<User[]>('GET', '/users'),

  listDocs: () => request<{ owned: DocListItem[]; shared: DocListItem[] }>('GET', '/documents'),
  createDoc: (title?: string) => request<Doc>('POST', '/documents', { title }),
  importDoc: (file: File) => request<Doc>('POST', '/documents/import', fileForm(file)),
  convertFile: (file: File) => request<{ title: string; html: string }>('POST', '/convert', fileForm(file)),
  getDoc: (id: string) => request<Doc>('GET', `/documents/${id}`),
  renameDoc: (id: string, title: string) => request<DocMeta>('PATCH', `/documents/${id}`, { title }),
  saveContent: (id: string, content: string, baseVersion: number, force = false) =>
    request<DocMeta>('PATCH', `/documents/${id}`, force ? { content, force } : { content, baseVersion }),
  deleteDoc: (id: string) => request<void>('DELETE', `/documents/${id}`),

  getAccess: (id: string) => request<AccessList>('GET', `/documents/${id}/shares`),
  share: (id: string, email: string, role: ShareRole) =>
    request<AccessList>('POST', `/documents/${id}/shares`, { email, role }),
  unshare: (id: string, userId: string) => request<AccessList>('DELETE', `/documents/${id}/shares/${userId}`),
};

export const SUPPORTED_UPLOADS = '.txt,.md,.markdown,.docx';
export const SUPPORTED_UPLOADS_LABEL = '.txt, .md or .docx (max 5 MB)';
