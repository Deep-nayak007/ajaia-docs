export type Role = 'owner' | 'editor' | 'viewer';

export interface User {
  id: number;
  email: string;
  name: string;
}

export interface DocumentSummary {
  id: string;
  title: string;
  role: Role;
  owner: User;
  updatedAt: number;
}

export interface DocumentFull extends DocumentSummary {
  contentHtml: string;
  version: number;
  createdAt: number;
  updatedBy: { id: number; name: string } | null;
}

export interface ShareEntry {
  userId: number;
  name: string;
  email: string;
  role: 'viewer' | 'editor';
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(`/api${url}`, init);
  } catch {
    throw new ApiError(0, 'Network error. Check your connection and try again.');
  }
  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`, data);
  return data as T;
}

function fileForm(file: File): FormData {
  const form = new FormData();
  form.append('file', file);
  return form;
}

export const api = {
  me: () => request<{ user: User | null }>('GET', '/auth/me'),
  login: (email: string, password: string) => request<{ user: User }>('POST', '/auth/login', { email, password }),
  logout: () => request<void>('POST', '/auth/logout'),

  listDocuments: () => request<{ owned: DocumentSummary[]; shared: DocumentSummary[] }>('GET', '/documents'),
  createDocument: (title?: string) => request<DocumentFull>('POST', '/documents', title ? { title } : {}),
  importDocument: (file: File) => request<DocumentFull>('POST', '/documents/import', fileForm(file)),
  convertFile: (file: File) => request<{ contentHtml: string }>('POST', '/convert', fileForm(file)),
  getDocument: (id: string) => request<DocumentFull>('GET', `/documents/${id}`),
  updateDocument: (id: string, changes: { title?: string; contentHtml?: string; baseVersion?: number }) =>
    request<DocumentFull>('PATCH', `/documents/${id}`, changes),
  deleteDocument: (id: string) => request<void>('DELETE', `/documents/${id}`),

  listShares: (id: string) => request<{ shares: ShareEntry[] }>('GET', `/documents/${id}/shares`),
  share: (id: string, email: string, role: 'viewer' | 'editor') =>
    request<{ shares: ShareEntry[] }>('POST', `/documents/${id}/shares`, { email, role }),
  unshare: (id: string, userId: number) => request<{ shares: ShareEntry[] }>('DELETE', `/documents/${id}/shares/${userId}`),
};

export const SUPPORTED_UPLOADS = '.txt,.md,.markdown,.docx';
export const SUPPORTED_UPLOADS_LABEL = '.txt, .md or .docx, up to 2 MB';

export function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}
