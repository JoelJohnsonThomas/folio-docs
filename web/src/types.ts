export interface User {
  id: string;
  name: string;
  email: string;
  color: string;
}

export type Role = 'owner' | 'editor' | 'viewer';
export type ShareRole = Exclude<Role, 'owner'>;

export interface DocMeta {
  id: string;
  title: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  updatedBy: User | null;
  owner: User;
  role: Role;
}

export interface Doc extends DocMeta {
  content: string;
}

export interface DocListItem extends DocMeta {
  snippet: string;
  shareCount?: number;
}

export interface AccessList {
  owner: User;
  shares: { user: User; role: ShareRole }[];
}
